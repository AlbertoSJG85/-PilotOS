/**
 * Tests de humo — Fase 7 (higiene: comparacion de token en tiempo constante).
 *
 * Cubren requireInternalToken con crypto.timingSafeEqual: antes usaba
 * `token !== expectedToken`, vulnerable a timing attack. Verifica que sigue
 * aceptando el token correcto, rechaza uno incorrecto y no lanza cuando las
 * longitudes difieren (timingSafeEqual lanza si los buffers no son iguales
 * de longitud; el middleware debe manejarlo sin crashear).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response, NextFunction, Request } from 'express';
import { requireInternalToken } from '../src/middleware/internal-token.middleware';

function mockReq(token?: string): Request {
    return { headers: token !== undefined ? { 'x-internal-token': token } : {} } as unknown as Request;
}

function mockRes() {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
}

describe('requireInternalToken (timing-safe)', () => {
    const ORIGINAL = process.env.INTERNAL_API_TOKEN;

    beforeEach(() => {
        process.env.INTERNAL_API_TOKEN = 'secreto-de-prueba-largo-123456';
    });
    afterEach(() => {
        process.env.INTERNAL_API_TOKEN = ORIGINAL;
    });

    it('token correcto → pasa', () => {
        const req = mockReq('secreto-de-prueba-largo-123456');
        const res = mockRes();
        const next = vi.fn();
        requireInternalToken(req, res, next as NextFunction);
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('token incorrecto (misma longitud) → 401, no lanza', () => {
        const req = mockReq('secreto-de-prueba-largo-654321');
        const res = mockRes();
        const next = vi.fn();
        expect(() => requireInternalToken(req, res, next as NextFunction)).not.toThrow();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('CRITICO: token de longitud DISTINTA no lanza (timingSafeEqual exige misma longitud)', () => {
        const req = mockReq('corto');
        const res = mockRes();
        const next = vi.fn();
        expect(() => requireInternalToken(req, res, next as NextFunction)).not.toThrow();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('sin token → 401', () => {
        const req = mockReq(undefined);
        const res = mockRes();
        const next = vi.fn();
        requireInternalToken(req, res, next as NextFunction);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('sin INTERNAL_API_TOKEN configurado → 500 (no compara contra undefined)', () => {
        delete process.env.INTERNAL_API_TOKEN;
        const req = mockReq('cualquiera');
        const res = mockRes();
        const next = vi.fn();
        requireInternalToken(req, res, next as NextFunction);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
