import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireClienteContext, requirePatron, isSameTenant, AuthRequest } from '../middleware/auth.middleware';
import { PLACEHOLDER_PASSWORD_HASHES } from '../lib/password';
import { sincronizarCantidadAsalariados } from '../services/billing-sync.service';
import { clienteTieneFeaturePro } from '../middleware/billing-access.middleware';

const router = Router();

// GET /api/usuarios — Listar conductores del cliente
router.get('/', requireAuth, requireClienteContext, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = { activo: true };
        if (req.usuario?.role !== 'admin') where.cliente_id = req.usuario!.cliente_id;

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
        if (!conductor || !isSameTenant(req, conductor.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        res.json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// POST /api/usuarios — Crear conductor (Fase 3 RBAC: solo el patron puede dar de alta conductores)
router.post('/', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        
        const { nombre, telefono, email, vehiculo_id, porcentaje_conductor, modelo_reparto } = req.body;
        if (!telefono) { res.status(400).json({ status: 'FAIL', error: 'missing_telefono' }); return; }

        const cliente_id = req.usuario.cliente_id;
        if (req.usuario.role !== 'admin'
            && !(await clienteTieneFeaturePro(req.usuario.id, 'pilotos_asalariados'))) {
            res.status(409).json({
                status: 'FAIL', error: 'pro_required_for_employees',
                message: 'Para añadir asalariados, el cliente debe estar en PilotOS Pro.',
            });
            return;
        }
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
                    password_hash: PLACEHOLDER_PASSWORD_HASHES[0], // 'CONDUCTOR_NUEVO'
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

            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'ASALARIADO_CREADO',
                    source: 'PILOTOS',
                    dedupe_key: `asalariado-creado-${cond.id}`,
                    datos: { cliente_id, conductor_id: cond.id, usuario_id: user.id },
                },
            });

            return cond;
        });

        res.status(201).json({ status: 'OK', data: conductor });
        sincronizarCantidadAsalariados(cliente_id, `asalariado-creado-${conductor.id}`)
            .catch((error) => console.warn('[nexos-pay] sync asalariados fallida:', error?.message));
    } catch (err: any) {
        console.error('[USUARIOS] Error al crear:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PATCH /api/usuarios/:id — Editar/Desactivar (Fase 3 RBAC: solo patron)
router.patch('/:id', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.conductor.findUnique({
            where: { id: req.params.id },
            select: { cliente_id: true, activo: true, es_patron: true },
        });
        if (!existing || !isSameTenant(req, existing.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        const { nombre, telefono, activo } = req.body;
        if (activo !== undefined && typeof activo !== 'boolean') {
            res.status(400).json({ status: 'FAIL', error: 'invalid_activo' }); return;
        }
        if (!existing.es_patron && activo === true && existing.activo === false
            && req.usuario?.role !== 'admin'
            && !(await clienteTieneFeaturePro(req.usuario!.id, 'pilotos_asalariados'))) {
            res.status(409).json({
                status: 'FAIL', error: 'pro_required_for_employees',
                message: 'Para reactivar asalariados, el cliente debe estar en PilotOS Pro.',
            });
            return;
        }

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

        if (!existing.es_patron && activo !== undefined && activo !== existing.activo) {
            const eventoId = `asalariado-${activo ? 'reactivado' : 'desactivado'}-${conductor.id}-${conductor.updated_at.toISOString()}`;
            await prisma.ledgerEvento.upsert({
                where: { dedupe_key: eventoId },
                create: {
                    tipo_evento: activo ? 'ASALARIADO_REACTIVADO' : 'ASALARIADO_DESACTIVADO',
                    source: 'PILOTOS', dedupe_key: eventoId,
                    datos: { cliente_id: existing.cliente_id, conductor_id: conductor.id, activo },
                },
                update: {},
            });
            sincronizarCantidadAsalariados(existing.cliente_id, eventoId)
                .catch((error) => console.warn('[nexos-pay] sync asalariados fallida:', error?.message));
        }
        res.json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error al editar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
