/**
 * Auth middleware para PilotOS.
 * DT-010: JWT_SECRET sin fallback hardcodeado.
 * DT-011: Usa PrismaClient singleton.
 *
 * Conecta con minos.Users para autenticacion.
 * El token JWT incluye: id (minos.Users.id), telefono, role.
 * El middleware enriquece con contexto PilotOS (conductor_id, cliente_id, es_patron).
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

// JWT_SECRET se valida al arrancar en index.ts
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRATION = '30d'; // Sesión larga para uso real en móvil (PWA)

export interface AuthRequest extends Request {
    usuario?: {
        id: number;          // minos.Users.id
        telefono: string;
        nombre: string;
        role: string;        // Renombrado de 'rol' a 'role' para consistencia con minos
        // Contexto PilotOS
        cliente_id?: string;
        conductor_id?: string;
        es_patron?: boolean;
    };
}

/**
 * Genera JWT token para un usuario autenticado.
 */
export function generarToken(usuario: { id: number; telefono: string; role: string; es_patron?: boolean; cliente_id?: string | null }): string {
    return jwt.sign(
        { id: usuario.id, telefono: usuario.telefono, role: usuario.role, es_patron: !!usuario.es_patron, cliente_id: usuario.cliente_id ?? null },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
    );
}

/**
 * Verifica que un recurso pertenece al mismo tenant que el usuario autenticado.
 * Los admins pasan siempre. Devuelve false si el tenant no coincide o no hay contexto.
 */
export function isSameTenant(req: AuthRequest, resourceClienteId: string | null | undefined): boolean {
    if (req.usuario?.role === 'admin') return true;
    if (!req.usuario?.cliente_id || !resourceClienteId) return false;
    return req.usuario.cliente_id === resourceClienteId;
}

/**
 * Middleware: Requiere autenticacion JWT.
 * Busca usuario en minos.Users y enriquece con contexto PilotOS.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    if (req.usuario) { next(); return; }
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ status: 'FAIL', error: 'auth_required', message: 'Token de autenticacion requerido' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; telefono: string; role: string };

        // Buscar en minos.Users
        const usuario = await prisma.minosUser.findUnique({
            where: { id: decoded.id },
        });

        if (!usuario) {
            res.status(401).json({ status: 'FAIL', error: 'user_not_found', message: 'Usuario no encontrado' });
            return;
        }

        // Enriquecer con contexto PilotOS
        const conductor = await prisma.conductor.findFirst({
            where: { usuario_id: usuario.id, activo: true },
        });

        const cliente = conductor
            ? await prisma.cliente.findFirst({ where: { id: conductor.cliente_id, activo: true } })
            : await prisma.cliente.findFirst({ where: { patron_id: usuario.id, activo: true } });

        req.usuario = {
            id: usuario.id,
            telefono: usuario.telefono || '',
            nombre: usuario.nombre || '',
            role: usuario.role || 'user',
            cliente_id: cliente?.id,
            conductor_id: conductor?.id,
            es_patron: conductor?.es_patron ?? (cliente?.patron_id === usuario.id),
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ status: 'FAIL', error: 'token_expired', message: 'Token expirado' });
            return;
        }
        res.status(401).json({ status: 'FAIL', error: 'invalid_token', message: 'Token invalido' });
    }
}

/**
 * Middleware: Requiere rol especifico.
 * Roles PilotOS: 'patron', 'conductor', 'admin'
 */
export function requireRol(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.usuario) {
            res.status(401).json({ status: 'FAIL', error: 'auth_required' });
            return;
        }

        if (!roles.includes(req.usuario.role)) {
            res.status(403).json({
                status: 'FAIL',
                error: 'forbidden',
                message: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
            });
            return;
        }

        next();
    };
}

/**
 * Middleware: Exige contexto de cliente PilotOS (deny-by-default, Fase 2 auditoria
 * seguridad 2026-07-24).
 *
 * Antes de esta fase, varios listados construian el filtro tenant condicionalmente
 * (`if (req.usuario?.cliente_id) where.cliente_id = ...`): si el usuario autenticado
 * no tenia cliente_id (p.ej. un usuario minos de otro producto NexOS sin contexto
 * PilotOS, o una resolucion de contexto fallida), el filtro se omitia por completo
 * y la consulta devolvia datos de TODOS los clientes. Este middleware corta ese
 * caso antes de llegar al handler: sin cliente_id y sin ser admin, 403 directo.
 */
export function requireClienteContext(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.usuario) {
        res.status(401).json({ status: 'FAIL', error: 'auth_required' });
        return;
    }
    if (req.usuario.role === 'admin') { next(); return; }
    if (!req.usuario.cliente_id) {
        res.status(403).json({ status: 'FAIL', error: 'no_client_context', message: 'Tu cuenta no tiene un cliente PilotOS asociado' });
        return;
    }
    next();
}

/**
 * Middleware: Requiere que el usuario sea patron del cliente.
 * Util para operaciones que solo el patron puede hacer (configuracion, incidencias, etc.)
 */
export function requirePatron(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.usuario) {
        res.status(401).json({ status: 'FAIL', error: 'auth_required' });
        return;
    }

    if (!req.usuario.es_patron && req.usuario.role !== 'admin') {
        res.status(403).json({
            status: 'FAIL',
            error: 'patron_required',
            message: 'Solo el patron puede realizar esta accion',
        });
        return;
    }

    next();
}
