/**
 * Servicio de calculos de partes diarios.
 * DT-007: Los calculos se almacenan separados del parte (que es inmutable).
 * Se calculan segun la configuracion economica vigente del cliente.
 *
 * Ref: PilotOS_Master.md seccion 7 (Calculos base derivados)
 * - bruto diario = ingreso bruto del dia
 * - neto diario = bruto - combustible (SIEMPRE; es una medida operativa,
 *   no depende de si el combustible se reparte o no)
 * - base de reparto = lo que realmente se divide entre conductor/patron.
 *   Coincide con neto_diario cuando incluye_combustible_en_reparto=true,
 *   pero es bruto_diario cuando la config excluye el combustible del reparto
 *   (Fase 4, 2026-07-24: antes ambos conceptos se guardaban en el mismo
 *   campo neto_diario, que llegaba a valer "bruto" cuando la config excluia
 *   el combustible — un neto no deberia poder ser igual al bruto).
 * - reparto segun configuracion del conductor / cliente
 */
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

type ClientePrisma = typeof prisma | Prisma.TransactionClient;

interface CalculoInput {
    parte_diario_id: string;
    cliente_id: string;
}

interface CalculoResult {
    bruto_diario: Decimal;
    combustible: Decimal;
    neto_diario: Decimal;
    base_reparto: Decimal;
    varios: Decimal;
    parte_conductor: Decimal;
    parte_patron: Decimal;
    modelo_reparto_aplicado: string;
    porcentaje_conductor_aplicado: Decimal;
    porcentaje_patron_aplicado: Decimal;
    configuracion_id: string;
}

/**
 * Resuelve la configuracion economica vigente para un conductor, priorizando
 * siempre la especifica sobre la generica del cliente.
 *
 * Fase 4 (2026-07-24): antes se hacia una unica query con
 * `orderBy: [{ conductor_id: 'desc' }, ...]` para intentar que las filas con
 * conductor_id no-nulo salieran primero. En PostgreSQL, ORDER BY ... DESC
 * pone los NULL primero (NULLS FIRST es el default en DESC), asi que el
 * orden real era el CONTRARIO al buscado: la config generica (conductor_id
 * NULL) ganaba sobre la especifica. Ahora se hacen dos consultas explicitas,
 * sin ambiguedad de orden.
 */
async function resolverConfiguracionVigente(client: ClientePrisma, cliente_id: string, conductor_id: string) {
    const especifica = await client.configuracionEconomica.findFirst({
        where: { cliente_id, activo: true, fecha_fin: null, conductor_id },
        orderBy: { fecha_inicio: 'desc' },
    });
    if (especifica) return especifica;

    return client.configuracionEconomica.findFirst({
        where: { cliente_id, activo: true, fecha_fin: null, conductor_id: null },
        orderBy: { fecha_inicio: 'desc' },
    });
}

/**
 * Calcula el reparto de un parte diario segun la configuracion economica vigente.
 * Si no hay configuracion vigente, lanza error.
 *
 * Acepta opcionalmente un cliente de transaccion Prisma (`tx`) para que el
 * calculo pueda ejecutarse dentro de la misma transaccion que crea el parte
 * (Fase 4: antes el calculo se hacia SIEMPRE contra el pool global, fuera de
 * cualquier transaccion, incluso cuando se llamaba desde dentro de una).
 */
export async function calcularParte(input: CalculoInput, client: ClientePrisma = prisma): Promise<CalculoResult> {
    const parte = await client.parteDiario.findUniqueOrThrow({
        where: { id: input.parte_diario_id },
    });

    const config = await resolverConfiguracionVigente(client, input.cliente_id, parte.conductor_id);

    if (!config) {
        throw new Error('No hay configuracion economica vigente para este propietario/cliente');
    }

    const bruto = new Decimal(parte.ingreso_bruto.toString());
    const combustible = new Decimal((parte.combustible ?? 0).toString());
    const varios = new Decimal((parte.varios ?? 0).toString());

    // neto operativo: SIEMPRE bruto - combustible, independientemente de la
    // configuracion de reparto (es una medida de negocio, no de reparto).
    const netoOperativo = bruto.minus(combustible);

    // base de reparto: lo que realmente se divide entre conductor y patron.
    const baseReparto = config.incluye_combustible_en_reparto ? netoOperativo : bruto;

    // Aplicar reparto segun modelo
    let parteConductor: Decimal;
    let partePatron: Decimal;

    switch (config.modelo_reparto) {
        case 'PORCENTAJE': {
            const pctConductor = new Decimal(config.porcentaje_conductor.toString()).dividedBy(100);
            const pctPatron = new Decimal(config.porcentaje_patron.toString()).dividedBy(100);
            parteConductor = baseReparto.times(pctConductor);
            partePatron = baseReparto.times(pctPatron);
            break;
        }
        case 'FIJO_DIARIO': {
            // porcentaje_conductor se interpreta como importe fijo diario del conductor
            parteConductor = new Decimal(config.porcentaje_conductor.toString());
            partePatron = baseReparto.minus(parteConductor);
            break;
        }
        default: {
            // PERSONALIZADO: se usa porcentaje como base
            const pctC = new Decimal(config.porcentaje_conductor.toString()).dividedBy(100);
            const pctP = new Decimal(config.porcentaje_patron.toString()).dividedBy(100);
            parteConductor = baseReparto.times(pctC);
            partePatron = baseReparto.times(pctP);
            break;
        }
    }

    // Varios repercute en la cuenta del patron (PilotOS_Master.md seccion 5.5)
    partePatron = partePatron.minus(varios);

    return {
        bruto_diario: bruto,
        combustible,
        neto_diario: netoOperativo,
        base_reparto: baseReparto,
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
export async function crearOActualizarCalculo(input: CalculoInput, client: ClientePrisma = prisma) {
    const resultado = await calcularParte(input, client);

    return client.calculoParte.upsert({
        where: { parte_diario_id: input.parte_diario_id },
        create: {
            parte_diario_id: input.parte_diario_id,
            configuracion_id: resultado.configuracion_id,
            bruto_diario: resultado.bruto_diario,
            combustible: resultado.combustible,
            neto_diario: resultado.neto_diario,
            base_reparto: resultado.base_reparto,
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
            base_reparto: resultado.base_reparto,
            varios: resultado.varios,
            parte_conductor: resultado.parte_conductor,
            parte_patron: resultado.parte_patron,
            modelo_reparto_aplicado: resultado.modelo_reparto_aplicado,
            porcentaje_conductor_aplicado: resultado.porcentaje_conductor_aplicado,
            porcentaje_patron_aplicado: resultado.porcentaje_patron_aplicado,
        },
    });
}
