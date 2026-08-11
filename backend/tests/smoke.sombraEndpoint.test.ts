/**
 * Tests de humo — GET /internal/avisos/sombra (Fase E, 2026-08-11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const prismaMock = { sombraEnvio: { findMany: vi.fn() } };
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middleware/billing-access.middleware', () => ({ clienteTieneFeaturePro: vi.fn().mockResolvedValue(true) }));

const { default: internalRoutes } = await import('../src/routes/internal.routes');

function manejadorDe(metodo: string, ruta: string) {
    const capa = (internalRoutes as any).stack.find((c: any) => c.route?.path === ruta && c.route?.methods?.[metodo]);
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    return capa.route.stack[capa.route.stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

describe('GET /internal/avisos/sombra', () => {
    beforeEach(() => vi.clearAllMocks());

    it('resume ejecuciones y alertas de los últimos N días', async () => {
        prismaMock.sombraEnvio.findMany.mockResolvedValue([
            { id: '1', alerta: null },
            { id: '2', alerta: 'Tipo desconocido para la sombra: x' },
        ]);
        const res = mockRes();

        await manejadorDe('get', '/avisos/sombra')({ query: { dias: '7' } } as unknown as Request, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'OK', ventana_dias: 7, ejecuciones: 2, con_alerta: 1,
        }));
    });

    it('dias fuera de rango se acota a 60', async () => {
        prismaMock.sombraEnvio.findMany.mockResolvedValue([]);
        const res = mockRes();
        await manejadorDe('get', '/avisos/sombra')({ query: { dias: '9999' } } as unknown as Request, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ventana_dias: 60 }));
    });
});
