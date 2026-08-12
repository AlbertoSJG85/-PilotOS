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
 *   3. Borrados (2026-08-11, rediseñado con Alberto a partir de un ticket real):
 *      acum_borrados actual vs ticket anterior del mismo vehículo. Los borrados
 *      NO se comparan contra "máximo +1 fijo" — se comparan contra el número de
 *      PARTES (turnos) declarados entre los dos tickets, porque cada inicio de
 *      turno reinicia el parcial y genera un borrado legítimo. Si sube más de
 *      lo que los partes explican, hay un borrado "extra": el vehículo se movió
 *      (taller, ITV, cambio de ruedas...) sin que ese movimiento esté declarado
 *      en ningún parte. Si ADEMÁS el importe acumulado tampoco cuadra con la
 *      suma de los partes de ese periodo, no es solo uso del vehículo: hubo
 *      trabajo que generó ingresos y no se declaró. Ver `compararAcumulados`.
 *   4. Combustible: suma OCR de tickets vs combustible declarado. Tolerancia ±0.50 €.
 *   5. Fecha: fecha del ticket vs fecha_trabajada del parte. Tolerancia ±1 día
 *      (turnos nocturnos cruzan medianoche, el ticket puede salir al día siguiente).
 *
 * Si el OCR no extrae un campo (campo undefined), no se compara — no es un fallo.
 *
 * REGLA DE ORO (2026-08-12, C-056): antes de acusar, comprobar que las cifras
 * son creíbles. El OCR se equivoca leyendo dígitos, y una cifra imposible
 * nunca puede terminar en un WhatsApp acusando a un conductor. Ver
 * `evaluarFiabilidadAcumulados` (plausibilidad física entre tickets) e
 * `importeTurnoTicket` (coherencia interna: Carreras + Suplementos = Total).
 */
import { prisma } from '../lib/prisma';
import type { DatosTaximetro } from './ocr.service';
import { enviarAvisoGloria } from './notificacion.service';
import { ESTADOS_ENVIADOS } from './retencionParte.service';


const TOLERANCIA_TAXIMETRO_EUR = 3;
const TOLERANCIA_KM = 6;
const TOLERANCIA_GASOIL_EUR = 0.5;
const TOLERANCIA_FECHA_DIAS = 1;

// Tolerancias para la comparación de ACUMULADOS entre tickets (borrados+km+€).
// Punto de partida razonable, no un número que Alberto haya fijado con datos
// reales todavía — ajustar aquí cuando haya experiencia con tickets reales.
const TOLERANCIA_KM_ACUMULADO = 20;
const TOLERANCIA_EUR_ACUMULADO = 5;

// ── Límites de plausibilidad física (2026-08-12, C-056) ────────────────
// El motor de acumulados se creía el OCR a pies juntillas: con un ticket
// real leído como "Borrados: 2937" (el ticket pone 297) y "Dist. Total:
// 1831080" (pone 183.108,0 — se perdió la coma), acusó al conductor de
// 2.640 borrados sin declarar y 1.648.004,9 km en dos días. Ningún dato
// imposible puede terminar en una acusación: si los acumulados no son
// físicamente plausibles, el fallo es de LECTURA, no del conductor.
const MAX_KM_POR_DIA = 1000;
const MAX_EUR_POR_DIA = 1500;
const MAX_BORRADOS_POR_DIA = 6;
const MARGEN_BORRADOS = 4;

// Con muchos días entre tickets, "borrados esperados = borrados anteriores +
// partes declarados" deja de ser concluyente: casi seguro que hubo turnos sin
// parte (o el sistema no estaba en uso). Se sigue informando, pero como aviso
// normal, sin acusación ni WhatsApp al patrón.
const MAX_DIAS_ENTRE_TICKETS = 15;

// Coherencia interna del turno: P Carreras + P Suplementos = P Total. Si no
// cuadra, alguna de las tres cifras se leyó mal.
const TOLERANCIA_COHERENCIA_EUR = 1;

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
// Fiabilidad de la lectura (C-056)
// ─────────────────────────────────────────────────────────

