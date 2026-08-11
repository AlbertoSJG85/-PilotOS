/**
 * Tests de humo — POST /api/anomalias/:id/revisar (2026-08-11).
 *
 * El patrón marca una anomalía como revisada desde el panel. `requireAuth` y
 * `requirePatron` ya están cubiertos por smoke.auth.test.ts / smoke.rbac.test.ts
 * — aquí se prueba el handler final: aislamiento por cliente e idempotencia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth.middleware';

const prismaMock = {
    anomalia: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const { default: anomaliaRoutes } = await import('../src/routes/anomalia.routes');

function manejadorFinalDe(metodo: string, ruta: string) {
    const capa = (anomaliaRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo]
    );
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    const stack = capa.route.stack;
    return stack[stack.length - 1].handle as (req: AuthRequest, res: Response) => Promise<void>;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const PATRON = { id: 42, telefono: '+34600000000', nombre: 'Patrón', role: 'user', es_patron: true, cliente_id: 'cli-1' };

describe('POST /api/anomalias/:id/revisar', () => {
    beforeEach(() => vi.clearAllMocks());

    it('anomalía de otro cliente → 404 (no confirma ni desmiente que exista)', async () => {
        prismaMock.anomalia.findUnique.mockResolvedValue({
            id: 'an-1', estado: 'ACTIVA', conductor: { cliente_id: 'cli-AJENO' },
        });
        const res = mockRes();
        await manejadorFinalDe('post', '/:id/revisar')(
            { params: { id: 'an-1' }, usuario: PATRON } as unknown as AuthRequest, res,
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(prismaMock.anomalia.update).not.toHaveBeenCalled();
    });

    it('anomalía inexistente → 404', async () => {
        prismaMock.anomalia.findUnique.mockResolvedValue(null);
        const res = mockRes();
        await manejadorFinalDe('post', '/:id/revisar')(
            { params: { id: 'no-existe' }, usuario: PATRON } as unknown as AuthRequest, res,
        );
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('anomalía del propio cliente, ACTIVA → se marca RESUELTA con quién y cuándo', async () => {
        prismaMock.anomalia.findUnique.mockResolvedValue({
            id: 'an-1', estado: 'ACTIVA', conductor: { cliente_id: 'cli-1' },
        });
        prismaMock.anomalia.update.mockResolvedValue({ id: 'an-1', estado: 'RESUELTA' });
        const res = mockRes();

        await manejadorFinalDe('post', '/:id/revisar')(
            { params: { id: 'an-1' }, usuario: PATRON } as unknown as AuthRequest, res,
        );

        expect(prismaMock.anomalia.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'an-1' },
            data: expect.objectContaining({ estado: 'RESUELTA', revisada_por: 42 }),
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'OK' }));
    });

    it('ya estaba RESUELTA → idempotente, no vuelve a escribir', async () => {
        prismaMock.anomalia.findUnique.mockResolvedValue({
            id: 'an-1', estado: 'RESUELTA', conductor: { cliente_id: 'cli-1' },
        });
        const res = mockRes();

        await manejadorFinalDe('post', '/:id/revisar')(
            { params: { id: 'an-1' }, usuario: PATRON } as unknown as AuthRequest, res,
        );

        expect(prismaMock.anomalia.update).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
