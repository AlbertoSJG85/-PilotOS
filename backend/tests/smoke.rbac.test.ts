/**
 * Tests de humo — Fase 3 (RBAC basado en es_patron).
 *
 * Cubren requirePatron, que ahora protege 8 rutas estructurales (vehiculos,
 * conductores, gastos fijos, mantenimientos, incidencias, cierres). El bug
 * original (cierre.routes.ts usaba requireRol('admin','patron')) fallaba
 * porque minos.Users.role vale 'user' para un propietario normal — el rol
 * PilotOS "patron" vive en es_patron/Conductor, no en minos.role.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requirePatron, AuthRequest } from '../src/middleware/auth.middleware';

function mockRes() {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
}

function reqCon(usuario: AuthRequest['usuario']): AuthRequest {
    return { usuario } as AuthRequest;
}

describe('requirePatron', () => {
    it('sin usuario autenticado → 401', () => {
        const req = reqCon(undefined);
        const res = mockRes();
        const next = vi.fn();
        requirePatron(req, res, next as NextFunction);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('CRITICO: propietario con minos.role="user" pero es_patron=true → pasa (el bug original lo bloqueaba)', () => {
        const req = reqCon({ id: 1, telefono: '', nombre: '', role: 'user', es_patron: true, cliente_id: 'cliente-A' });
        const res = mockRes();
        const next = vi.fn();
        requirePatron(req, res, next as NextFunction);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('admin pasa aunque es_patron sea false', () => {
        const req = reqCon({ id: 2, telefono: '', nombre: '', role: 'admin', es_patron: false });
        const res = mockRes();
        const next = vi.fn();
        requirePatron(req, res, next as NextFunction);
        expect(next).toHaveBeenCalledOnce();
    });

    it('conductor asalariado (es_patron=false, role=user) → 403', () => {
        const req = reqCon({ id: 3, telefono: '', nombre: '', role: 'user', es_patron: false, cliente_id: 'cliente-A' });
        const res = mockRes();
        const next = vi.fn();
        requirePatron(req, res, next as NextFunction);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
