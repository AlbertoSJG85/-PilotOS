/**
 * Tests de humo — /api/revisiones (2026-11-12).
 * Auth y rol patrón ya se cubren en smoke.auth / smoke.rbac; aquí el handler:
 * aislamiento por cliente, estados y efecto de cada decisión.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth.middleware';

const tx = { documento: { update: vi.fn() }, tareaPendiente: { create: vi.fn() } };
const prismaMock = {
    documento: { findUnique: vi.fn() },
    aviso: { updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
};
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const { default: rutas } = await import('../src/routes/revision.routes');

function manejador(metodo: string, ruta: string) {
    const capa = (rutas as any).stack.find((c: any) => c.route?.path === ruta && c.route?.methods?.[metodo]);
    if (!capa) throw new Error(`no existe ${metodo} ${ruta}`);
    const st = capa.route.stack;
    return st[st.length - 1].handle as (req: AuthRequest, res: Response) => Promise<void>;
}
function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
}
const PATRON = { id: 42, role: 'user', es_patron: true, cliente_id: 'cli-1' };
const docDe = (cliente: string, estado = 'PENDIENTE_REVISION') => ({
    id: 'd1', estado,
    enlaces: [{ entidad_tipo: 'PARTE_DIARIO', parteDiario: { conductor_id: 'con-1', vehiculo: { cliente_id: cliente } } }],
});

describe('POST /api/revisiones/fotos/:id', () => {
    beforeEach(() => vi.clearAllMocks());

    it('resultado inválido → 400', async () => {
        const res = mockRes();
        await manejador('post', '/fotos/:id')({ params: { id: 'd1' }, body: { resultado: 'X' }, usuario: PATRON } as any, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('foto de otro cliente → 404 y no se toca', async () => {
        prismaMock.documento.findUnique.mockResolvedValue(docDe('cli-AJENO'));
        const res = mockRes();
        await manejador('post', '/fotos/:id')({ params: { id: 'd1' }, body: { resultado: 'VERIFICADA' }, usuario: PATRON } as any, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(tx.documento.update).not.toHaveBeenCalled();
    });

    it('foto que ya no está en revisión → 409', async () => {
        prismaMock.documento.findUnique.mockResolvedValue(docDe('cli-1', 'VALIDO'));
        const res = mockRes();
        await manejador('post', '/fotos/:id')({ params: { id: 'd1' }, body: { resultado: 'VERIFICADA' }, usuario: PATRON } as any, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('VERIFICADA → VALIDO con quién y cuándo, sin tarea', async () => {
        prismaMock.documento.findUnique.mockResolvedValue(docDe('cli-1'));
        const res = mockRes();
        await manejador('post', '/fotos/:id')({ params: { id: 'd1' }, body: { resultado: 'VERIFICADA' }, usuario: PATRON } as any, res);
        expect(tx.documento.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ estado: 'VALIDO', revisado_por: 42 }),
        }));
        expect(tx.tareaPendiente.create).not.toHaveBeenCalled();
    });

    it('NO_VERIFICADA → ILEGIBLE y tarea para el asalariado', async () => {
        prismaMock.documento.findUnique.mockResolvedValue(docDe('cli-1'));
        const res = mockRes();
        await manejador('post', '/fotos/:id')({ params: { id: 'd1' }, body: { resultado: 'NO_VERIFICADA' }, usuario: PATRON } as any, res);
        expect(tx.documento.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ estado: 'ILEGIBLE' }),
        }));
        expect(tx.tareaPendiente.create).toHaveBeenCalledWith({
            data: { tipo: 'FOTO_ILEGIBLE', entidad_tipo: 'DOCUMENTO', entidad_id: 'd1', conductor_id: 'con-1' },
        });
    });
});

describe('POST /api/revisiones/avisos/:id/visto', () => {
    beforeEach(() => vi.clearAllMocks());
    it('filtra siempre por el cliente de la sesión', async () => {
        prismaMock.aviso.updateMany.mockResolvedValue({ count: 1 });
        const res = mockRes();
        await manejador('post', '/avisos/:id/visto')({ params: { id: 'a1' }, usuario: PATRON } as any, res);
        expect(prismaMock.aviso.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'a1', cliente_id: 'cli-1', leido: false },
        }));
    });
});
