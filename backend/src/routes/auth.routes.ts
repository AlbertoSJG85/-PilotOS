import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generarToken, requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/auth/login
 * Login by phone number — returns JWT token
 * In production this would use OTP verification via WhatsApp
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { telefono } = req.body;

        if (!telefono) {
            return res.status(400).json({ error: 'Teléfono es requerido' });
        }

        const usuario = await prisma.usuario.findUnique({
            where: { telefono },
            include: {
                vehiculosAsignados: {
                    where: { activo: true },
                    include: { vehiculo: true }
                }
            }
        });

        if (!usuario) {
            return res.status(404).json({
                error: 'Usuario no encontrado. Completa el onboarding primero.',
                redirectTo: `/onboarding?tel=${encodeURIComponent(telefono)}`
            });
        }

        if (!usuario.activo) {
            return res.status(403).json({ error: 'Cuenta desactivada' });
        }

        const token = generarToken(usuario);

        res.json({
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                telefono: usuario.telefono,
                rol: usuario.rol,
                vehiculos: usuario.vehiculosAsignados.map(va => ({
                    id: va.vehiculo.id,
                    matricula: va.vehiculo.matricula,
                    marca: va.vehiculo.marca,
                    modelo: va.vehiculo.modelo,
                })),
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', requireAuth as any, async (req: AuthRequest, res: Response) => {
    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: req.usuario!.id },
            include: {
                vehiculosAsignados: {
                    where: { activo: true },
                    include: { vehiculo: true }
                },
                conductores: req.usuario!.rol === 'PATRON' ? {
                    where: { activo: true },
                    select: { id: true, nombre: true, telefono: true }
                } : false,
            }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ data: usuario });

    } catch (error) {
        console.error('Error en /me:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
