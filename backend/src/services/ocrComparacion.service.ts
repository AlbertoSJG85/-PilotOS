/**
 * OCR Comparacion Service — Compara datos del OCR con los declarados en el parte.
 *
 * Dos sumideros para el mismo hecho:
 *   1. Anomalia (tabla `pilotos.anomalias`) → traza de auditoría para el patrón.
 *   2. ocr_datos_extraidos.discrepancias en el Documento → aviso suave al usuario
 *      en la pantalla de detalle del parte. NO bloquea el envío.
 *
 * Reglas:
 *   1. Taxímetro: P Total vs ingreso_bruto. Tolerancia ±3 €.
 *   2. Distancia: P Dist.Total vs km_fin-km_inicio. Tolerancia ±6 km.
 *   3. Borrados: acum_borrados actual vs ticket anterior del mismo vehículo.
 *      Incremento > 1 o decremento → Anomalia CRITICA (manipulación posible).
 *   4. Combustible: suma OCR de tickets vs combustible declarado. Tolerancia ±0.50 €.
 *   5. Fecha: fecha del ticket vs fecha_trabajada del parte. Tolerancia ±1 día
 *      (turnos nocturnos cruzan medianoche, el ticket puede salir al día siguiente).
 *
 * Si el OCR no extrae un campo (campo undefined), no se compara — no es un fallo.
 */
import { prisma } from '../lib/prisma';
import type { DatosTaximetro } from './ocr.service';

const TOLERANCIA_TAXIMETRO_EUR = 3;
const TOLERANCIA_KM = 6;
const TOLERANCIA_GASOIL_EUR = 0.5;
const TOLERANCIA_FECHA_DIAS = 1;

export type CampoDiscrepancia = 'total' | 'km' | 'fecha' | 'combustible' | 'borrados';
export type SeveridadDiscrepancia = 'NORMAL' | 'CRITICA';

export interface Discrepancia {
    campo: CampoDiscrepancia;
    severidad: SeveridadDiscrepancia;
    declarado: string | number;
    detectado: string | number;
    diff?: string | number;
    mensaje: string;
}

export interface ResultadoComparacion {
    discrepancias_por_doc: Record<string, Discrepancia[]>;
    discrepancias_combustible: Discrepancia[];
    total_discrepancias: number;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function leerDatosTaximetro(json: unknown): DatosTaximetro | null {
    if (!json || typeof json !== 'object') return null;
    return json as DatosTaximetro;
}

interface DatosGasoil {
    fecha?: string;
    importe?: number;
    valido?: boolean;
}

function leerDatosGasoil(json: unknown): DatosGasoil | null {
    if (!json || typeof json !== 'object') return null;
    const j = json as any;
    return {
        fecha: typeof j.fecha === 'string' ? j.fecha : undefined,
        importe: typeof j.importe === 'number' ? j.importe : undefined,
        valido: !!j.valido,
    };
}

/**
 * Convierte "DD/MM/YYYY" a Date UTC, o null si no se puede parsear.
 */
function parsearFechaTicket(fecha: string | undefined): Date | null {
    if (!fecha) return null;
    const m = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d));
}

