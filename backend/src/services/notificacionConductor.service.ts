/**
 * Avisos al conductor (2026-08-12).
 *
 * POR QUÉ EXISTE. Todo lo que el sistema tenía que decir iba dirigido al
 * patrón. Pero las dos decisiones sobre un parte retenido las sufre el
 * asalariado, y hasta hoy se enteraba por las bravas: si el dueño pedía
 * rehacerlo, el parte simplemente desaparecía de su pantalla sin explicación.
 *
 * Dos avisos, con nombre y apellidos de quien decidió:
 *   · REHACER_PARTE  → "tienes que volver a registrar el día X"
 *   · PARTE_ACEPTADO → "Fulano ha aceptado tu parte del día X y ya cuenta"
 *
 * Nunca lanza: un aviso que no se puede guardar no puede tumbar la decisión
 * del dueño, que es lo importante. Se registra en el log y se sigue.
 */
import { Prisma } from '@prisma/client';
import { prisma as prismaGlobal } from '../lib/prisma';

export type TipoNotificacion = 'REHACER_PARTE' | 'PARTE_ACEPTADO';

interface CrearNotificacion {
    conductorId: string;
    tipo: TipoNotificacion;
    titulo: string;
    mensaje: string;
    entidadTipo?: string;
    entidadId?: string;
}

export async function notificarConductor(
    datos: CrearNotificacion,
    client: Prisma.TransactionClient | typeof prismaGlobal = prismaGlobal,
): Promise<void> {
    try {
        await client.notificacionConductor.create({
            data: {
                conductor_id: datos.conductorId,
                tipo: datos.tipo,
                titulo: datos.titulo,
                mensaje: datos.mensaje,
                entidad_tipo: datos.entidadTipo ?? null,
                entidad_id: datos.entidadId ?? null,
            },
        });
    } catch (err: any) {
        console.error('[NOTIF-CONDUCTOR] No se pudo guardar el aviso (no bloquea):', err?.message);
    }
}

/** Formatea una fecha de parte como DD/MM/AAAA para el texto del aviso. */
export function fechaLegible(fecha: Date): string {
    return `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${fecha.getUTCFullYear()}`;
}

export function textoParteAceptado(nombreDueno: string, fecha: Date) {
    return {
        titulo: 'Tu parte ya cuenta',
        mensaje: `${nombreDueno} ha aceptado tu parte del ${fechaLegible(fecha)}. Ya está contabilizado.`,
    };
}

export function textoRehacerParte(nombreDueno: string, fecha: Date, motivo?: string | null) {
    return {
        titulo: 'Tienes que rehacer un parte',
        mensaje: `${nombreDueno} ha pedido que vuelvas a registrar el parte del ${fechaLegible(fecha)}.`
            + ` El anterior se ha eliminado, así que hazlo de nuevo con sus tickets.`
            + (motivo ? ` Motivo: ${motivo}` : ''),
    };
}
