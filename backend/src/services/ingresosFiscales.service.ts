/**
 * Ingresos del taxi para la gestora en la sombra de LucIA (2026-11-23).
 *
 * LucIA compara el rendimiento del taxi por módulos con el de estimación directa y necesita lo que ha ingresado la actividad
 * en un periodo. Reutiliza `calcularResumen`, el mismo cálculo que ve el dueño en su panel, para que las dos cifras no puedan
 * discrepar. Solo lectura.
 *
 * Qué es «ingreso» aquí: el BRUTO de los partes computables (lo que cobra el coche, antes de repartir con el asalariado).
 * Lo que se paga al asalariado y su Seguridad Social son gastos de la actividad, no una resta del ingreso. Los partes
 * retenidos por discrepancias (PENDIENTE_VALIDACION) no suman hasta que el dueño los acepta, igual que en sus cierres.
 */
import { calcularResumen } from './resumen.service';

export interface IngresosFiscales {
    desde: string;
    hasta: string;
    /** Total cobrado por el vehículo en el periodo (tarjeta + efectivo). */
    bruto: number;
    datafono: number;
    efectivo_estimado: number;
    combustible: number;
    seguridad_social: number;
    partes_count: number;
    nota: string;
}

export const NOTA_INGRESOS =
    'bruto = total cobrado por el vehículo antes de repartir con el asalariado; no incluye los partes retenidos por discrepancias hasta que el dueño los acepte';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366;
const DIA_MS = 86_400_000;

export type RangoInvalido = { error: 'rango_invalido'; detalle: string };

/** Valida YYYY-MM-DD reales, desde <= hasta y como mucho un año. Devuelve las fechas o el motivo. */
export function leerRango(desde: unknown, hasta: unknown): { desde: Date; hasta: Date } | RangoInvalido {
    if (typeof desde !== 'string' || typeof hasta !== 'string' || !FECHA.test(desde) || !FECHA.test(hasta)) {
        return { error: 'rango_invalido', detalle: 'desde y hasta deben ser fechas YYYY-MM-DD' };
    }
    const d = new Date(`${desde}T00:00:00.000Z`);
    const h = new Date(`${hasta}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime()) || d.toISOString().slice(0, 10) !== desde || h.toISOString().slice(0, 10) !== hasta) {
        return { error: 'rango_invalido', detalle: 'fecha inexistente' };
    }
    if (h < d) return { error: 'rango_invalido', detalle: 'hasta es anterior a desde' };
    if ((h.getTime() - d.getTime()) / DIA_MS > MAX_DIAS) return { error: 'rango_invalido', detalle: 'como mucho un año por consulta' };
    return { desde: d, hasta: h };
}

export async function ingresosFiscales(clienteId: string, rango: { desde: Date; hasta: Date }): Promise<IngresosFiscales> {
    const r = await calcularResumen({ cliente_id: clienteId, desde: rango.desde, hasta: rango.hasta });
    return {
        desde: rango.desde.toISOString().slice(0, 10),
        hasta: rango.hasta.toISOString().slice(0, 10),
        bruto: r.bruto,
        datafono: r.datafono,
        efectivo_estimado: r.efectivo_estimado,
        combustible: r.combustible,
        seguridad_social: r.seguridad_social,
        partes_count: r.partes_count,
        nota: NOTA_INGRESOS,
    };
}