function diffDias(a: Date, b: Date): number {
    return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function formatFecha(d: Date): string {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// ─────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────

export async function compararDocumentosConParte(parte_diario_id: string): Promise<ResultadoComparacion> {
    const parte = await prisma.parteDiario.findUnique({
        where: { id: parte_diario_id },
        include: { documentos: { include: { documento: true } } },
    });

    const resultado: ResultadoComparacion = {
        discrepancias_por_doc: {},
        discrepancias_combustible: [],
        total_discrepancias: 0,
    };
    if (!parte) return resultado;

    // Idempotencia: borramos las anomalías previas de comparación OCR para
    // este parte antes de recalcular. Las únicas anomalías que escribe este
    // servicio son las generadas aquí, así que es seguro vaciarlas. Esto
    // permite que el endpoint /api/fotos (patrón) o /confirmar (asalariado)
    // recalculen sin acumular duplicados.
    await prisma.anomalia.deleteMany({ where: { parte_diario_id: parte.id } });

    const ingresoDeclarado = Number(parte.ingreso_bruto || 0);
    const combustibleDeclarado = parte.combustible ? Number(parte.combustible) : 0;
    const kmDiario = parte.km_fin - parte.km_inicio;
    const fechaParte = parte.fecha_trabajada;

    const docsTaxi = parte.documentos
        .map((e) => e.documento)
        .filter((d) => d.tipo === 'TICKET_TAXIMETRO' && d.estado !== 'BLOQUEADO');

    const docsGasoil = parte.documentos
        .map((e) => e.documento)
        .filter((d) => (d.tipo === 'TICKET_GASOIL' || d.tipo === 'TICKET_COMBUSTIBLE') && d.estado !== 'BLOQUEADO');

    // ── Taxímetro ──
    for (const doc of docsTaxi) {
        const datos = leerDatosTaximetro(doc.ocr_datos_extraidos);
        if (!datos) continue;
        const discrepancias: Discrepancia[] = [];

        // 1. Total
        const pTotal = datos.parc_total ?? datos.importe;
        if (pTotal !== undefined && ingresoDeclarado > 0) {
            const diff = Math.abs(pTotal - ingresoDeclarado);
            if (diff > TOLERANCIA_TAXIMETRO_EUR) {
                const d: Discrepancia = {
                    campo: 'total',
                    severidad: 'NORMAL',
                    declarado: ingresoDeclarado,
                    detectado: pTotal,
                    diff: Number(diff.toFixed(2)),
                    mensaje: `El total del parte (${ingresoDeclarado.toFixed(2)} €) no coincide con el P Total del ticket (${pTotal.toFixed(2)} €). Diferencia: ${diff.toFixed(2)} €.`,
                };
                discrepancias.push(d);
                await crearAnomalia(parte.conductor_id, d.mensaje, parte.id, doc.id, 'NORMAL');
            }
        }

        // 2. Km
        if (datos.parc_dist_total !== undefined && kmDiario > 0) {
            const diff = Math.abs(datos.parc_dist_total - kmDiario);
            if (diff > TOLERANCIA_KM) {
                const d: Discrepancia = {
                    campo: 'km',
                    severidad: 'NORMAL',
                    declarado: kmDiario,
                    detectado: datos.parc_dist_total,
                    diff: Number(diff.toFixed(1)),
                    mensaje: `Los km del parte (${kmDiario} km) no coinciden con la P Dist.Total del ticket (${datos.parc_dist_total} km). Diferencia: ${diff.toFixed(1)} km.`,
                };
                discrepancias.push(d);
                await crearAnomalia(parte.conductor_id, d.mensaje, parte.id, doc.id, 'NORMAL');
            }
        }

        // 3. Fecha
        const fechaTicket = parsearFechaTicket(datos.fecha);
        if (fechaTicket) {
            const dias = diffDias(fechaTicket, fechaParte);
            if (dias > TOLERANCIA_FECHA_DIAS) {
                const d: Discrepancia = {
                    campo: 'fecha',
                    severidad: 'NORMAL',
                    declarado: formatFecha(fechaParte),
                    detectado: datos.fecha!,
                    diff: `${dias.toFixed(0)} días`,
                    mensaje: `La fecha del parte (${formatFecha(fechaParte)}) no coincide con la fecha del ticket (${datos.fecha}). ¿Estás subiendo el ticket del día correcto?`,
                };
                discrepancias.push(d);
                await crearAnomalia(parte.conductor_id, d.mensaje, parte.id, doc.id, 'NORMAL');
            }
        }

        // 4. Borrados (Anomalia CRITICA, también discrepancia visible)
        if (datos.acum_borrados !== undefined) {
            const discBorrados = await compararBorrados(parte, doc.id, datos.acum_borrados);
            if (discBorrados) discrepancias.push(discBorrados);
        }

        // Persistir discrepancias en el documento
        if (discrepancias.length > 0) {
            resultado.discrepancias_por_doc[doc.id] = discrepancias;
        }
        const datosActualizados = { ...datos, discrepancias };
        await prisma.documento.update({
            where: { id: doc.id },
            data: { ocr_datos_extraidos: datosActualizados as any },
        });
    }

    // ── Combustible ──
    if (combustibleDeclarado > 0 && docsGasoil.length > 0) {
        let sumaOcr = 0;
        let tieneAlguno = false;
        for (const doc of docsGasoil) {
            const d = leerDatosGasoil(doc.ocr_datos_extraidos);
            if (d?.importe) { sumaOcr += d.importe; tieneAlguno = true; }
        }
        const discrepanciasCombustible: Discrepancia[] = [];
        if (tieneAlguno) {
            const diff = Math.abs(sumaOcr - combustibleDeclarado);
            if (diff > TOLERANCIA_GASOIL_EUR) {
                const d: Discrepancia = {
                    campo: 'combustible',
                    severidad: 'NORMAL',
                    declarado: combustibleDeclarado,
                    detectado: sumaOcr,
                    diff: Number(diff.toFixed(2)),
                    mensaje: `El combustible declarado (${combustibleDeclarado.toFixed(2)} €) no coincide con la suma de los tickets (${sumaOcr.toFixed(2)} €, ${docsGasoil.length} ticket(s)). Diferencia: ${diff.toFixed(2)} €.`,
                };
                discrepanciasCombustible.push(d);
                resultado.discrepancias_combustible.push(d);
                await crearAnomalia(parte.conductor_id, d.mensaje, parte.id, undefined, 'NORMAL');
            }
        }

        // Fecha por ticket de gasoil
        for (const doc of docsGasoil) {
            const d = leerDatosGasoil(doc.ocr_datos_extraidos);
            const discrepancias: Discrepancia[] = [];
            const fechaTicket = parsearFechaTicket(d?.fecha);
            if (fechaTicket) {
                const dias = diffDias(fechaTicket, fechaParte);
                if (dias > TOLERANCIA_FECHA_DIAS) {
                    const disc: Discrepancia = {
                        campo: 'fecha',
                        severidad: 'NORMAL',
                        declarado: formatFecha(fechaParte),
                        detectado: d!.fecha!,
                        diff: `${dias.toFixed(0)} días`,
                        mensaje: `La fecha del parte (${formatFecha(fechaParte)}) no coincide con la fecha del ticket de combustible (${d!.fecha}).`,
                    };
                    discrepancias.push(disc);
                    await crearAnomalia(parte.conductor_id, disc.mensaje, parte.id, doc.id, 'NORMAL');
                }
            }
            // Atajo: si hay discrepancia de suma, marcarla también en cada doc gasoil para
            // que el usuario vea el aviso al lado del ticket concreto.
            const todas = [...discrepancias, ...discrepanciasCombustible];
            if (todas.length > 0) {
                resultado.discrepancias_por_doc[doc.id] = todas;
            }
            await prisma.documento.update({
                where: { id: doc.id },
                data: { ocr_datos_extraidos: { ...(d ?? {}), discrepancias: todas } as any },
            });
        }
    }

    resultado.total_discrepancias =
        Object.values(resultado.discrepancias_por_doc).reduce((acc, arr) => acc + arr.length, 0) +
        resultado.discrepancias_combustible.length;

    return resultado;
}

// ─────────────────────────────────────────────────────────
// Comparación de Borrados con el ticket anterior (devuelve discrepancia si la hay)
// ─────────────────────────────────────────────────────────

async function compararBorrados(
    parte: { id: string; vehiculo_id: string; fecha_trabajada: Date; conductor_id: string },
    docId: string,
    borradosActual: number,
): Promise<Discrepancia | null> {
    const parteAnterior = await prisma.parteDiario.findFirst({
        where: {
            vehiculo_id: parte.vehiculo_id,
            fecha_trabajada: { lt: parte.fecha_trabajada },
            estado: { in: ['ENVIADO', 'FOTO_SUSTITUIDA'] },
        },
        orderBy: { fecha_trabajada: 'desc' },
        include: { documentos: { include: { documento: true } } },
    });
    if (!parteAnterior) return null;

    const docAnterior = parteAnterior.documentos
        .map((e) => e.documento)
        .find((d) => d.tipo === 'TICKET_TAXIMETRO' && d.estado !== 'BLOQUEADO');
    if (!docAnterior) return null;

    const datosAnt = leerDatosTaximetro(docAnterior.ocr_datos_extraidos);
    if (datosAnt?.acum_borrados === undefined) return null;

    const diff = borradosActual - datosAnt.acum_borrados;
    let mensaje: string | null = null;
    if (diff < 0) {
        mensaje = `Borrados disminuyó: anterior ${datosAnt.acum_borrados} → actual ${borradosActual}. Posible reinicio del taxímetro.`;
    } else if (diff > 1) {
        mensaje = `Borrados aumentó ${diff} en un turno (anterior ${datosAnt.acum_borrados} → actual ${borradosActual}). Máximo esperado: +1.`;
    }
    if (!mensaje) return null;

    await crearAnomalia(parte.conductor_id, mensaje, parte.id, docId, 'CRITICA');
    return {
        campo: 'borrados',
        severidad: 'CRITICA',
        declarado: datosAnt.acum_borrados,
        detectado: borradosActual,
        diff,
        mensaje,
    };
}

// ─────────────────────────────────────────────────────────
// Anomalia (audit log)
// ─────────────────────────────────────────────────────────

async function crearAnomalia(
    conductor_id: string,
    descripcion: string,
    parte_diario_id?: string,
    documento_id?: string,
    tipo: 'NORMAL' | 'CRITICA' = 'NORMAL',
): Promise<void> {
    await prisma.anomalia.create({
        data: {
            conductor_id,
            tipo,
            descripcion,
            parte_diario_id: parte_diario_id ?? null,
            documento_id: documento_id ?? null,
        },
    });
}
