/**
 * Tests de humo — Fase 2 (cerrar IDOR y fugas entre clientes).
 *
 * Cubren requireClienteContext, el middleware deny-by-default que reemplaza
 * el patron `if (usuario?.cliente_id) where.cliente_id = ...` responsable del
 * IDOR: sin base de datos, solo la logica de la puerta.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requireClienteContext, AuthRequest } from '../src/middleware/auth.middleware';

function mockRes() {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
}

function reqCon(usuario: AuthRequest['usuario']): AuthRequest {
    return { usuario } as AuthRequest;
}

describe('requireClienteContext (deny-by-default multi-tenant)', () => {
    it('sin usuario autenticado → 401, no llama a next()', () => {
        const req = reqCon(undefined);
        const res = mockRes();
        const next = vi.fn();
        requireClienteContext(req, res, next as NextFunction);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('admin pasa siempre, aunque no tenga cliente_id', () => {
        const req = reqCon({ id: 1, telefono: '', nombre: '', role: 'admin' });
        const res = mockRes();
        const next = vi.fn();
        requireClienteContext(req, res, next as NextFunction);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('CRITICO: usuario no-admin SIN cliente_id → 403, no llama a next() (el bug original dejaba pasar sin filtro)', () => {
        const req = reqCon({ id: 2, telefono: '', nombre: '', role: 'user' });
        const res = mockRes();
        const next = vi.fn();
        requireClienteContext(req, res, next as NextFunction);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('usuario no-admin CON cliente_id → pasa', () => {
        const req = reqCon({ id: 3, telefono: '', nombre: '', role: 'user', cliente_id: 'cliente-A' });
        const res = mockRes();
        const next = vi.fn();
        requireClienteContext(req, res, next as NextFunction);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});
