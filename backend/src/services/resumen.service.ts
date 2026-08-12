/**
 * Resumen Service — Cálculo centralizado del resumen económico de un periodo.
 * Reutilizado por:
 *   - GET /api/dashboard/resumen (panel admin)
 *   - GET /api/dashboard/resumen (informes — mismo endpoint, mismo cálculo)
 *
 * Reglas:
 *   - Solo computan partes en estados ENVIADO o FOTO_SUSTITUIDA. Fuera quedan
 *     los BORRADOR y los PENDIENTE_VALIDACION (partes con discrepancias, a la
 *     espera de que el dueño decida — ver retencionParte.service.ts).
 *   - Gastos variables se filtran por fecha del gasto.
 *   - Gastos fijos activos se prorratean segun los DIAS REALES del rango
 *     solicitado (Fase 4, 2026-07-24): antes siempre se mostraba la cuota
 *     mensual equivalente (importe/3 para TRIMESTRAL, etc.) sin mirar si el
 *     rango pedido era una semana, un mes o varios meses — una semana veia
 *     el mismo gasto fijo que un trimestre entero. Ahora se convierte cada
 *     gasto fijo a un importe ANUAL segun periodicidad, se divide entre 365
 *     para obtener una tasa diaria, y se multiplica por los dias del rango.
 *     Si no se pide un rango (desde/hasta ausentes), se mantiene el
 *     equivalente mensual como vista por defecto (no hay un rango que prorratear).
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { ESTADOS_COMPUTABLES } from './retencionParte.service';

const DIAS_POR_ANIO = 365;

function vecesPorAnio(periodicidad: string): number {
    if (periodicidad === 'TRIMESTRAL') return 4;
    if (periodicidad === 'SEMESTRAL') return 2;
    if (periodicidad === 'ANUAL') return 1;
    return 12; // MENSUAL (y por defecto)
}

/**
 * Prorratea un conjunto de gastos fijos segun los dias reales de [desde, hasta].
 * Sin rango, devuelve el equivalente mensual (comportamiento historico).
 */
export function prorratearGastosFijos(
    fijos: { importe: Decimal | number; periodicidad: string }[],
    desde?: Date,
    hasta?: Date,
): number {
    const diasEnRango = (desde && hasta)
        ? Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000)) + 1)
        : null;

    return fijos.reduce((acc, f) => {
        const importe = Number(f.importe);
        const veces = vecesPorAnio(f.periodicidad);
        if (diasEnRango === null) {
            return acc + (importe * veces) / 12;
        }
        const importeAnual = importe * veces;
        const importeDiario = importeAnual / DIAS_POR_ANIO;
        return acc + importeDiario * diasEnRango;
    }, 0);
}

export interface ResumenInput {
    cliente_id: string;
    desde?: Date;
    hasta?: Date;
}

export interface ResumenOutput {
    bruto: number;
    datafono: number;
    /** Estimación de cobros en efectivo del periodo: bruto - datafono.
     *  Es una derivación, no un campo nuevo de negocio: solo formaliza
     *  el complementario del datáfono sobre el bruto declarado. */
    efectivo_estimado: number;
    combustible: number;
    neto: number;
    parte_conductor: number;
    parte_patron: number;
    gastos_variables: number;
    gastos_fijos_prorrateados: number;
    beneficio_estimado: number;
    partes_count: number;
    rango: { desde: string | null; hasta: string | null };
}

function toNum(d: Decimal | null | undefined): number {
    if (!d) return 0;
    return Number(d);
}

export async function calcularResumen({ cliente_id, desde, hasta }: ResumenInput): Promise<ResumenOutput> {
    // 1. Partes válidos del periodo (mismos estados que cierres MVP).
    // PENDIENTE_VALIDACION queda FUERA a propósito (2026-08-12): un parte con
    // discrepancias no suma hasta que el dueño lo acepta. Esta línea y su
    // gemela en cierre.routes.ts son la puerta de los globales.
    const wherePartes: any = {
        vehiculo: { cliente_id },
        estado: { in: [...ESTADOS_COMPUTABLES] },
    };
    if (desde || hasta) {
        wherePartes.fecha_trabajada = {};
        if (desde) wherePartes.fecha_trabajada.gte = desde;
        if (hasta) wherePartes.fecha_trabajada.lte = hasta;
    }

    const partes = await prisma.parteDiario.findMany({
        where: wherePartes,
        include: { calculo: true },
    });

    let bruto = 0, datafono = 0, combustible = 0, neto = 0;
    let parteConductor = 0, partePatron = 0;
    for (const p of partes) {
        bruto += toNum(p.ingreso_bruto);
        datafono += toNum(p.ingreso_datafono);
        combustible += toNum(p.combustible);
        if (p.calculo) {
            neto += toNum(p.calculo.neto_diario);
            parteConductor += toNum(p.calculo.parte_conductor);
            partePatron += toNum(p.calculo.parte_patron);
        } else {
            // Fallback si no hay cálculo (config no definida): asumimos parte = bruto
            neto += toNum(p.ingreso_bruto);
            partePatron += toNum(p.ingreso_bruto);
        }
    }

    // 2. Gastos variables del periodo
    const whereGastos: any = { cliente_id };
    if (desde || hasta) {
        whereGastos.fecha = {};
        if (desde) whereGastos.fecha.gte = desde;
        if (hasta) whereGastos.fecha.lte = hasta;
    }
    const gastos = await prisma.gasto.findMany({ where: whereGastos });
    const gastosVariables = gastos.reduce((acc, g) => acc + toNum(g.importe), 0);

    // 3. Gastos fijos activos, prorrateados por los dias reales del rango
    const fijos = await prisma.gastoFijo.findMany({ where: { cliente_id, activo: true } });
    const gastosFijosProrrateados = prorratearGastosFijos(fijos, desde, hasta);

    const beneficio = partePatron - gastosVariables - gastosFijosProrrateados;

    // Efectivo estimado = bruto - datafono. Clampamos a 0 por seguridad
    // si en algún parte se introduce datafono > bruto (input incorrecto).
    const efectivoEstimado = Math.max(0, bruto - datafono);

    return {
        bruto,
        datafono,
        efectivo_estimado: efectivoEstimado,
        combustible,
        neto,
        parte_conductor: parteConductor,
        parte_patron: partePatron,
        gastos_variables: gastosVariables,
        gastos_fijos_prorrateados: gastosFijosProrrateados,
        beneficio_estimado: beneficio,
        partes_count: partes.length,
        rango: {
            desde: desde ? desde.toISOString().slice(0, 10) : null,
            hasta: hasta ? hasta.toISOString().slice(0, 10) : null,
        },
    };
}
