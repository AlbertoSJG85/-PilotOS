import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { notificarPatronAnomalias } from '../services/whatsapp.service';

const router = Router();
const prisma = new PrismaClient();

// Constante según regla R-AN-003
const UMBRAL_AVISO_PATRON = 3;

// POST /api/anomalias - Crear anomalía
router.post('/', async (req: Request, res: Response) => {
    try {
        const { conductorId, tipo, descripcion } = req.body;

        // Crear anomalía
        const anomalia = await prisma.anomalia.create({
            data: {
                conductorId,
                tipo: tipo,
                descripcion
            }
        });

        // R-AN-003: Contar anomalías acumuladas (NO se resetean)
        const totalAnomalias = await prisma.anomalia.count({
            where: { conductorId }
        });

        let debeNotificar = false;
        let motivo = '';

        // R-AN-004: Críticas → aviso inmediato
        if (tipo === 'CRITICA') {
            debeNotificar = true;
            motivo = 'Anomalía crítica detectada';
        }
        // R-AN-003: Cada 3 anomalías → aviso al patrón
        else if (totalAnomalias % UMBRAL_AVISO_PATRON === 0) {
            debeNotificar = true;
            motivo = `${totalAnomalias} anomalías acumuladas`;
        }

        // Send WhatsApp notification to patron if needed
        if (debeNotificar) {
            const conductor = await prisma.usuario.findUnique({
                where: { id: conductorId },
                include: { patron: true }
            });

            if (conductor?.patron) {
                await notificarPatronAnomalias(
                    conductor.patron.telefono,
                    conductor.nombre,
                    totalAnomalias,
                    motivo
                );

                // Mark anomaly as notified
                await prisma.anomalia.update({
                    where: { id: anomalia.id },
                    data: { notificada: true }
                });
            }
        }

        res.status(201).json({
            data: anomalia,
            totalAnomalias,
            debeNotificar,
            motivo,
            evento: tipo === 'CRITICA' ? 'E-AN-004' : 'E-AN-001'
        });

    } catch (error) {
        console.error('Error creando anomalía:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/anomalias - Listar anomalías
router.get('/', async (req: Request, res: Response) => {
    try {
        const { conductorId } = req.query;
        const where: any = {};
        if (conductorId) where.conductorId = conductorId;

        const anomalias = await prisma.anomalia.findMany({
            where,
            include: { conductor: true },
            orderBy: { createdAt: 'desc' }
        });

        // R-AN-001/R-AN-002: Contar totales (nunca se resetean)
        const conteo = await prisma.anomalia.groupBy({
            by: ['conductorId'],
            _count: { id: true },
            where
        });

        res.json({ data: anomalias, conteo });

    } catch (error) {
        console.error('Error listando anomalías:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/anomalias/conductor/:conductorId/total - Total acumulado
router.get('/conductor/:conductorId/total', async (req: Request, res: Response) => {
    try {
        const total = await prisma.anomalia.count({
            where: { conductorId: req.params.conductorId }
        });

        const proximoUmbral = Math.ceil((total + 1) / UMBRAL_AVISO_PATRON) * UMBRAL_AVISO_PATRON;
        const faltanParaAviso = proximoUmbral - total;

        res.json({
            conductorId: req.params.conductorId,
            totalAnomalias: total,
            proximoUmbral,
            faltanParaAviso
        });

    } catch (error) {
        console.error('Error contando anomalías:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
