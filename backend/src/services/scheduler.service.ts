/**
 * Scheduler Service — Cron jobs for PilotOS
 * 
 * Runs daily checks for maintenance alerts and sends notifications.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Check for maintenance items approaching deadline or overdue
 * Runs daily at 08:00
 */
async function verificarMantenimientos(): Promise<void> {
    console.log('⏰ [Scheduler] Verificando mantenimientos...');

    try {
        const ahora = new Date();
        const en30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Find all vehicles with their owners
        const vehiculos = await prisma.vehiculo.findMany({
            where: { activo: true },
            include: {
                cliente: {
                    include: {
                        patron: true
                    }
                },
                mantenimientos: {
                    where: {
                        estado: { in: ['PENDIENTE', 'VENCIDO'] }
                    },
                    include: { catalogo: true }
                }
            }
        });

        let totalAlertas = 0;

        for (const vehiculo of vehiculos) {
            // Find the patron for this vehicle via the client
            const patronData = vehiculo.cliente?.patron;
            if (!patronData) continue;

            for (const mant of vehiculo.mantenimientos) {
                let nuevoEstado: 'PENDIENTE' | 'VENCIDO' | null = null;

                // Check by kilometers
                if (mant.proximo_km && mant.proximo_km <= vehiculo.km_actuales) {
                    nuevoEstado = 'VENCIDO';
                }

                // Check by date
                if (mant.proxima_fecha && mant.proxima_fecha <= ahora) {
                    nuevoEstado = 'VENCIDO';
                }

                // If overdue and wasn't already marked
                if (nuevoEstado === 'VENCIDO' && mant.estado !== 'VENCIDO') {
                    await prisma.mantenimientoVehiculo.update({
                        where: { id: mant.id },
                        data: { estado: 'VENCIDO' }
                    });

                    // TODO (DT-003): Enviar webhook/evento a n8n para que GlorIA notifique
                    // patronData.telefono, vehiculo.matricula, mant.catalogo.nombre, 'VENCIDO'

                    totalAlertas++;
                    console.log(`  🔴 VENCIDO: ${mant.catalogo.nombre} → ${vehiculo.matricula}`);
                }

                // Check if approaching (within 1000km or 30 days)
                const proximoEnKm = mant.proximo_km && mant.proximo_km <= vehiculo.km_actuales + 1000;
                const proximoEnFecha = mant.proxima_fecha && mant.proxima_fecha <= en30Dias;

                if ((proximoEnKm || proximoEnFecha) && mant.estado === 'PENDIENTE') {
                    // TODO (DT-003): Enviar webhook/evento a n8n para que GlorIA notifique
                    // patronData.telefono, vehiculo.matricula, mant.catalogo.nombre, 'PROXIMO'

                    totalAlertas++;
                    console.log(`  🟡 PROXIMO: ${mant.catalogo.nombre} → ${vehiculo.matricula}`);
                }
            }
        }

        console.log(`⏰ [Scheduler] Verificación completada. ${totalAlertas} alertas enviadas.`);

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

/**
 * Initialize all scheduled tasks
 */
export function iniciarScheduler(): void {
    console.log('⏰ [Scheduler] Iniciando tareas programadas...');

    // Every day at 08:00 — check maintenance
    cron.schedule('0 8 * * *', () => {
        verificarMantenimientos();
    });
    console.log('  ✅ Verificación de mantenimientos: diario a las 08:00');

    // Every day at 03:00 — purge stale BORRADOR partes
    cron.schedule('0 3 * * *', () => {
        purgarBorradoresAntiguos();
    });
    console.log('  ✅ Purga de borradores antiguos: diario a las 03:00');

    // Run immediately on startup in development
    if (process.env.NODE_ENV === 'development') {
        console.log('  🔄 [DEV] Ejecutando verificación inicial...');
        verificarMantenimientos();
    }
}

export { verificarMantenimientos, purgarBorradoresAntiguos };
