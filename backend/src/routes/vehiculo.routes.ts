import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = { activo: true };
        if (req.usuario?.cliente_id) where.cliente_id = req.usuario.cliente_id;

        const vehiculos = await prisma.vehiculo.findMany({
            where,
            include: { conductores: { where: { activo: true }, include: { conductor: { include: { usuario: { select: { nombre: true } } } } } } },
        });
        res.json({ status: 'OK', data: vehiculos });
    } catch (err: any) {
        console.error('[VEHICULOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const vehiculo = await prisma.vehiculo.findUnique({
            where: { id: req.params.id },
            include: {
                conductores: { include: { conductor: { include: { usuario: { select: { nombre: true } } } } } },
                mantenimientos: { include: { catalogo: true } },
            },
        });
        if (!vehiculo) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        res.json({ status: 'OK', data: vehiculo });
    } catch (err: any) {
        console.error('[VEHICULOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        const { matricula, marca, modelo, fecha_matriculacion, tipo_combustible, tipo_transmision, km_actuales } = req.body;
        const vehiculo = await prisma.vehiculo.create({
            data: { cliente_id: req.usuario.cliente_id, matricula, marca, modelo, fecha_matriculacion: new Date(fecha_matriculacion), tipo_combustible, tipo_transmision, km_actuales: Number(km_actuales) || 0 },
        });
        res.status(201).json({ status: 'OK', data: vehiculo });
    } catch (err: any) {
        console.error('[VEHICULOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { matricula, marca, modelo, tipo_combustible, tipo_transmision } = req.body;
        const vehiculo = await prisma.vehiculo.update({
            where: { id: req.params.id },
            data: { ...(matricula && { matricula }), ...(marca && { marca }), ...(modelo && { modelo }), ...(tipo_combustible && { tipo_combustible }), ...(tipo_transmision && { tipo_transmision }) },
        });
        res.json({ status: 'OK', data: vehiculo });
    } catch (err: any) {
        console.error('[VEHICULOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
