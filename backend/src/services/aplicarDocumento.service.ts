/**
 * Efectos de un documento del vehículo confirmado (2026-08-12).
 *
 * Cuando una persona confirma una ITV o una factura de taller, pasan dos
 * cosas y solo dos:
 *
 *   1. Los mantenimientos que ese documento resuelve quedan al día: nueva
 *      fecha y km de ejecución, siguiente vencimiento recalculado y avisos
 *      rearmados. Es exactamente lo que ya hacía `POST /mantenimientos/:id/
 *      resolver` — misma lógica, para no tener dos formas de poner al día un
 *      mantenimiento que se desincronicen con el tiempo.
 *   2. El importe, si lo hay, se convierte en un gasto con la factura
 *      enganchada.
 *
 * LO QUE NO PASA, y está en PilotOS_Master.md §5.3: el kilometraje oficial
 * del vehículo NO se toca. Sale del último parte diario. Una factura puede
 * ser de hace tres días y llegar hoy; si moviera el contador, lo movería
 * hacia atrás. Los km del documento se guardan como dato del documento y
 * sirven para fechar la ejecución del mantenimiento, nada más.
 *
 * Idempotencia: el documento guarda `aplicado_at`. Un documento no puede
 * reiniciar dos veces el mismo contador ni duplicar el gasto.
 */
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface DatosDocumentoConfirmados {
    /** DD/MM/YYYY — fecha del documento (inspección o emisión de la factura). */
    fecha?: string;
    /** DD/MM/YYYY — hasta cuándo vale (ITV, póliza). */
    valida_hasta?: string;
    importe?: number;
    matricula?: string;
    km_documento?: number;
    /** Nombres del catálogo de mantenimiento que este documento pone al día. */
    mantenimientos?: string[];
    descripcion?: string;
}

export interface ResultadoAplicacion {
    mantenimientos_actualizados: string[];
    gasto_id: string | null;
    avisos: string[];
}

export function parsearFechaEs(fecha?: string): Date | null {
    if (!fecha) return null;
    const m = fecha.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return isNaN(d.getTime()) ? null : d;
}

function sumarMeses(fecha: Date, meses: number): Date {
    const d = new Date(fecha);
    d.setMonth(d.getMonth() + meses);
    return d;
}

/**
 * Aplica el documento. Todo dentro de una transacción: o queda el
 * mantenimiento al día Y el gasto, o no queda nada. Un gasto sin su
 * mantenimiento actualizado (o al revés) es peor que no haber hecho nada,
 * porque nadie se entera de que falta la mitad.
 */