export interface FiabilidadAcumulados {
    /** false = el salto de borrados entre los dos tickets es imposible → no se compara nada. */
    borrados: boolean;
    /** false = el salto de km acumulados es imposible → no se usa como prueba. */
    km: boolean;
    /** false = el salto de importe acumulado es imposible → no se usa como prueba. */
    eur: boolean;
    motivos: string[];
}

/**
 * Un contador de taxímetro solo sube, y sube a un ritmo acotado por la
 * realidad física. Esta función NO decide si hay anomalía: decide si los
 * números leídos pueden servir de prueba. Función pura (testeable sin BD).
 *
 * Un campo ausente en cualquiera de los dos tickets se marca como no
 * utilizable — que el OCR no lo leyera no es culpa de nadie, pero tampoco
 * permite acusar.
 */
export function evaluarFiabilidadAcumulados(
    ant: DatosTaximetro,
    act: DatosTaximetro,
    diasEntreTickets: number,
): FiabilidadAcumulados {
    const dias = Math.max(1, diasEntreTickets);
    const motivos: string[] = [];

    let borrados = true;
    if (ant.acum_borrados === undefined || act.acum_borrados === undefined) {
        borrados = false;
        motivos.push('no se leyó el contador de borrados en uno de los dos tickets');
    } else {
        const salto = act.acum_borrados - ant.acum_borrados;
        const techo = MARGEN_BORRADOS + MAX_BORRADOS_POR_DIA * dias;
        if (salto < 0) {
            borrados = false;
            motivos.push(`el contador de borrados baja (${ant.acum_borrados} → ${act.acum_borrados}), y un contador de taxímetro no retrocede`);
        } else if (salto > techo) {
            borrados = false;
            motivos.push(`el contador de borrados sube ${salto} en ${dias} día(s) (${ant.acum_borrados} → ${act.acum_borrados}), imposible`);
        }
    }

    let km = true;
    if (ant.acum_dist_total === undefined || act.acum_dist_total === undefined) {
        km = false;
        motivos.push('no se leyó la distancia acumulada en uno de los dos tickets');
    } else {
        const salto = act.acum_dist_total - ant.acum_dist_total;
        if (salto < 0 || salto > MAX_KM_POR_DIA * dias) {
            km = false;
            motivos.push(`la distancia acumulada salta ${salto.toFixed(1)} km en ${dias} día(s), imposible`);
        }
    }

    let eur = true;
    if (ant.acum_total === undefined || act.acum_total === undefined) {
        eur = false;
        motivos.push('no se leyó el importe acumulado en uno de los dos tickets');
    } else {
        const salto = act.acum_total - ant.acum_total;
        if (salto < 0 || salto > MAX_EUR_POR_DIA * dias) {
            eur = false;
            motivos.push(`el importe acumulado salta ${salto.toFixed(2)} € en ${dias} día(s), imposible`);
        }
    }

    return { borrados, km, eur, motivos };
}

/**
 * Importe del turno según el ticket, con la coherencia interna comprobada:
 * P Carreras + P Suplementos tiene que dar P Total.
 *
 * Cuando no cuadra, la cifra que se descarta es P Total: son tres lecturas
 * independientes y dos que suman bien pesan más que una suelta. Caso real
 * del 2026-08-10: `P Carreras: 49.75` + `P Suplementos: 1.80` = 51,55 pero
 * `P Total: 91-55` (el 5 leído como 9). Comparando contra los 91,55 el
 * sistema levantaba una diferencia de 59,55 € que no existía — y comparando
 * contra 51,55 aparece la que sí existe: el parte declaraba 32 €.
 *
 * Devuelve null si no hay ninguna cifra utilizable.
 */
