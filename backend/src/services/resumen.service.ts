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
import { calcularSeguridadSocial, type DetalleSS } from './seguridadSocial.service';

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

/**
 * El lado del negocio que corresponde a un asalariado (2026-08-12).
 *
 * El recorrido, que es el que pidió Alberto ver separado:
 *   genera (bruto − combustible) → su reparto pactado → menos su Seguridad
 *   Social = lo que percibe. Y aparte, lo que le queda al dueño de su trabajo.
 *
 * `neto_generado` coincide EXACTAMENTE con el "entregado neto" que el
 * asalariado ve en su panel. Si las dos pantallas no dijeran lo mismo, la
 * conversación entre dueño y asalariado empezaría mal.
 */
export interface DetalleAsalariado {
    conductor_id: string;
    nombre: string;
    /** true = son los días que ha conducido el propio dueño: su importe es íntegro suyo. */
    es_patron: boolean;
    partes: number;
    bruto: number;
    combustible: number;
    neto_generado: number;
    /** Su parte del reparto ANTES de descontarle la Seguridad Social. */
    reparto: number;
    seguridad_social: number;
    /** Lo que cobra de verdad: reparto − Seguridad Social. */
    percibe: number;
    /** Lo que le queda al dueño del trabajo de esta persona. */
    para_el_patron: number;
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
    /// Seguridad Social de los asalariados devengada en el periodo (F4).
    /// Cuota completa por mes tocado: nunca se prorratea por dias.
    seguridad_social: number;
    ss_modo_descuento: 'parte' | 'cierre';
    seguridad_social_detalle: DetalleSS[];
    /** Desglose por asalariado: lo que genera, lo que se lleva y lo que te queda. */
    asalariados: DetalleAsalariado[];
    /** Los días que ha conducido el propio dueño. Su importe va íntegro para él. */
    patron: DetalleAsalariado | null;
    beneficio_estimado: number;
    /** Lo que ingresa el dueno antes de gastos: lo suyo integro + su parte de lo del asalariado. */
    ingreso_patron: number;
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
        // El conductor hace falta para separar lo que ha generado cada
        // asalariado: el dueño necesita ver ese lado del negocio aparte.
        include: { calculo: true, conductor: { include: { usuario: { select: { nombre: true } } } } },
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

    // Seguridad Social de los asalariados (F4, regla del 2026-08-11). Es un
    // coste del patron como cualquier otro, asi que baja el beneficio. Ojo:
    // en modo 'parte' la cuota ya se le ha descontado al conductor y ha
    // subido parte_patron en la misma cantidad, asi que restarla aqui deja el
    // beneficio correcto en los dos modos -- no se cuenta dos veces.
    const cliente = await prisma.cliente.findUnique({ where: { id: cliente_id }, select: { ss_modo_descuento: true } });
    const modoSS = cliente?.ss_modo_descuento === 'parte' ? 'parte' as const : 'cierre' as const;

    const ss = (desde && hasta)
        ? await calcularSeguridadSocial(cliente_id, desde, hasta)
        : { total: 0, detalle: [] as DetalleSS[] };


    // ── El lado de cada asalariado (2026-08-12) ──────────────────────────
    // El dueño necesita ver, por persona: lo que ha generado, lo que se
    // lleva por el reparto pactado, su Seguridad Social y lo que le queda a
    // él. Sin esto, el panel dice cuánto entra pero no de quién sale.
    const porAsalariado = new Map<string, DetalleAsalariado>();
    for (const p of partes) {
        if (!p.conductor) continue;
        const id = p.conductor_id;
        const acumulado = porAsalariado.get(id) ?? {
            conductor_id: id,
            nombre: p.conductor.usuario?.nombre ?? 'Asalariado',
            es_patron: p.conductor.es_patron,
            partes: 0, bruto: 0, combustible: 0, neto_generado: 0,
            reparto: 0, seguridad_social: 0, percibe: 0, para_el_patron: 0,
        };
        acumulado.partes += 1;
        acumulado.bruto += toNum(p.ingreso_bruto);
        acumulado.combustible += toNum(p.combustible);
        // El reparto se toma ANTES de la SS: en modo "parte" el cálculo ya
        // se la descontó, así que se le vuelve a sumar para no restarla dos
        // veces al llegar abajo. Así la cifra final es la misma en los dos
        // modos de descuento, que es lo que espera quien la lee.
        acumulado.reparto += toNum(p.calculo?.parte_conductor) + toNum(p.calculo?.descuento_ss);
        acumulado.para_el_patron += toNum(p.calculo?.parte_patron) - toNum(p.calculo?.descuento_ss);
        porAsalariado.set(id, acumulado);
    }

    for (const detalle of porAsalariado.values()) {
        detalle.neto_generado = detalle.bruto - detalle.combustible;
        detalle.seguridad_social = ss.detalle.find((d) => d.conductor_id === detalle.conductor_id)?.total ?? 0;
        detalle.percibe = detalle.reparto - detalle.seguridad_social;
    }
    const todos = [...porAsalariado.values()];
    const asalariados = todos.filter((d) => !d.es_patron).sort((a, b) => b.neto_generado - a.neto_generado);
    // Los días que ha trabajado el propio dueño: su reparto es el suyo (100%
    // si así lo tiene configurado) y NO se divide con nadie. Por eso va
    // aparte y no mezclado con los asalariados.
    const patron = todos.find((d) => d.es_patron) ?? null;
    // ── Lo que gana el dueño (2026-08-12, corregido) ─────────────────────
    // Antes esto era `partePatron - gastos - SS`, y tenía DOS errores que se
    // tapaban entre ellos:
    //
    //  1. `partePatron` solo recoge la parte del patrón en el reparto. Los
    //     días que conduce ÉL van a `parte_conductor` (su config es 100/0),
    //     así que su propio trabajo no entraba en su beneficio. Con dos
    //     jornadas suyas se perdían 290 € de sus ingresos.
    //  2. Se restaba la Seguridad Social como si fuera un coste suyo, pero
    //     la cuota se le descuenta al asalariado de su liquidación: el dueño
    //     la retiene y la paga al Estado. Entra y sale — es neutra para él.
    //     Restarla otra vez era cobrársela dos veces.
    //
    // Ahora: lo que trabaja él (íntegro) + su parte de lo que trabaja el
    // asalariado − sus gastos. La SS no aparece porque no es dinero suyo.
    const ingresoDelPatron = (patron?.reparto ?? 0)
        + asalariados.reduce((acc, a) => acc + a.para_el_patron, 0);
    const beneficio = ingresoDelPatron - gastosVariables - gastosFijosProrrateados;

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
        seguridad_social: ss.total,
        asalariados,
        patron,
        ss_modo_descuento: modoSS,
        seguridad_social_detalle: ss.detalle,
        beneficio_estimado: beneficio,
        ingreso_patron: ingresoDelPatron,
        partes_count: partes.length,
        rango: {
            desde: desde ? desde.toISOString().slice(0, 10) : null,
            hasta: hasta ? hasta.toISOString().slice(0, 10) : null,
        },
    };
}
