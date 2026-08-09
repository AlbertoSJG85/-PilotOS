/**
 * Tests de humo — el token acotado de Hermes (2026-08-09).
 *
 * PilotOS es un producto comercial multi-cliente. Hermes vive en otro servidor
 * y solo tiene que leer el resumen del taxi de Alberto y registrarle gastos.
 * Darle el INTERNAL_API_TOKEN de siempre le habria dado acceso a los datos
 * internos de todos los clientes.
 *
 * Lo que se vigila aqui es lo que NO puede hacer:
 *   - entrar por una ruta que no le toca, aunque el token sea valido;
 *   - existir siquiera si HERMES_INTERNAL_TOKEN no esta configurado;
 *   - y (en la ruta de gasto) elegir el cliente_id.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response, NextFunction, Request } from 'express';
import { requireInternalToken } from '../src/middleware/internal-token.middleware';

const TOTAL = 'token-total-de-pruebas-1234567890';
const HERMES = 'token-de-hermes-de-pruebas-098765';

function mockReq(token: string | undefined, path = '/resumen'): Request {
    return {
        headers: token !== undefined ? { 'x-internal-token': token } : {},
        path,
    } as unknown as Request;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { status: any; json: any };
}

describe('token acotado de Hermes', () => {
    const ORIGINAL_TOTAL = process.env.INTERNAL_API_TOKEN;
    const ORIGINAL_HERMES = process.env.HERMES_INTERNAL_TOKEN;

    beforeEach(() => {
        process.env.INTERNAL_API_TOKEN = TOTAL;
        process.env.HERMES_INTERNAL_TOKEN = HERMES;
    });
    afterEach(() => {
        process.env.INTERNAL_API_TOKEN = ORIGINAL_TOTAL;
        process.env.HERMES_INTERNAL_TOKEN = ORIGINAL_HERMES;
    });

    it('el token total sigue entrando en todo, como siempre', () => {
        const req = mockReq(TOTAL, '/usuario-por-telefono');
        const next = vi.fn() as NextFunction;
        requireInternalToken(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
        expect(req.internalScope).toBe('total');
    });

    it('el token de Hermes entra en las rutas que le tocan', () => {
        for (const ruta of ['/resumen', '/registrar-gasto', '/mantenimientos', '/kb/producto']) {
            const req = mockReq(HERMES, ruta);
            const next = vi.fn() as NextFunction;
            requireInternalToken(req, mockRes(), next);
            expect(next, `deberia entrar en ${ruta}`).toHaveBeenCalled();
            expect(req.internalScope).toBe('hermes');
        }
    });

    it('el token de Hermes NO entra en una ruta que no le toca', () => {
        const res = mockRes();
        const next = vi.fn() as NextFunction;
        requireInternalToken(mockReq(HERMES, '/usuario-por-telefono'), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('sin HERMES_INTERNAL_TOKEN configurado, ese camino no existe', () => {
        delete process.env.HERMES_INTERNAL_TOKEN;
        const res = mockRes();
        const next = vi.fn() as NextFunction;
        requireInternalToken(mockReq(HERMES, '/resumen'), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('un token que no es ninguno de los dos sigue siendo 401', () => {
        const res = mockRes();
        const next = vi.fn() as NextFunction;
        requireInternalToken(mockReq('otro-token-cualquiera-123456789', '/resumen'), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
