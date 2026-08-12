/**
 * Avisos del conductor (2026-08-12).
 *
 * Cada uno ve los suyos y solo los suyos: la consulta va SIEMPRE por el
 * conductor_id de la sesión, nunca por uno que llegue en la petición. Es la
 * misma lección de la auditoría de julio (Fase 2), donde un filtro que venía
 * del cliente permitía leer datos ajenos.
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/** GET /api/notificaciones?solo_no_leidas=true */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const conductorId = req.usuario?.conductor_id;
        if (!conductorId) {
            // Un usuario sin contexto de conductor no tiene avisos propios.
            res.json({ status: 'OK', data: [] });
            return;
        }

        const where: any = { conductor_id: conductorId };
        if (req.query.solo_no_leidas === 'true') where.leida_at = null;

        const data = await prisma.notificacionConductor.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 30,
        });
        res.json({ status: 'OK', data });
    } catch (err: any) {
        console.error('[NOTIFICACIONES] Error al listar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/** POST /api/notificaciones/:id/leer — marcar como leída (idempotente). */
router.post('/:id/leer', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const conductorId = req.usuario?.conductor_id;
        if (!conductorId) { res.status(403).json({ status: 'FAIL', error: 'no_conductor_context' }); return; }

        // El where incluye el conductor de la sesión: así, marcar el aviso de
        // otro no devuelve error revelador, simplemente no afecta a nada.
        const r = await prisma.notificacionConductor.updateMany({
            where: { id: req.params.id, conductor_id: conductorId, leida_at: null },
            data: { leida_at: new Date() },
        });
        res.json({ status: 'OK', marcadas: r.count });
    } catch (err: any) {
        console.error('[NOTIFICACIONES] Error al marcar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
