/**
 * Anomalias routes. R-AN-001: Se acumulan. R-AN-002: NUNCA se resetean.
 * DT-003: Notificaciones via n8n, no WhatsApp directo.
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const UMBRAL_AVISO_PATRON = 3; // R-AN-003

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { conductor_id, tipo, descripcion } = req.body;
        if (!conductor_id || !tipo || !descripcion) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields' });
            return;
        }

        const anomalia = await prisma.anomalia.create({ data: { conductor_id, tipo, descripcion } });
        const totalAnomalias = await prisma.anomalia.count({ where: { conductor_id } });

        let debe_notificar = false;
        let motivo = '';
        if (tipo === 'CRITICA') { debe_notificar = true; motivo = 'Anomalia critica detectada'; }
        else if (totalAnomalias % UMBRAL_AVISO_PATRON === 0) { debe_notificar = true; motivo = `${totalAnomalias} anomalias acumuladas`; }

        // Crear aviso para el patron (en lugar de enviar WhatsApp directo — DT-003)
        if (debe_notificar) {
            const conductor = await prisma.conductor.findUnique({
                where: { id: conductor_id },
                include: { cliente: true, usuario: { select: { nombre: true } } },
            });
            if (conductor?.cliente) {
                await prisma.aviso.create({
                    data: {
                        cliente_id: conductor.cliente.id,
                        tipo: 'ANOMALIA',
                        titulo: motivo,
                        mensaje: `Conductor ${conductor.usuario.nombre}: ${descripcion}`,
                        entidad_tipo: 'ANOMALIA',
                        entidad_id: anomalia.id,
                    },
                });
                await prisma.anomalia.update({ where: { id: anomalia.id }, data: { notificada: true } });
            }
        }

        res.status(201).json({
            status: 'OK', data: anomalia, total_anomalias: totalAnomalias, debe_notificar, motivo,
            evento: tipo === 'CRITICA' ? 'E-AN-004' : 'E-AN-001',
        });
    } catch (err: any) {
        console.error('[ANOMALIAS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { conductor_id } = req.query;
        const where: any = {};
        if (conductor_id) where.conductor_id = conductor_id;
        else if (req.usuario?.cliente_id) where.conductor = { cliente_id: req.usuario.cliente_id };

        const anomalias = await prisma.anomalia.findMany({
            where,
            include: { conductor: { include: { usuario: { select: { nombre: true } } } } },
            orderBy: { created_at: 'desc' },
        });
        res.json({ status: 'OK', data: anomalias });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

router.get('/conductor/:conductorId/total', async (req: any, res: Response) => {
    try {
        const total = await prisma.anomalia.count({ where: { conductor_id: req.params.conductorId } });
        const proximoUmbral = Math.ceil((total + 1) / UMBRAL_AVISO_PATRON) * UMBRAL_AVISO_PATRON;
        res.json({ status: 'OK', conductor_id: req.params.conductorId, total_anomalias: total, proximo_umbral: proximoUmbral, faltan_para_aviso: proximoUmbral - total });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

export default router;
