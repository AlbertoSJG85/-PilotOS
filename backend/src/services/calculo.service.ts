/**
 * Servicio de calculos de partes diarios.
 * DT-007: Los calculos se almacenan separados del parte (que es inmutable).
 * Se calculan segun la configuracion economica vigente del cliente.
 *
 * Ref: PilotOS_Master.md seccion 7 (Calculos base derivados)
 * - bruto diario = ingreso bruto del dia
 * - neto diario = bruto - combustible
 * - reparto segun configuracion del conductor / cliente
 */
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface CalculoInput {
    parte_diario_id: string;
    cliente_id: string;
}

interface CalculoResult {
    bruto_diario: Decimal;
    combustible: Decimal;
    neto_diario: Decimal;
    varios: Decimal;
    parte_conductor: Decimal;
    parte_patron: Decimal;
    modelo_reparto_aplicado: string;
    porcentaje_conductor_aplicado: Decimal;
    porcentaje_patron_aplicado: Decimal;
    configuracion_id: string;
}

/**
 * Calcula el reparto de un parte diario segun la configuracion economica vigente.
 * Si no hay configuracion vigente, lanza error.
 */
export async function calcularParte(input: CalculoInput): Promise<CalculoResult> {
    // Obtener parte
    const parte = await prisma.parteDiario.findUniqueOrThrow({
        where: { id: input.parte_diario_id },
    });

    // Obtener configuracion economica (Priorizando la específica del conductor)
    const config = await prisma.configuracionEconomica.findFirst({
        where: {
            cliente_id: input.cliente_id,
            activo: true,
            fecha_fin: null,
            OR: [
                { conductor_id: parte.conductor_id },
                { conductor_id: null }
            ]
        },
        orderBy: [
            { conductor_id: 'desc' }, // Los que tienen conductor_id (no nulos) suelen ir primero en desc si nulls son lowest
            { fecha_inicio: 'desc' }
        ],
    });

    if (!config) {
        throw new Error('No hay configuracion economica vigente para este propietario/cliente');
    }

    const bruto = new Decimal(parte.ingreso_bruto.toString());
    const combustible = new Decimal((parte.combustible ?? 0).toString());
    const varios = new Decimal((parte.varios ?? 0).toString());

    // Neto = bruto - combustible (si la config lo indica)
    let neto: Decimal;
    if (config.incluye_combustible_en_reparto) {
        neto = bruto.minus(combustible);
    } else {
        neto = bruto;
    }

    // Aplicar reparto segun modelo
    let parteConductor: Decimal;
    let partePatron: Decimal;

    switch (config.modelo_reparto) {
        case 'PORCENTAJE': {
            const pctConductor = new Decimal(config.porcentaje_conductor.toString()).dividedBy(100);
            const pctPatron = new Decimal(config.porcentaje_patron.toString()).dividedBy(100);
            parteConductor = neto.times(pctConductor);
            partePatron = neto.times(pctPatron);
            break;
        }
        case 'FIJO_DIARIO': {
            // porcentaje_conductor se interpreta como importe fijo diario del conductor
            parteConductor = new Decimal(config.porcentaje_conductor.toString());
            partePatron = neto.minus(parteConductor);
            break;
        }
        default: {
            // PERSONALIZADO: se usa porcentaje como base
            const pctC = new Decimal(config.porcentaje_conductor.toString()).dividedBy(100);
            const pctP = new Decimal(config.porcentaje_patron.toString()).dividedBy(100);
            parteConductor = neto.times(pctC);
            partePatron = neto.times(pctP);
            break;
        }
    }

    // Varios repercute en la cuenta del patron (PilotOS_Master.md seccion 5.5)
    partePatron = partePatron.minus(varios);

    return {
        bruto_diario: bruto,
        combustible,
        neto_diario: neto,
        varios,
        parte_conductor: parteConductor,
        parte_patron: partePatron,
        modelo_reparto_aplicado: config.modelo_reparto,
        porcentaje_conductor_aplicado: config.porcentaje_conductor,
        porcentaje_patron_aplicado: config.porcentaje_patron,
        configuracion_id: config.id,
    };
}

/**
 * Crea o actualiza el calculo de un parte diario.
 * Se usa despues de enviar un parte o si se recalcula por cambio de configuracion.
 */
export async function crearOActualizarCalculo(input: CalculoInput) {
    const resultado = await calcularParte(input);

    return prisma.calculoParte.upsert({
        where: { parte_diario_id: input.parte_diario_id },
        create: {
            parte_diario_id: input.parte_diario_id,
            configuracion_id: resultado.configuracion_id,
            bruto_diario: resultado.bruto_diario,
            combustible: resultado.combustible,
            neto_diario: resultado.neto_diario,
            varios: resultado.varios,
            parte_conductor: resultado.parte_conductor,
            parte_patron: resultado.parte_patron,
            modelo_reparto_aplicado: resultado.modelo_reparto_aplicado,
            porcentaje_conductor_aplicado: resultado.porcentaje_conductor_aplicado,
            porcentaje_patron_aplicado: resultado.porcentaje_patron_aplicado,
        },
        update: {
            configuracion_id: resultado.configuracion_id,
            bruto_diario: resultado.bruto_diario,
            combustible: resultado.combustible,
            neto_diario: resultado.neto_diario,
            varios: resultado.varios,
            parte_conductor: resultado.parte_conductor,
            parte_patron: resultado.parte_patron,
            modelo_reparto_aplicado: resultado.modelo_reparto_aplicado,
            porcentaje_conductor_aplicado: resultado.porcentaje_conductor_aplicado,
            porcentaje_patron_aplicado: resultado.porcentaje_patron_aplicado,
        },
    });
}
