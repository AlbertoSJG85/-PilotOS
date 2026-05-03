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

// POST /api/usuarios — Crear conductor
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        
        const { nombre, telefono, email, vehiculo_id, porcentaje_conductor, modelo_reparto } = req.body;
        if (!telefono) { res.status(400).json({ status: 'FAIL', error: 'missing_telefono' }); return; }

        const cliente_id = req.usuario.cliente_id;
        const asalaEmail = email || `${telefono}@pilotos.app`;

        const conductor = await prisma.$transaction(async (tx) => {
            // 1. MinosUser
            const user = await tx.minosUser.upsert({
                where: { email: asalaEmail },
                update: { nombre: nombre || undefined, telefono },
                create: {
                    nombre: nombre || 'Conductor',
                    telefono,
                    email: asalaEmail,
                    password_hash: 'CONDUCTOR_NUEVO',
                    role: 'user',
                    estado_pago: 'AL DIA',
                },
            });

            // 2. Conductor
            const cond = await tx.conductor.create({
                data: {
                    cliente_id,
                    usuario_id: user.id,
                    es_patron: false,
                    activo: true
                },
            });

            // 3. Configuración Económica (opcional/por defecto)
            await tx.configuracionEconomica.create({
                data: {
                    cliente_id,
                    conductor_id: cond.id,
                    modelo_reparto: modelo_reparto || 'PORCENTAJE',
                    porcentaje_conductor: porcentaje_conductor ?? 50,
                    porcentaje_patron: 100 - (porcentaje_conductor ?? 50),
                    cuota_pilotos: 0,
                    incluye_combustible_en_reparto: true,
                },
            });

            // 4. Asignar vehículo si viene
            if (vehiculo_id) {
                await tx.vehiculoConductor.create({
                    data: { vehiculo_id, conductor_id: cond.id, activo: true }
                });
            }

            return cond;
        });

        res.status(201).json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error al crear:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PATCH /api/usuarios/:id — Editar / Desactivar
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { nombre, telefono, activo } = req.body;
        
        const conductor = await prisma.conductor.update({
            where: { id: req.params.id },
            data: {
                ...(activo !== undefined && { activo })
            },
            include: { usuario: true }
        });

        if (nombre || telefono) {
            await prisma.minosUser.update({
                where: { id: conductor.usuario_id },
                data: {
                    ...(nombre && { nombre }),
                    ...(telefono && { telefono })
                }
            });
        }

        res.json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error al editar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
