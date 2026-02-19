/**
 * Scheduler Service — Cron jobs for PilotOS
 * 
 * Runs daily checks for maintenance alerts and sends notifications.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { notificarPatronMantenimiento } from './whatsapp.service';

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
                conductores: {
                    where: { activo: true },
                    include: {
                        conductor: {
                            include: {
                                patron: true
                            }
                        }
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
            // Find the patron for this vehicle
            const patronData = vehiculo.conductores[0]?.conductor?.patron;
            if (!patronData) continue;

            for (const mant of vehiculo.mantenimientos) {
                let nuevoEstado: 'PENDIENTE' | 'VENCIDO' | null = null;

                // Check by kilometers
                if (mant.proximoKm && mant.proximoKm <= vehiculo.kmActuales) {
                    nuevoEstado = 'VENCIDO';
                }

                // Check by date
                if (mant.proximaFecha && mant.proximaFecha <= ahora) {
                    nuevoEstado = 'VENCIDO';
                }

                // If overdue and wasn't already marked
                if (nuevoEstado === 'VENCIDO' && mant.estado !== 'VENCIDO') {
                    await prisma.mantenimientoVehiculo.update({
                        where: { id: mant.id },
                        data: { estado: 'VENCIDO' }
                    });

                    await notificarPatronMantenimiento(
                        patronData.telefono,
                        vehiculo.matricula,
                        mant.catalogo.nombre,
                        'VENCIDO'
                    );

                    totalAlertas++;
                    console.log(`  🔴 VENCIDO: ${mant.catalogo.nombre} → ${vehiculo.matricula}`);
                }

                // Check if approaching (within 1000km or 30 days)
                const proximoEnKm = mant.proximoKm && mant.proximoKm <= vehiculo.kmActuales + 1000;
                const proximoEnFecha = mant.proximaFecha && mant.proximaFecha <= en30Dias;

                if ((proximoEnKm || proximoEnFecha) && mant.estado === 'PENDIENTE') {
                    await notificarPatronMantenimiento(
                        patronData.telefono,
                        vehiculo.matricula,
                        mant.catalogo.nombre,
                        'PROXIMO'
                    );

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
 * Initialize all scheduled tasks
 */
export function iniciarScheduler(): void {
    console.log('⏰ [Scheduler] Iniciando tareas programadas...');

    // Every day at 08:00 — check maintenance
    cron.schedule('0 8 * * *', () => {
        verificarMantenimientos();
    });

    console.log('  ✅ Verificación de mantenimientos: diario a las 08:00');

    // Run immediately on startup in development
    if (process.env.NODE_ENV === 'development') {
        console.log('  🔄 [DEV] Ejecutando verificación inicial...');
        verificarMantenimientos();
    }
}

export { verificarMantenimientos };
