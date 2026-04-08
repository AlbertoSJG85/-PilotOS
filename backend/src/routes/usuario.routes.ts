import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// GET /api/usuarios — Listar conductores del cliente
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = { activo: true };
        if (req.usuario?.cliente_id) where.cliente_id = req.usuario.cliente_id;

        const conductores = await prisma.conductor.findMany({
            where,
            include: {
                usuario: { select: { id: true, nombre: true, telefono: true, role: true } },
                vehiculosAsignados: { where: { activo: true }, include: { vehiculo: { select: { id: true, matricula: true } } } },
            },
        });
        res.json({ status: 'OK', data: conductores });
    } catch (err: any) {
        console.error('[USUARIOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/usuarios/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const conductor = await prisma.conductor.findUnique({
            where: { id: req.params.id },
            include: {
                usuario: { select: { id: true, nombre: true, telefono: true, email: true, role: true } },
                vehiculosAsignados: { include: { vehiculo: true } },
                anomalias: { orderBy: { created_at: 'desc' }, take: 20 },
            },
        });
        if (!conductor) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        res.json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
