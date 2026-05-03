/**
 * Resumen Service — Cálculo centralizado del resumen económico de un periodo.
 * Reutilizado por:
 *   - GET /api/dashboard/resumen (panel admin)
 *   - GET /api/dashboard/resumen (informes — mismo endpoint, mismo cálculo)
 *
 * Reglas:
 *   - Solo computan partes en estados ENVIADO o FOTO_SUSTITUIDA. BORRADOR fuera.
 *   - Gastos variables se filtran por fecha del gasto.
 *   - Gastos fijos activos se prorratean según periodicidad:
 *       MENSUAL → tal cual; TRIMESTRAL → ÷3; ANUAL → ÷12.
 *   - El prorrateo siempre asume "1 mes" como unidad de comparación. Para periodos
 *     distintos a un mes natural se sigue mostrando la cuota mensual prorrateada
 *     (consistente con la lógica previa de informes/page.tsx).
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';

export interface ResumenInput {
    cliente_id: string;
    desde?: Date;
    hasta?: Date;
}

export interface ResumenOutput {
    bruto: number;
    datafono: number;
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
    // 1. Partes válidos del periodo (mismos estados que cierres MVP)
    const wherePartes: any = {
        vehiculo: { cliente_id },
        estado: { in: ['ENVIADO', 'FOTO_SUSTITUIDA'] },
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

    // 3. Gastos fijos activos, prorrateados a mensualidad
    const fijos = await prisma.gastoFijo.findMany({ where: { cliente_id, activo: true } });
    const gastosFijosProrrateados = fijos.reduce((acc, f) => {
        let multiplier = 1;
        if (f.periodicidad === 'TRIMESTRAL') multiplier = 1 / 3;
        else if (f.periodicidad === 'ANUAL') multiplier = 1 / 12;
        return acc + toNum(f.importe) * multiplier;
    }, 0);

    const beneficio = partePatron - gastosVariables - gastosFijosProrrateados;

    return {
        bruto,
        datafono,
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
