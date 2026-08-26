/**
 * Scheduler Service — Cron jobs for PilotOS
 *
 * Runs daily checks for maintenance alerts and sends notifications.
 *
 * Fase 6 (2026-07-24), fixes sobre el scheduler original:
 *   - Usaba `new PrismaClient()` propio en vez del singleton (DT-011);
 *     ahora usa el mismo pool que el resto del backend.
 *   - node-cron corria sin zona horaria explicita (dependia del contenedor);
 *     ahora se fija Atlantic/Canary.
 *   - La deteccion/escalado/envio real vive en mantenimientoAlertas.service.ts
 *     (ver ese archivo para el detalle de M1-M9 del informe de auditoria).
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { procesarMantenimientos } from './mantenimientoAlertas.service';
import { clienteTieneFeaturePro } from '../middleware/billing-access.middleware';

const TIMEZONE = 'Atlantic/Canary';

/**
 * Check for maintenance items approaching deadline or overdue, y envia los
 * avisos correspondientes (dedupe por umbral, ver mantenimientoAlertas.service.ts).
 * Runs daily at 08:00 (Atlantic/Canary).
 */
async function verificarMantenimientos(): Promise<void> {
    console.log('⏰ [Scheduler] Verificando mantenimientos...');
    try {
        const resultado = await procesarMantenimientos(
            prisma,
            (patronId) => clienteTieneFeaturePro(patronId, 'pilotos_proactividad'),
        );
        console.log(
            `⏰ [Scheduler] Verificacion completada. ${resultado.evaluados} evaluados, ` +
            `${resultado.avisosCreados} avisos creados (${resultado.avisosEnviados} enviados, ${resultado.avisosFallidos} fallidos, ${resultado.avisosSilenciados} silenciados por preferencias).`
        );
    } catch (error) {
        console.error('❌ [Scheduler] Error verificando mantenimientos:', error);
    }
}

/**
 * Purga partes en estado BORRADOR antiguos (> 48h).
 * Evita que un BORRADOR olvidado bloquee el unique [vehiculo_id, fecha_trabajada]
 * cuando el conductor abandone el flujo a medias.
 *
 * Solo se eliminan los enlaces a documentos; los Documento se conservan
 * por su hash para deduplicación futura.
 */
async function purgarBorradoresAntiguos(): Promise<void> {
    console.log('⏰ [Scheduler] Purgando borradores > 48h...');
    try {
        const limite = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const candidatos = await prisma.parteDiario.findMany({
            where: { estado: 'BORRADOR', created_at: { lt: limite } },
            select: { id: true },
        });
        if (candidatos.length === 0) {
            console.log('⏰ [Scheduler] Sin borradores antiguos.');
            return;
        }
        for (const c of candidatos) {
            await prisma.$transaction(async (tx) => {
                await tx.documentoEnlace.deleteMany({
                    where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: c.id },
                });
                await tx.parteDiario.delete({ where: { id: c.id } });
            });
        }
        console.log(`⏰ [Scheduler] ${candidatos.length} borradores eliminados.`);
    } catch (error) {
        console.error('❌ [Scheduler] Error purgando borradores:', error);
    }
}

/** Lo que hay que poder parar al apagar. */
export type SchedulerHandle = { detener: () => void };

/**
 * Initialize all scheduled tasks.
 *
 * Fase 5 — devuelve un manejador para poder pararlas.
 *
 * Antes no devolvía nada, así que al apagar el proceso las tareas seguían
 * programadas hasta que moría. `purgarBorradoresAntiguos` **borra partes
 * diarios dentro de una transacción**: que arranque mientras se está cerrando
 * el pool es la forma de dejar un borrado a medias.
 *
 * ── LO QUE ESTO NO ARREGLA, Y CONVIENE NO CONFUNDIR ────────────────────────
 *
 * Estas tareas siguen **sin candado entre réplicas**. Con dos instancias, las
 * dos purgarían y las dos avisarían de los mismos mantenimientos: avisos
 * duplicados a los patrones.
 *
 * No se ha puesto candado aquí a propósito. El patrón obvio —
 * `pg_try_advisory_lock` de sesión, como en RentOS— **no es correcto sobre
 * Prisma**: Prisma reparte las consultas por un pool, así que el candado se
 * pediría en una conexión y se intentaría soltar en otra, quedándose puesto
 * hasta que esa conexión se reciclase. El resultado sería peor que no tener
 * candado: la tarea dejaría de ejecutarse en TODAS las réplicas, en silencio,
 * y solo se notaría al ver que los mantenimientos no se avisan.
 *
 * La alternativa correcta aquí es una lease en tabla con `UNIQUE(job)` y
 * `held_until`, reclamada con un UPDATE condicional. Es trabajo con migración
 * y queda anotado como hallazgo abierto de la Fase 5, no como resuelto.
 *
 * Hoy hay una sola réplica, así que no está roto — está esperando.
 */
export function iniciarScheduler(): SchedulerHandle {
    console.log('⏰ [Scheduler] Iniciando tareas programadas...');

    // Every day at 08:00 (Atlantic/Canary) — check maintenance
    const tareaMantenimientos = cron.schedule('0 8 * * *', () => {
        verificarMantenimientos();
    }, { timezone: TIMEZONE });
    console.log(`  ✅ Verificación de mantenimientos: diario a las 08:00 (${TIMEZONE})`);

    // Every day at 03:00 (Atlantic/Canary) — purge stale BORRADOR partes
    const tareaPurga = cron.schedule('0 3 * * *', () => {
        purgarBorradoresAntiguos();
    }, { timezone: TIMEZONE });
    console.log(`  ✅ Purga de borradores antiguos: diario a las 03:00 (${TIMEZONE})`);

    // Run immediately on startup in development
    if (process.env.NODE_ENV === 'development') {
        console.log('  🔄 [DEV] Ejecutando verificación inicial...');
        verificarMantenimientos();
    }

    return {
        detener: () => {
            tareaMantenimientos.stop();
            tareaPurga.stop();
            console.log('⏰ [Scheduler] Tareas programadas detenidas.');
        },
    };
}

export { verificarMantenimientos, purgarBorradoresAntiguos };
