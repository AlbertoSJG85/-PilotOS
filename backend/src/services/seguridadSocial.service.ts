/**
 * Seguridad Social de los asalariados (2026-08-12).
 *
 * Implementa la regla F4 del plan de acción, cerrada por Alberto el
 * 2026-08-11. No hay nada que decidir aquí: esto es la regla escrita.
 *
 *   · **Importe por conductor**, no por cliente. Cada asalariado tiene su
 *     cuota (`Conductor.cuota_ss_mensual`). null = no se le aplica.
 *   · **Modo por cliente** (`Cliente.ss_modo_descuento`): el patrón elige,
 *     para todos sus asalariados a la vez, si se descuenta en cada parte o
 *     en el cierre de periodo. No es una casilla por persona.
 *   · **Mes incompleto: SIN PRORRATEO.** Si el asalariado estuvo activo un
 *     solo día del mes, se descuenta la cuota completa. Esta es la parte que
 *     más se presta a "mejorarla" por error: no se toca.
 *
 * En modo 'parte', el descuento se carga ENTERO en el último parte del mes
 * de ese conductor, no repartido entre los días. Repartir obligaría a
 * recalcular todos los partes del mes cada vez que entra uno nuevo, y a pelear
 * con los redondeos para que la suma diera la cuota exacta.
 */
import { Prisma } from '@prisma/client';
import { prisma as prismaGlobal } from '../lib/prisma';

export type ModoDescuentoSS = 'parte' | 'cierre';

export function normalizarModo(valor: string | null | undefined): ModoDescuentoSS {
    return valor === 'parte' ? 'parte' : 'cierre';
}

/** Primer y último instante del mes al que pertenece una fecha (UTC). */
export function limitesDelMes(fecha: Date): { inicio: Date; fin: Date } {
    const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
    const fin = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { inicio, fin };
}

/**
 * Meses (como fecha del día 1) que toca un rango. Un rango del 20 de julio al
 * 5 de agosto toca DOS meses, y por tanto se deben DOS cuotas: es justo lo
 * que dice la regla de "sin prorrateo" — cada mes tocado devenga su cuota
 * completa.
 */
export function mesesDelRango(desde: Date, hasta: Date): Date[] {
    const meses: Date[] = [];
    const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
    const tope = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1));
    while (cursor <= tope) {
        meses.push(new Date(cursor));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return meses;
}

/**
 * ¿Es este el último parte del mes de ese conductor? Se usa en modo 'parte'
 * para saber dónde cargar la cuota.
 *
 * "Último" se decide por la fecha trabajada, no por el orden de envío: si
 * alguien registra el día 30 antes que el 28, la cuota tiene que acabar en el
 * 30 igualmente. Por eso, al entrar un parte posterior, hay que mover el
 * descuento — de eso se encarga `reubicarDescuentoDelMes`.
 */
export async function esUltimoParteDelMes(
    conductorId: string,
    fecha: Date,
    client: Prisma.TransactionClient | typeof prismaGlobal = prismaGlobal,
): Promise<boolean> {
    const { inicio, fin } = limitesDelMes(fecha);
    const posterior = await client.parteDiario.findFirst({
        where: {
            conductor_id: conductorId,
            fecha_trabajada: { gt: fecha, lte: fin, gte: inicio },
            estado: { in: ['ENVIADO', 'FOTO_SUSTITUIDA', 'PENDIENTE_VALIDACION'] },
        },
        select: { id: true },
    });
    return posterior === null;
}

export interface DetalleSS {
    conductor_id: string;
    nombre: string;
    cuota_mensual: number;
    meses: number;
    total: number;
}

/**
 * Seguridad Social devengada por un cliente en un rango. Sirve tanto para el
 * cierre de periodo como para el panel del dueño.
 *
 * Se cobra la cuota COMPLETA por cada mes que toca el rango y por cada
 * asalariado que estuvo activo. No se mira cuántos días trabajó: esa es
 * exactamente la regla.
 */
export async function calcularSeguridadSocial(
    clienteId: string,
    desde: Date,
    hasta: Date,
    client: Prisma.TransactionClient | typeof prismaGlobal = prismaGlobal,
): Promise<{ total: number; detalle: DetalleSS[] }> {
    const conductores = await client.conductor.findMany({
        where: {
            cliente_id: clienteId,
            es_patron: false,
            cuota_ss_mensual: { not: null },
        },
        include: { usuario: { select: { nombre: true } } },
    });

    const meses = mesesDelRango(desde, hasta).length;
    const detalle: DetalleSS[] = [];
    let total = 0;

    for (const c of conductores) {
        // Un asalariado dado de baja ANTES del periodo no devenga nada; uno
        // dado de alta a mitad, sí, y la cuota entera (regla de arriba).
        if (!c.activo && c.updated_at < desde) continue;

        const cuota = Number(c.cuota_ss_mensual);
        const suyo = cuota * meses;
        detalle.push({
            conductor_id: c.id,
            nombre: c.usuario?.nombre ?? 'Asalariado',
            cuota_mensual: cuota,
            meses,
            total: suyo,
        });
        total += suyo;
    }

    return { total, detalle };
}