export async function aplicarDocumentoConfirmado(
    documentoId: string,
    datos: DatosDocumentoConfirmados,
    usuarioId: number,
    clienteId: string,
): Promise<ResultadoAplicacion> {
    const avisos: string[] = [];

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const doc = await tx.documento.findUnique({
            where: { id: documentoId },
            include: { vehiculo: true },
        });
        if (!doc) throw new Error('documento_no_encontrado');
        if (doc.aplicado_at) {
            // Ya se aplicó: no se repite. Devolvemos lo que hay para que la
            // pantalla no se quede colgada.
            return {
                mantenimientos_actualizados: [],
                gasto_id: doc.gasto_id,
                avisos: ['Este documento ya estaba aplicado.'],
            };
        }
        if (!doc.vehiculo_id || !doc.vehiculo) throw new Error('documento_sin_vehiculo');

        const fechaDoc = parsearFechaEs(datos.fecha) ?? new Date();
        const validaHasta = parsearFechaEs(datos.valida_hasta);
        // Para fechar la ejecución usamos los km del documento si los trae, y
        // si no, los oficiales. Nunca al revés: los del documento no suben al
        // vehículo (ver cabecera).
        const kmEjecucion = datos.km_documento ?? doc.vehiculo.km_actuales;

        const actualizados: string[] = [];
        // El vinculo documento->mantenimiento es 1:1 en el schema; si una
        // factura resuelve varios, se engancha al primero y el resto queda
        // trazado en su seguimiento.
        let primerMantenimientoId: string | null = null;
        for (const nombreCatalogo of datos.mantenimientos ?? []) {
            let mant = await tx.mantenimientoVehiculo.findFirst({
                where: {
                    vehiculo_id: doc.vehiculo_id,
                    activo: true,
                    catalogo: { nombre: nombreCatalogo },
                },
                include: { catalogo: true },
            });

            // Auto-sanar el enganche que falta (2026-08-13, C-071). Pasó de
            // verdad: se añadió "Tarjeta de transporte" al catálogo global el
            // mismo día que Alberto confirmó un documento de ese tipo, y su
            // vehículo (dado de alta antes) nunca recibió la fila de
            // mantenimiento_vehiculo correspondiente — solo el ONBOARDING la
            // crea. El documento se aplicó igualmente («APLICADO»,
            // silenciosamente sin tocar nada) y el mantenimiento no aparecía
            // en ningún sitio para poder anularlo o revisarlo. Aquí se crea
            // el enganche que falta con el catálogo (global o propio del
            // cliente) en vez de limitarse a avisar y no hacer nada — que es
            // lo que pasaba antes.
            if (!mant) {
                const catalogo = await tx.mantenimientoCatalogo.findFirst({
                    where: { nombre: nombreCatalogo, activo: true, OR: [{ cliente_id: null }, { cliente_id: clienteId }] },
                });
                if (!catalogo) {
                    avisos.push(`"${nombreCatalogo}" no existe en el catálogo de mantenimientos.`);
                    continue;
                }
                mant = await tx.mantenimientoVehiculo.create({
                    data: { vehiculo_id: doc.vehiculo_id, catalogo_id: catalogo.id },
                    include: { catalogo: true },
                });
                avisos.push(`"${nombreCatalogo}" no estaba dado de alta en este vehículo — se ha añadido.`);
            }

            const frecKm = mant.frecuencia_km_personalizada ?? mant.frecuencia_aprendida ?? mant.catalogo.frecuencia_km;
            const frecMeses = mant.frecuencia_meses_personalizada ?? mant.catalogo.frecuencia_meses;

            // La periodicidad del catálogo manda cuando existe: se calcula
            // desde la fecha del documento (2026-08-13, C-071 — antes era al
            // revés). El "válida hasta" que lee el OCR es, dos veces el mismo
            // día, el campo que peor sale: una cifra mal leída ahí ("2094"
            // por "2024") se colaba como vencimiento oficial aunque la
            // persona hubiera corregido la fecha de alta. Alberto lo dijo
            // directo: "yo doy la fecha de alta, el sistema calcula el
            // final". Solo se usa el "válida hasta" del documento cuando el
            // catálogo no tiene periodicidad propia (p. ej. "Inspecciones
            // municipales", que no tiene una cadencia fija).
            const proximaFecha = frecMeses ? sumarMeses(fechaDoc, frecMeses) : validaHasta;
            const proximoKm = frecKm ? kmEjecucion + frecKm : null;
            const tieneRecurrencia = proximoKm !== null || proximaFecha !== null;

            await tx.mantenimientoVehiculo.update({
                where: { id: mant.id },
                data: {
                    ultima_ejecucion_km: kmEjecucion,
                    ultima_ejecucion_fecha: fechaDoc,
                    proximo_km: proximoKm,
                    proxima_fecha: proximaFecha,
                    estado: tieneRecurrencia ? 'PENDIENTE' : 'RESUELTO',
                    // Ciclo nuevo: se rearman los avisos (si no, el próximo
                    // umbral no volvería a notificar nunca).
                    ultimo_nivel_aviso_km: null,
                    ultimo_nivel_aviso_dias: null,
                },
            });

            await tx.seguimientoMantenimiento.create({
                data: {
                    mantenimiento_vehiculo_id: mant.id,
                    accion: 'RESUELTO',
                    detalle: `${mant.catalogo.nombre} — según documento aportado`,
                    km_en_momento: kmEjecucion,
                },
            });

            if (!primerMantenimientoId) primerMantenimientoId = mant.id;
            actualizados.push(mant.catalogo.nombre);
        }

        let gastoId: string | null = null;
        if (datos.importe !== undefined && datos.importe > 0) {
            const gasto = await tx.gasto.create({
                data: {
                    cliente_id: clienteId,
                    vehiculo_id: doc.vehiculo_id,
                    tipo: 'MANTENIMIENTO',
                    descripcion: datos.descripcion
                        || (actualizados.length > 0 ? actualizados.join(', ') : 'Documento del vehículo'),
                    importe: datos.importe,
                    fecha: fechaDoc,
                    url_factura: doc.url,
                },
            });
            gastoId = gasto.id;
        }

        await tx.documento.update({
            where: { id: documentoId },
            data: {
                estado: 'APLICADO',
                aplicado_at: new Date(),
                gasto_id: gastoId,
                mantenimiento_vehiculo_id: primerMantenimientoId ?? undefined,
                confirmado_por: usuarioId,
            },
        });

        // Copia al Drive del cliente, si lo tiene conectado. FUERA del camino
        // crítico a propósito: sin await y con el fallo tragado. Que Google
        // esté caído no puede impedir que una factura entre en PilotOS.
        subirCopiaADrive(documentoId, clienteId, doc.url, doc.tipo, fechaDoc);

        return { mantenimientos_actualizados: actualizados, gasto_id: gastoId, avisos };
    });
}

/**
 * Copia el documento al Drive del cliente y guarda el enlace. Se llama sin
 * `await` desde `aplicarDocumentoConfirmado`: nunca debe retrasar ni romper
 * la aplicación del documento. Si falla, se anota en el log y ya está — el
 * documento sigue en PilotOS, que es lo que importa.
 */
function subirCopiaADrive(
    documentoId: string,
    clienteId: string,
    urlLocal: string,
    tipo: string,
    fecha: Date,
): void {
    (async () => {
        const { subirDocumentoADrive, driveDisponible } = await import('./drive.service');
        if (!driveDisponible()) return;

        const nombreFichero = urlLocal.split('?')[0].split('/').pop() ?? '';
        const rutaLocal = path.join(process.cwd(), 'uploads', nombreFichero);
        const nombreVisible = `${fecha.toISOString().slice(0, 10)} - ${tipo.replace(/_/g, ' ').toLowerCase()}`;

        const r = await subirDocumentoADrive(clienteId, rutaLocal, nombreVisible, tipo, fecha);
        if (r.ok && r.webViewLink) {
            await prisma.documento.update({
                where: { id: documentoId },
                data: { drive_web_link: r.webViewLink },
            });
        } else if (r.error && r.error !== 'sin_conexion_drive' && r.error !== 'drive_no_configurado') {
            // "No lo tiene conectado" no es un fallo: es lo normal.
            console.warn('[DRIVE] No se pudo subir el documento', documentoId, '->', r.error);
        }
    })().catch((e) => console.warn('[DRIVE] Subida en segundo plano fallida:', e?.message));
}
