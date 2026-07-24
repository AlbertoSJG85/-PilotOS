import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireClienteContext, requirePatron, isSameTenant, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, requireClienteContext, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = { activo: true };
        if (req.usuario?.role !== 'admin') where.cliente_id = req.usuario!.cliente_id;

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
        if (!vehiculo || !isSameTenant(req, vehiculo.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        res.json({ status: 'OK', data: vehiculo });
    } catch (err: any) {
        console.error('[VEHICULOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// Fase 3 RBAC: solo el patron puede dar de alta un vehiculo.
router.post('/', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
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

// Fase 3 RBAC: solo el patron puede editar/dar de baja un vehiculo.
router.patch('/:id', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.vehiculo.findUnique({ where: { id: req.params.id }, select: { cliente_id: true } });
        if (!existing || !isSameTenant(req, existing.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        const { matricula, marca, modelo, tipo_combustible, tipo_transmision, activo } = req.body;
        const vehiculo = await prisma.vehiculo.update({
            where: { id: req.params.id },
            data: { 
                ...(matricula && { matricula }), 
                ...(marca && { marca }), 
                ...(modelo && { modelo }), 
                ...(tipo_combustible && { tipo_combustible }), 
                ...(tipo_transmision && { tipo_transmision }),
                ...(activo !== undefined && { activo })
            },
        });
        res.json({ status: 'OK', data: vehiculo });
    } catch (err: any) {
        console.error('[VEHICULOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// Fase 3 RBAC: solo el patron puede asignar conductores a un vehiculo.
router.post('/:id/conductores', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const vehiculo_id = req.params.id;
        const existing = await prisma.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { cliente_id: true } });
        if (!existing || !isSameTenant(req, existing.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        const { conductor_ids } = req.body;

        // Fase 2 (seguridad): los conductor_ids deben pertenecer al mismo cliente
        // que el vehiculo. Sin esta comprobacion, un patron podia enganchar
        // conductores de OTRO cliente al asignar por id directamente.
        if (conductor_ids && Array.isArray(conductor_ids) && conductor_ids.length > 0) {
            const conductoresValidos = await prisma.conductor.findMany({
                where: { id: { in: conductor_ids }, cliente_id: existing.cliente_id },
                select: { id: true },
            });
            if (conductoresValidos.length !== conductor_ids.length) {
                res.status(403).json({ status: 'FAIL', error: 'conductor_cross_tenant', message: 'Uno o mas conductores no pertenecen a tu cliente' });
                return;
            }
        }

        // 1. Desactivar las asignaciones actuales de este vehículo
        await prisma.vehiculoConductor.updateMany({
            where: { vehiculo_id },
            data: { activo: false }
        });

        // 2. Activar o crear las nuevas asignaciones
        if (conductor_ids && Array.isArray(conductor_ids)) {
            for (const conductor_id of conductor_ids) {
                await prisma.vehiculoConductor.upsert({
                    where: { vehiculo_id_conductor_id: { vehiculo_id, conductor_id } },
                    update: { activo: true },
                    create: { vehiculo_id, conductor_id, activo: true }
                });
            }
        }

        res.json({ status: 'OK' });
    } catch (err: any) {
        console.error('[VEHICULOS] Error al asignar conductores:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
