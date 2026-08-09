/**
 * Tests de humo — idempotencia de /internal/registrar-gasto por huella del
 * documento (integracion con Hermes, Gate 13.3).
 *
 * Lo que se vigila: que el mismo justificante enviado dos veces NO cree dos
 * gastos, y que sin huella el comportamiento sea exactamente el de antes —
 * GlorIA no manda huella y no debia enterarse de este cambio.
 *
 * Se mockea prisma: aqui interesa la logica de la ruta, no la base de datos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const prismaMock = {
    ledgerEvento: { findUnique: vi.fn(), create: vi.fn() },
    gasto: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const { default: internalRoutes } = await import('../src/routes/internal.routes');

/** Saca el manejador de una ruta del router de Express, sin levantar servidor. */
function manejadorDe(metodo: string, ruta: string) {
    const capa = (internalRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo]
    );
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    return capa.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const cuerpoBase = {
    cliente_id: 'cli-1',
    tipo: 'COMBUSTIBLE',
    descripcion: 'Repostaje gasoleo A',
    importe: 62.4,
    fecha: '2026-08-09',
};

describe('registrar-gasto: idempotencia por huella', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.$transaction.mockImplementation(async (fn: any) =>
            fn({
                gasto: { create: vi.fn().mockResolvedValue({ id: 'gasto-nuevo', ...cuerpoBase }) },
                ledgerEvento: { create: vi.fn().mockResolvedValue({}) },
            })
        );
    });

    it('sin huella se comporta como siempre: crea el gasto', async () => {
        const res = mockRes();
        await manejadorDe('post', '/registrar-gasto')({ body: { ...cuerpoBase } } as Request, res);

        expect(prismaMock.ledgerEvento.findUnique).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'OK' }));
        expect(res.json.mock.calls[0][0].duplicado).toBeUndefined();
    });

    it('con huella nueva crea el gasto', async () => {
        prismaMock.ledgerEvento.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await manejadorDe('post', '/registrar-gasto')(
            { body: { ...cuerpoBase, huella: 'hash-del-ticket' } } as Request, res
        );

        expect(prismaMock.ledgerEvento.findUnique).toHaveBeenCalledWith({
            where: { dedupe_key: 'gasto-huella-hash-del-ticket' },
        });
        expect(prismaMock.$transaction).toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].gasto.id).toBe('gasto-nuevo');
    });

    it('el MISMO ticket dos veces devuelve el gasto original, no crea otro', async () => {
        prismaMock.ledgerEvento.findUnique.mockResolvedValue({
            dedupe_key: 'gasto-huella-hash-del-ticket',
            datos: { gasto_id: 'gasto-ya-existente' },
        });
        prismaMock.gasto.findUnique.mockResolvedValue({ id: 'gasto-ya-existente', ...cuerpoBase });
        const res = mockRes();

        await manejadorDe('post', '/registrar-gasto')(
            { body: { ...cuerpoBase, huella: 'hash-del-ticket' } } as Request, res
        );

        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            status: 'OK',
            gasto: expect.objectContaining({ id: 'gasto-ya-existente' }),
            duplicado: true,
        });
    });

    it('dos peticiones a la vez: la que choca contra el UNIQUE devuelve la original', async () => {
        prismaMock.ledgerEvento.findUnique
            // Antes de la transaccion todavia no existe...
            .mockResolvedValueOnce(null)
            // ...y despues del choque, si.
            .mockResolvedValueOnce({ datos: { gasto_id: 'gasto-de-la-otra' } });
        prismaMock.gasto.findUnique.mockResolvedValue({ id: 'gasto-de-la-otra', ...cuerpoBase });
        prismaMock.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
        const res = mockRes();

        await manejadorDe('post', '/registrar-gasto')(
            { body: { ...cuerpoBase, huella: 'hash-del-ticket' } } as Request, res
        );

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ duplicado: true }));
    });

    it('sigue exigiendo los campos obligatorios', async () => {
        const res = mockRes();
        await manejadorDe('post', '/registrar-gasto')(
            { body: { huella: 'hash', cliente_id: 'cli-1' } } as Request, res
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
});
