/**
 * Auth routes — Login y /me para PilotOS.
 * Conecta con minos.Users (DT-011 singleton, DT-010 sin fallback).
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generarToken, requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/auth/login
 * Autenticacion por telefono. Dual-format (+34.../34...).
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { telefono } = req.body;
        if (!telefono) {
            res.status(400).json({ status: 'FAIL', error: 'missing_telefono' });
            return;
        }

        const phoneVariants = [telefono];
        if (telefono.startsWith('+')) phoneVariants.push(telefono.substring(1));
        else phoneVariants.push('+' + telefono);

        // Buscar todos los usuarios con ese teléfono (puede haber varios en el ecosistema NexOS,
        // ej. un usuario de RentOS y uno de PilotOS con el mismo número).
        // Preferir el usuario que tenga contexto PilotOS (conductor o patrón).
        const candidatos = await prisma.minosUser.findMany({
            where: { telefono: { in: phoneVariants } },
        });

        if (candidatos.length === 0) {
            res.status(404).json({
                status: 'FAIL',
                error: 'user_not_found',
                message: 'Usuario no registrado',
                action: 'REDIRECT_ONBOARDING',
            });
            return;
        }

        // Seleccionar el usuario con contexto PilotOS; si ninguno lo tiene, usar el primero.
        let usuario = candidatos[0];
        if (candidatos.length > 1) {
            for (const candidato of candidatos) {
                const tienePilotos = await prisma.conductor.findFirst({ where: { usuario_id: candidato.id, activo: true } })
                    ?? await prisma.cliente.findFirst({ where: { patron_id: candidato.id, activo: true } });
                if (tienePilotos) { usuario = candidato; break; }
            }
        }

        const token = generarToken({ id: usuario.id, telefono: usuario.telefono || '', role: usuario.role || 'user' });

        const conductor = await prisma.conductor.findFirst({
            where: { usuario_id: usuario.id, activo: true },
            include: { cliente: true },
        });
        const cliente = conductor?.cliente
            ?? await prisma.cliente.findFirst({ where: { patron_id: usuario.id, activo: true } });

        res.json({
            status: 'OK',
            token,
            user: { id: usuario.id, nombre: usuario.nombre || '', telefono: usuario.telefono || '', role: usuario.role || 'user' },
            context: cliente ? {
                cliente_id: cliente.id,
                conductor_id: conductor?.id,
                es_patron: conductor?.es_patron ?? (cliente.patron_id === usuario.id),
                tipo_actividad: cliente.tipo_actividad,
            } : null,
        });
    } catch (err: any) {
        console.error('[AUTH] login error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario) { res.status(401).json({ status: 'FAIL', error: 'auth_required' }); return; }

        const vehiculos = req.usuario.conductor_id
            ? await prisma.vehiculoConductor.findMany({
                where: { conductor_id: req.usuario.conductor_id, activo: true },
                include: { vehiculo: { select: { id: true, matricula: true, marca: true, modelo: true, km_actuales: true } } },
            })
            : [];

        const conductores = req.usuario.es_patron && req.usuario.cliente_id
            ? await prisma.conductor.findMany({
                where: { cliente_id: req.usuario.cliente_id, activo: true },
                include: { usuario: { select: { id: true, nombre: true, telefono: true } } },
            })
            : [];

        res.json({
            status: 'OK',
            user: req.usuario,
            vehiculos: vehiculos.map((vc) => vc.vehiculo),
            conductores: conductores.map((c) => ({ id: c.id, nombre: c.usuario.nombre, telefono: c.usuario.telefono, es_patron: c.es_patron })),
        });
    } catch (err: any) {
        console.error('[AUTH] /me error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

export default router;
