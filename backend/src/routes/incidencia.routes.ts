/**
 * Incidencias routes. R-IN-001: Solo via GlorIA. R-IN-002: Solo patron autoriza.
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatron, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { parte_diario_id, que_ocurrio, decision_tomada, justificacion } = req.body;
        if (!parte_diario_id || !que_ocurrio || !decision_tomada || !justificacion) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields' });
            return;
        }

        const parte = await prisma.parteDiario.findUnique({ where: { id: parte_diario_id } });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'parte_not_found' }); return; }

        // Encontrar el conductor patron que autoriza
        if (!req.usuario?.conductor_id) {
            res.status(400).json({ status: 'FAIL', error: 'no_conductor_context' });
            return;
        }

        const incidencia = await prisma.$transaction(async (tx) => {
            const inc = await tx.incidencia.create({
                data: { parte_diario_id, que_ocurrio, decision_tomada, justificacion, autorizador_id: req.usuario!.conductor_id!, estado: 'CREADA' },
            });
            await tx.ledgerEvento.create({
                data: { tipo_evento: 'INCIDENCIA_CREADA', source: 'PILOTOS', dedupe_key: `incidencia-${inc.id}`, datos: { incidencia_id: inc.id, parte_id: parte_diario_id } },
            });
            return inc;
        });

        res.status(201).json({ status: 'OK', data: incidencia, evento: 'E-IN-001' });
    } catch (err: any) {
        console.error('[INCIDENCIAS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = {};
        if (req.usuario?.es_patron && req.usuario?.conductor_id) {
            where.autorizador_id = req.usuario.conductor_id;
        } else if (req.usuario?.conductor_id) {
            where.parteDiario = { conductor_id: req.usuario.conductor_id };
        }

        const incidencias = await prisma.incidencia.findMany({
            where,
            include: {
                parteDiario: { include: { conductor: { include: { usuario: { select: { nombre: true } } } }, vehiculo: { select: { matricula: true } } } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json({ status: 'OK', data: incidencias });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const incidencia = await prisma.incidencia.findUnique({
            where: { id: req.params.id },
            include: { parteDiario: { include: { conductor: { include: { usuario: true } }, vehiculo: true, documentos: { include: { documento: true } } } } },
        });
        if (!incidencia) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        res.json({ status: 'OK', data: incidencia });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

router.patch('/:id/cerrar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const incidencia = await prisma.incidencia.findUnique({ where: { id: req.params.id } });
        if (!incidencia) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        if (incidencia.autorizador_id !== req.usuario?.conductor_id) {
            res.status(403).json({ status: 'FAIL', error: 'not_authorized' });
            return;
        }
        if (incidencia.estado === 'CERRADA') { res.status(400).json({ status: 'FAIL', error: 'already_closed' }); return; }

        const updated = await prisma.incidencia.update({ where: { id: req.params.id }, data: { estado: 'CERRADA', closed_at: new Date() } });
        res.json({ status: 'OK', data: updated, evento: 'E-IN-002' });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

export default router;