export function importeTurnoTicket(
    datos: DatosTaximetro,
): { valor: number; reconstruido: boolean } | null {
    const pTotal = datos.parc_total ?? datos.importe;
    const suma = datos.parc_carreras !== undefined && datos.parc_suplementos !== undefined
        ? datos.parc_carreras + datos.parc_suplementos
        : undefined;

    if (pTotal === undefined) {
        return suma !== undefined ? { valor: suma, reconstruido: true } : null;
    }
    if (suma === undefined) return { valor: pTotal, reconstruido: false };

    if (Math.abs(suma - pTotal) > TOLERANCIA_COHERENCIA_EUR) {
        return { valor: suma, reconstruido: true };
    }
    return { valor: pTotal, reconstruido: false };
}

// ─────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────

export async function compararDocumentosConParte(parte_diario_id: string): Promise<ResultadoComparacion> {
    const parte = await prisma.parteDiario.findUnique({
        where: { id: parte_diario_id },
        include: {
            documentos: { include: { documento: true } },
            // Necesario solo para el aviso de WhatsApp al patrón si aparece
            // una anomalía CRÍTICA (ver compararAcumulados / notificarPatron).
            vehiculo: {
                select: {
                    matricula: true,
                    cliente: { select: { id: true, patron: { select: { telefono: true } } } },
                },
            },
        },
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

        // 1. Total — con la coherencia interna del ticket comprobada (C-056).
        const importeTurno = importeTurnoTicket(datos);
        if (importeTurno !== null && ingresoDeclarado > 0) {
            const pTotal = importeTurno.valor;
            const diff = Math.abs(pTotal - ingresoDeclarado);
            if (diff > TOLERANCIA_TAXIMETRO_EUR) {
                const origen = importeTurno.reconstruido
                    ? `P Carreras + P Suplementos del ticket (${pTotal.toFixed(2)} €; el P Total impreso no cuadra con esas dos cifras, revisa la foto)`
                    : `el P Total del ticket (${pTotal.toFixed(2)} €)`;
                const d: Discrepancia = {
                    campo: 'total',
                    severidad: 'NORMAL',
                    declarado: ingresoDeclarado,
                    detectado: pTotal,
                    diff: Number(diff.toFixed(2)),
                    mensaje: `El total del parte (${ingresoDeclarado.toFixed(2)} €) no coincide con ${origen}. Diferencia: ${diff.toFixed(2)} €.`,
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

        // 4. Acumulados: borrados + km + € (Anomalia CRITICA + aviso WhatsApp al patrón)
        if (datos.acum_borrados !== undefined) {
            const discAcumulados = await compararAcumulados(parte, doc.id, datos, {
                matricula: parte.vehiculo.matricula,
                clienteId: parte.vehiculo.cliente.id,
                telefonoPatron: parte.vehiculo.cliente.patron.telefono,
            });
            if (discAcumulados) discrepancias.push(discAcumulados);
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
// Comparación de acumulados con el ticket anterior: borrados, km y €.
// Diseño acordado con Alberto el 2026-08-11 a partir de un ticket real.
// ─────────────────────────────────────────────────────────

interface ParteResumen {
    id: string;
    vehiculo_id: string;
    fecha_trabajada: Date;
    conductor_id: string;
}

/**
 * Busca el ticket de taxímetro más reciente anterior al de `parte`, para el
 * mismo vehículo. Devuelve también el parte al que iba adjunto, porque hace
 * falta su fecha para acotar el rango de partes "entre los dos tickets".
 */
async function buscarTicketAnterior(
    parte: ParteResumen,
): Promise<{ parteAnterior: ParteResumen; datosAnt: DatosTaximetro } | null> {
    const parteAnterior = await prisma.parteDiario.findFirst({
        where: {
            vehiculo_id: parte.vehiculo_id,
            fecha_trabajada: { lt: parte.fecha_trabajada },
            estado: { in: [...ESTADOS_ENVIADOS] },
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
    if (!datosAnt || datosAnt.acum_borrados === undefined) return null;

    return { parteAnterior, datosAnt };
}

/**
 * Compara el acumulado del ticket actual contra el del ticket anterior del
 * mismo vehículo, en tres pasos:
 *
 *   1. Borrados esperados = borrados del ticket anterior + nº de partes
 *      (turnos) declarados entre ambos tickets — cada turno reinicia el
 *      parcial y genera un borrado legítimo. Si el ticket trae MENOS
 *      borrados de los esperados → posible manipulación a la baja. Si trae
 *      MÁS → hay al menos un borrado que ningún parte explica, seguir a 2-3.
 *   2. Km sin declarar = (salto de acum_dist_total) − (suma de km de los
 *      partes de ese periodo). Por encima de tolerancia → el vehículo se
 *      movió más de lo que dicen los partes.
 *   3. € sin declarar = (salto de acum_total) − (suma de ingreso_bruto de
 *      esos partes). Si TAMBIÉN hay dinero sin justificar, no es solo uso
 *      del vehículo (taller, ITV...): hubo trabajo no declarado.
 */
interface ContextoAviso {
    matricula: string;
    clienteId: string;
    telefonoPatron: string | null;
}

async function compararAcumulados(
    parte: ParteResumen,
    docId: string,
    datosActual: DatosTaximetro,
    ctx: ContextoAviso,
): Promise<Discrepancia | null> {
    if (datosActual.acum_borrados === undefined) return null;

    const anterior = await buscarTicketAnterior(parte);
    if (!anterior) return null;
    const { parteAnterior, datosAnt } = anterior;

    // ── Filtro previo: ¿son creíbles las cifras leídas? (C-056) ──
    // Antes de esto, un dígito mal leído se convertía directamente en una
    // acusación de fraude por WhatsApp al patrón.
    const diasEntreTickets = Math.max(1, Math.round(diffDias(parte.fecha_trabajada, parteAnterior.fecha_trabajada)));
    const fiabilidad = evaluarFiabilidadAcumulados(datosAnt, datosActual, diasEntreTickets);

    if (!fiabilidad.borrados) {
        const mensaje = `No se ha podido contrastar el ticket con el anterior: ${fiabilidad.motivos[0]}. Es un problema de LECTURA del ticket, no del turno: revisa la foto y, si hace falta, vuelve a subirla.`;
        await crearAnomalia(parte.conductor_id, mensaje, parte.id, docId, 'NORMAL');
        return {
            campo: 'borrados',
            severidad: 'NORMAL',
            declarado: datosAnt.acum_borrados ?? '—',
            detectado: datosActual.acum_borrados ?? '—',
            mensaje,
        };
    }

    const partesEntreTickets = await prisma.parteDiario.findMany({
        where: {
            vehiculo_id: parte.vehiculo_id,
            fecha_trabajada: { gt: parteAnterior.fecha_trabajada, lte: parte.fecha_trabajada },
            estado: { in: [...ESTADOS_ENVIADOS] },
        },
        select: { km_inicio: true, km_fin: true, ingreso_bruto: true },
    });
    const numPartes = partesEntreTickets.length; // incluye el parte actual
    const kmDeclarados = partesEntreTickets.reduce((acc, p) => acc + (p.km_fin - p.km_inicio), 0);
    const eurDeclarados = partesEntreTickets.reduce((acc, p) => acc + Number(p.ingreso_bruto), 0);

    const borradosEsperados = datosAnt.acum_borrados! + numPartes;
    const diffBorrados = datosActual.acum_borrados - borradosEsperados;

    if (diffBorrados === 0) return null; // todo cuadra, sin aviso

    // Muchos días sin ticket: la cuenta de borrados deja de ser concluyente
    // (casi seguro hubo turnos sin parte). Se informa, no se acusa (C-056).
    if (diasEntreTickets > MAX_DIAS_ENTRE_TICKETS) {
        const mensaje = `Han pasado ${diasEntreTickets} días desde el ticket anterior de este vehículo, con ${numPartes} parte(s) declarado(s) por medio. La cuenta de borrados no cuadra (esperados ${borradosEsperados}, ticket ${datosActual.acum_borrados}), pero con tanto tiempo sin ticket no es una prueba de nada: lo normal es que falten partes por registrar. Sube el ticket con cada parte para que la comparación sirva.`;
        await crearAnomalia(parte.conductor_id, mensaje, parte.id, docId, 'NORMAL');
        return {
            campo: 'borrados',
            severidad: 'NORMAL',
            declarado: borradosEsperados,
            detectado: datosActual.acum_borrados,
            diff: diffBorrados,
            mensaje,
        };
    }

    // `mensaje`: detallado, para el panel del patrón (Anomalia.descripcion).
    // `motivoCorto`: para el parámetro de la plantilla de WhatsApp — los
    // templates de Meta no admiten párrafos largos como parámetro.
    let mensaje: string;
    let motivoCorto: string;
    // CRITICA (= acusa y avisa por WhatsApp) solo cuando hay prueba, o cuando
    // la prueba se ha podido mirar y no aparece nada. Si los km y el importe
    // acumulado NO se han podido contrastar (campos no leídos o cifras
    // imposibles), un borrado suelto no basta para acusar a nadie: queda como
    // aviso NORMAL en el panel (C-056).
    let severidad: SeveridadDiscrepancia = 'CRITICA';

    if (diffBorrados < 0) {
        // Menos borrados de los que los propios partes ya explicarían: el
        // contador no se movió lo que debería, o alguien lo manipuló a la baja.
        mensaje = `Borrados por debajo de lo esperado: ${datosAnt.acum_borrados} (ticket anterior) + ${numPartes} parte(s) declarado(s) = ${borradosEsperados} esperados, pero el ticket trae ${datosActual.acum_borrados}. Posible manipulación del contador.`;
        motivoCorto = 'contador de borrados por debajo de lo esperado — posible manipulación';
    } else {
        // diffBorrados > 0: hay borrado(s) que ningún parte explica.
        // Ver si además hay km y/o € sin declarar para calibrar el mensaje.
        // Solo son prueba los saltos que la comprobación de plausibilidad ha
        // dado por buenos (fiabilidad.km / .eur).
        const saltoKm = fiabilidad.km ? datosActual.acum_dist_total! - datosAnt.acum_dist_total! : undefined;
        const kmSinDeclarar = saltoKm !== undefined ? saltoKm - kmDeclarados : undefined;
        const hayKmSinDeclarar = kmSinDeclarar !== undefined && Math.abs(kmSinDeclarar) > TOLERANCIA_KM_ACUMULADO;

        const saltoEur = fiabilidad.eur ? datosActual.acum_total! - datosAnt.acum_total! : undefined;
        const eurSinDeclarar = saltoEur !== undefined ? saltoEur - eurDeclarados : undefined;
        const hayEurSinDeclarar = eurSinDeclarar !== undefined && Math.abs(eurSinDeclarar) > TOLERANCIA_EUR_ACUMULADO;

        const baseMensaje = `El taxímetro registra ${diffBorrados} borrado(s) más de los ${numPartes} parte(s) declarados entre este ticket y el anterior.`;

        if (hayEurSinDeclarar) {
            mensaje = `${baseMensaje} Además, ${kmSinDeclarar !== undefined ? kmSinDeclarar.toFixed(1) + ' km' : 'kilómetros'} y ${eurSinDeclarar!.toFixed(2)} € acumulados no aparecen en ningún parte: posible trabajo no declarado. Avísalo al asalariado para que lo explique.`;
            motivoCorto = `${kmSinDeclarar!.toFixed(0)} km y ${eurSinDeclarar!.toFixed(2)}€ sin declarar — posible trabajo no declarado`;
        } else if (hayKmSinDeclarar) {
            mensaje = `${baseMensaje} El vehículo se ha movido ${kmSinDeclarar!.toFixed(1)} km sin que ningún parte lo declare, pero el importe acumulado cuadra (sin dinero de más). Puede ser uso del vehículo fuera de trabajo (taller, ITV, cambio de ruedas...) — pregúntaselo al asalariado.`;
            motivoCorto = `${kmSinDeclarar!.toFixed(0)} km sin declarar, sin dinero de más — revisa con tu asalariado`;
        } else if (fiabilidad.km || fiabilidad.eur) {
            mensaje = `${baseMensaje} Sin diferencia relevante de km o importe acumulado.`;
            motivoCorto = `${diffBorrados} borrado(s) sin turno que lo explique`;
        } else {
            // Ni km ni € contrastables: hay un borrado de más, pero no hay con
            // qué respaldarlo. Se informa sin acusar y sin WhatsApp.
            severidad = 'NORMAL';
            mensaje = `${baseMensaje} No se ha podido comprobar si hay km o dinero sin declarar (${fiabilidad.motivos.join('; ')}). Revisa la foto del ticket antes de sacar conclusiones.`;
            motivoCorto = `${diffBorrados} borrado(s) sin turno que lo explique`;
        }
    }

    const anomalia = await crearAnomalia(parte.conductor_id, mensaje, parte.id, docId, severidad);
    if (severidad === 'CRITICA') {
        await notificarPatronAnomalia(ctx, parte.id, anomalia.id, mensaje, motivoCorto);
    }

    return {
        campo: 'borrados',
        severidad,
        declarado: borradosEsperados,
        detectado: datosActual.acum_borrados,
        diff: diffBorrados,
        mensaje,
    };
}

/**
 * Avisa al patrón por WhatsApp de una anomalía CRÍTICA, vía el mismo canal
 * que usan los avisos de mantenimiento (GlorIA → n8n → Meta). Un fallo aquí
 * NUNCA debe romper la comparación OCR — por eso todo el cuerpo va en
 * try/catch y esta función no lanza. La anomalía ya quedó registrada en el
 * panel (Anomalia + widget "Alertas Pendientes") pase lo que pase con el envío.
 *
 * DEDUPE (2026-08-11): la clave es por PARTE, no por anomalía. Al recalcular
 * un parte (p.ej. se sustituye la foto) las anomalías se borran y se vuelven
 * a crear con id nuevo — si la clave dependiera del id de la anomalía, cada
 * recálculo mandaría otro WhatsApp del mismo hecho. Antes esto lo tapaba por
 * accidente la cola de n8n (deduplicaba por tipo+teléfono+día); ahora que
 * enviamos directo, la protección tiene que ser nuestra y explícita.
 *
 * Requiere la plantilla Meta `anomalia_taximetro` aprobada (enviada a
 * revisión el 2026-08-11, igual que mantenimiento_proximo/vencido).
 */
async function notificarPatronAnomalia(
    ctx: ContextoAviso,
    parteId: string,
    anomaliaId: string,
    mensajeCompleto: string,
    motivoCorto: string,
): Promise<void> {
    try {
        if (!ctx.telefonoPatron) return; // sin teléfono, no hay a quién avisar

        const dedupeKey = `pilotos:anomalia:${parteId}`;
        const previo = await prisma.aviso.findUnique({ where: { dedupe_key: dedupeKey } });
        if (previo?.enviado) return; // ya se avisó de este parte

        const aviso = previo ?? await prisma.aviso.create({
            data: {
                cliente_id: ctx.clienteId,
                tipo: 'ANOMALIA',
                titulo: `Anomalía en el taxímetro: ${ctx.matricula}`,
                mensaje: mensajeCompleto,
                entidad_tipo: 'ANOMALIA',
                entidad_id: anomaliaId,
                canal: 'whatsapp',
                intentos: 0,
                dedupe_key: dedupeKey,
            },
        });

        const templateParams = { matricula: ctx.matricula, motivo: motivoCorto };
        const envio = await enviarAvisoGloria(ctx.telefonoPatron, 'anomalia_taximetro', templateParams);

        await prisma.aviso.update({
            where: { id: aviso.id },
            data: envio.ok
                ? { enviado: true, enviado_at: new Date(), intentos: { increment: 1 }, error_envio: null }
                : { error_envio: envio.error?.slice(0, 500), intentos: { increment: 1 } },
        });
    } catch (err: any) {
        console.error('[OCR-COMPARACION] Fallo al avisar al patrón (no bloquea):', err?.message);
    }
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
) {
    return prisma.anomalia.create({
        data: {
            conductor_id,
            tipo,
            descripcion,
            parte_diario_id: parte_diario_id ?? null,
            documento_id: documento_id ?? null,
        },
    });
}
