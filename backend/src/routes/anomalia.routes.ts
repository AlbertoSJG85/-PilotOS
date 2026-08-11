/**
 * Anomalias routes. R-AN-001: Se acumulan. R-AN-002: la anomalía en sí NUNCA
 * se resetea ni se borra — es un hecho ocurrido. Lo que SÍ cambia (desde
 * 2026-08-11) es si el patrón ya la ha revisado (`estado`, `revisada_at`,
 * `revisada_por`): el WhatsApp puede no llegar o pasar desapercibido, así
 * que la anomalía se queda en rojo en el panel hasta que él decide.
 * DT-003: Notificaciones via n8n, no WhatsApp directo.
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatron, requireClienteContext, isSameTenant, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const UMBRAL_AVISO_PATRON = 3; // R-AN-003

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { conductor_id, tipo, descripcion } = req.body;
        if (!conductor_id || !tipo || !descripcion) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields' });
            return;
        }

        const conductorCheck = await prisma.conductor.findUnique({ where: { id: conductor_id }, select: { cliente_id: true } });
        if (!conductorCheck || !isSameTenant(req, conductorCheck.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'conductor_not_found' }); return;
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

router.get('/', requireAuth, requireClienteContext, async (req: AuthRequest, res: Response) => {
    try {
        const { conductor_id } = req.query;

        // Fase 2 (seguridad): si se filtra por conductor_id, ese conductor debe
        // pertenecer al mismo cliente que el usuario autenticado. Antes, pasar
        // un conductor_id de OTRO cliente devolvia sus anomalias sin comprobar
        // tenencia (bypass total del filtro por cliente_id).
        if (conductor_id && req.usuario?.role !== 'admin') {
            const conductorCheck = await prisma.conductor.findUnique({ where: { id: conductor_id as string }, select: { cliente_id: true } });
            if (!conductorCheck || !isSameTenant(req, conductorCheck.cliente_id)) {
                res.status(404).json({ status: 'FAIL', error: 'conductor_not_found' }); return;
            }
        }

        const where: any = {};
        if (conductor_id) where.conductor_id = conductor_id;
        else if (req.usuario?.role !== 'admin') where.conductor = { cliente_id: req.usuario!.cliente_id };

        const anomalias = await prisma.anomalia.findMany({
            where,
            include: { conductor: { include: { usuario: { select: { nombre: true } } } } },
            orderBy: { created_at: 'desc' },
        });
        res.json({ status: 'OK', data: anomalias });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

router.get('/conductor/:conductorId/total', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        // Fase 2 (seguridad): antes no se comprobaba tenencia en absoluto.
        const conductorCheck = await prisma.conductor.findUnique({ where: { id: req.params.conductorId }, select: { cliente_id: true } });
        if (!conductorCheck || !isSameTenant(req, conductorCheck.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'conductor_not_found' }); return;
        }

        const total = await prisma.anomalia.count({ where: { conductor_id: req.params.conductorId } });
        const proximoUmbral = Math.ceil((total + 1) / UMBRAL_AVISO_PATRON) * UMBRAL_AVISO_PATRON;
        res.json({ status: 'OK', conductor_id: req.params.conductorId, total_anomalias: total, proximo_umbral: proximoUmbral, faltan_para_aviso: proximoUmbral - total });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

// POST /api/anomalias/:id/revisar — el patrón marca que ya la ha visto y
// hablado con el asalariado (o decidido que no hace falta). Solo el patrón:
// es su criterio, no algo que el propio asalariado pueda cerrar sobre sí mismo.
router.post('/:id/revisar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const anomalia = await prisma.anomalia.findUnique({
            where: { id: req.params.id },
            include: { conductor: { select: { cliente_id: true } } },
        });
        if (!anomalia || !isSameTenant(req, anomalia.conductor.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'anomalia_not_found' }); return;
        }
        if (anomalia.estado === 'RESUELTA') {
            res.status(200).json({ status: 'OK', data: anomalia }); return; // idempotente
        }

        const actualizada = await prisma.anomalia.update({
            where: { id: anomalia.id },
            data: { estado: 'RESUELTA', revisada_at: new Date(), revisada_por: req.usuario!.id },
        });
        res.json({ status: 'OK', data: actualizada });
    } catch (err: any) {
        console.error('[ANOMALIAS] Error al revisar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
