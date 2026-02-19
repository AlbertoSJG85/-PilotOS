import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'pilotos-secret-change-in-production';
const JWT_EXPIRATION = '7d';

// Extend Express Request to include user info
export interface AuthRequest extends Request {
    usuario?: {
        id: string;
        telefono: string;
        nombre: string;
        rol: string;
        patronId?: string | null;
    };
}

/**
 * Generate JWT token for a user
 */
export function generarToken(usuario: { id: string; telefono: string; nombre: string; rol: string }): string {
    return jwt.sign(
        { id: usuario.id, telefono: usuario.telefono, rol: usuario.rol },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
    );
}

/**
 * Middleware: Require authentication
 * Extracts JWT from Authorization header and attaches user to request
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Token de autenticación requerido' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; telefono: string; rol: string };

        const usuario = await prisma.usuario.findUnique({
            where: { id: decoded.id }
        });

        if (!usuario || !usuario.activo) {
            res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
            return;
        }

        req.usuario = {
            id: usuario.id,
            telefono: usuario.telefono,
            nombre: usuario.nombre,
            rol: usuario.rol,
            patronId: usuario.patronId,
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Token expirado' });
            return;
        }
        res.status(401).json({ error: 'Token inválido' });
    }
}

/**
 * Middleware: Require specific role
 */
export function requireRol(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.usuario) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        if (!roles.includes(req.usuario.rol)) {
            res.status(403).json({
                error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
            });
            return;
        }

        next();
    };
}
