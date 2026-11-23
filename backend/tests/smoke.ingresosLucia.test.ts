/**
 * Tests de humo — ingresos del taxi para la gestora en la sombra de LucIA (2026-11-23).
 * Lo que se vigila: que LucIA pueda LEER ingresos con su token acotado, que Hermes no entre por esa puerta,
 * que el rango se valide y que la cifra salga del mismo cálculo que el panel del dueño.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response, NextFunction, Request } from 'express';

vi.mock('../src/services/resumen.service', () => ({
    calcularResumen: vi.fn(async () => ({
        bruto: 30000, datafono: 12000, efectivo_estimado: 18000, combustible: 4000, seguridad_social: 900, partes_count: 87,
    })),
}));

import { requireInternalToken } from '../src/middleware/internal-token.middleware';
import { ingresosFiscales, leerRango, NOTA_INGRESOS } from '../src/services/ingresosFiscales.service';
import { calcularResumen } from '../src/services/resumen.service';

const TOTAL = 'token-total-de-pruebas-1234567890';
const HERMES = 'token-de-hermes-de-pruebas-098765';
const LUCIA = 'token-de-lucia-de-pruebas-246810';

const mockReq = (token: string, path: string) => ({ headers: { 'x-internal-token': token }, path }) as unknown as Request;
function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { status: any; json: any };
}

describe('token de LucIA y la ruta de ingresos', () => {
    const o = { t: process.env.INTERNAL_API_TOKEN, h: process.env.HERMES_INTERNAL_TOKEN, l: process.env.LUCIA_INTERNAL_TOKEN };
    beforeEach(() => { process.env.INTERNAL_API_TOKEN = TOTAL; process.env.HERMES_INTERNAL_TOKEN = HERMES; process.env.LUCIA_INTERNAL_TOKEN = LUCIA; });
    afterEach(() => { process.env.INTERNAL_API_TOKEN = o.t; process.env.HERMES_INTERNAL_TOKEN = o.h; process.env.LUCIA_INTERNAL_TOKEN = o.l; });

    it('LucIA entra en /ingresos con su token', () => {
        const req = mockReq(LUCIA, '/ingresos');
        const next = vi.fn() as NextFunction;
        requireInternalToken(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
        expect(req.internalScope).toBe('lucia');
    });

    it('Hermes NO entra en /ingresos: no es su puerta', () => {
        const res = mockRes();
        const next = vi.fn() as NextFunction;
        requireInternalToken(mockReq(HERMES, '/ingresos'), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('el token de LucIA sigue sin poder escribir gastos', () => {
        const res = mockRes();
        const next = vi.fn() as NextFunction;
        requireInternalToken(mockReq(LUCIA, '/registrar-gasto'), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe('rango de fechas', () => {
    it('acepta un trimestre', () => {
        const r = leerRango('2026-07-01', '2026-09-30');
        expect('error' in r).toBe(false);
    });
    it.each([
        [undefined, '2026-09-30'], ['2026-07-01', undefined], ['01/07/2026', '2026-09-30'], ['2026-02-30', '2026-03-31'],
        ['2026-09-30', '2026-07-01'], ['2025-01-01', '2026-12-31'],
    ])('rechaza %s → %s', (d, h) => {
        const r = leerRango(d, h);
        expect('error' in r && r.error).toBe('rango_invalido');
    });
});

describe('ingresosFiscales', () => {
    it('da el bruto del mismo cálculo que el panel y avisa de qué es', async () => {
        const rango = leerRango('2026-07-01', '2026-09-30');
        if ('error' in rango) throw new Error('rango');
        const r = await ingresosFiscales('cliente-1', rango);
        expect(calcularResumen).toHaveBeenCalledWith({ cliente_id: 'cliente-1', desde: rango.desde, hasta: rango.hasta });
        expect(r).toEqual({
            desde: '2026-07-01', hasta: '2026-09-30', bruto: 30000, datafono: 12000, efectivo_estimado: 18000,
            combustible: 4000, seguridad_social: 900, partes_count: 87, nota: NOTA_INGRESOS,
        });
    });
});
