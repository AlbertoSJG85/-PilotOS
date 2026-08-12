/**
 * Retención de partes con discrepancias (2026-08-12).
 *
 * EL PORQUÉ. Hasta hoy, un parte con discrepancias entraba en los globales
 * igual que uno limpio: la incidencia aparecía en el panel, el dueño pulsaba
 * "revisada", desaparecía, y el dinero ya estaba contado desde el primer
 * momento. Es decir, el control existía pero no controlaba nada.
 *
 * Ahora un parte con discrepancias queda RETENIDO (estado
 * `PENDIENTE_VALIDACION`): sigue existiendo, se ve en los listados y en el
 * panel del asalariado, pero NO suma en resumen ni en cierres hasta que el
 * dueño toma una de las dos decisiones:
 *
 *   1. Aceptarlo — ha hablado con el asalariado y da el parte por bueno.
 *      Pasa a ENVIADO y entra en los globales.
 *   2. Pedir que se rehaga — el parte y sus tickets se borran, y el
 *      asalariado vuelve a registrar ese día desde cero.
 *
 * Ambas viven en `parteDiario.routes.ts`; aquí está solo la decisión
 * automática de retener o soltar, que se llama desde todos los sitios donde
 * se recalculan las discrepancias (confirmar el parte, subir una foto,
 * sustituirla, reintentar el OCR).
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as prismaGlobal } from '../lib/prisma';

/** Estados de un parte ya enviado que SÍ cuentan en los globales. */
export const ESTADOS_COMPUTABLES = ['ENVIADO', 'FOTO_SUSTITUIDA'] as const;

/**
 * Estados de un parte ya enviado, cuente o no en los globales. Se usa donde
 * importa el hecho físico (hubo un turno con ese vehículo) y no el dinero:
 * la comparación de acumulados del taxímetro, por ejemplo, tiene que contar
 * un turno retenido igual que uno aceptado — si no, el turno "desaparece" y
 * el sistema cree que hay un borrado sin explicar.
 */
export const ESTADOS_ENVIADOS = ['ENVIADO', 'FOTO_SUSTITUIDA', 'PENDIENTE_VALIDACION'] as const;

export const ESTADO_RETENIDO = 'PENDIENTE_VALIDACION';

export type ResultadoRetencion = 'RETENIDO' | 'LIBERADO' | 'SIN_CAMBIO';

/**
 * Aplica (o levanta) la retención de un parte según cuántas discrepancias
 * tenga tras el último recálculo.
 *
 * - Con discrepancias y sin decisión del dueño → RETENIDO.
 * - Sin discrepancias y retenido → LIBERADO (p.ej. el asalariado sustituyó
 *   una foto ilegible y ahora todo cuadra: no hay nada que decidir).
 * - Ya validado por el dueño → nunca se vuelve a retener. Su decisión pesa
 *   más que una relectura del OCR.
 * - BORRADOR → no se toca: todavía no es un parte enviado.
 */
export async function aplicarRetencion(
    parteId: string,
    totalDiscrepancias: number,
    client: PrismaClient | Prisma.TransactionClient = prismaGlobal,
): Promise<ResultadoRetencion> {
    const parte = await client.parteDiario.findUnique({
        where: { id: parteId },
        select: { estado: true, validado_at: true },
    });
    if (!parte || parte.estado === 'BORRADOR') return 'SIN_CAMBIO';

    if (totalDiscrepancias > 0) {
        if (parte.validado_at) return 'SIN_CAMBIO'; // el dueño ya decidió
        if (parte.estado === ESTADO_RETENIDO) return 'SIN_CAMBIO';
        await client.parteDiario.update({ where: { id: parteId }, data: { estado: ESTADO_RETENIDO } });
        return 'RETENIDO';
    }

    if (parte.estado === ESTADO_RETENIDO) {
        await client.parteDiario.update({ where: { id: parteId }, data: { estado: 'ENVIADO' } });
        return 'LIBERADO';
    }
    return 'SIN_CAMBIO';
}
