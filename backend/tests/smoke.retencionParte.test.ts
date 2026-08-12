/**
 * Tests de humo — retención de partes con discrepancias (2026-08-12).
 *
 * La regla que se prueba aquí es la que pidió Alberto: un parte con
 * discrepancias NO puede subir a los globales hasta que el dueño lo mire, y
 * el dueño tiene dos salidas — aceptarlo o mandar rehacerlo.
 *
 * Lo que más importa de este archivo son los dos casos que protegen el
 * dinero: que un parte aceptado no se vuelva a retener solo, y que rehacer
 * devuelva el kilometraje del vehículo a su sitio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth.middleware';

const prismaMock: any = {
    parteDiario: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    anomalia: { updateMany: vi.fn() },
    calculoParte: { deleteMany: vi.fn() },
    documentoEnlace: { findMany: vi.fn(), deleteMany: vi.fn() },
    documento: { deleteMany: vi.fn() },
    ledgerEvento: { create: vi.fn() },
    vehiculo: { update: vi.fn() },
};
prismaMock.$transaction = vi.fn(async (fn: any) => fn(prismaMock));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const { aplicarRetencion, ESTADOS_COMPUTABLES, ESTADOS_ENVIADOS } = await import('../src/services/retencionParte.service');
const { default: parteRoutes } = await import('../src/routes/parteDiario.routes');

function manejadorFinalDe(metodo: string, ruta: string) {
    const capa = (parteRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo],
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

const PARTE_RETENIDO = {
    id: 'parte-1',
    estado: 'PENDIENTE_VALIDACION',
    vehiculo_id: 'veh-1',
    conductor_id: 'cond-1',
    fecha_trabajada: new Date('2026-08-10'),
    km_inicio: 252068,
    km_fin: 252100,
    ingreso_bruto: '32',
    ingreso_datafono: '0',
    combustible: null,
    vehiculo: { id: 'veh-1', cliente_id: 'cli-1' },
};

describe('la puerta de los globales', () => {
    it('PENDIENTE_VALIDACION no está entre los estados que computan', () => {
        expect(ESTADOS_COMPUTABLES).not.toContain('PENDIENTE_VALIDACION');
    });

    it('pero sí cuenta como turno físico (si no, el taxímetro vería un borrado sin explicar)', () => {
        expect(ESTADOS_ENVIADOS).toContain('PENDIENTE_VALIDACION');
    });
});

describe('aplicarRetencion', () => {
    beforeEach(() => vi.clearAllMocks());

    it('con discrepancias, un parte enviado queda retenido', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({ estado: 'ENVIADO', validado_at: null });
        expect(await aplicarRetencion('parte-1', 2)).toBe('RETENIDO');
        expect(prismaMock.parteDiario.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { estado: 'PENDIENTE_VALIDACION' } }),
        );
    });

    it('CLAVE: un parte que el dueño ya aceptó no se vuelve a retener solo', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({ estado: 'ENVIADO', validado_at: new Date() });
        expect(await aplicarRetencion('parte-1', 3)).toBe('SIN_CAMBIO');
        expect(prismaMock.parteDiario.update).not.toHaveBeenCalled();
    });

    it('si al sustituir la foto ya no hay discrepancias, el parte se suelta solo', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({ estado: 'PENDIENTE_VALIDACION', validado_at: null });
        expect(await aplicarRetencion('parte-1', 0)).toBe('LIBERADO');
        expect(prismaMock.parteDiario.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { estado: 'ENVIADO' } }),
        );
    });

    it('un BORRADOR no se toca: todavía no es un parte enviado', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({ estado: 'BORRADOR', validado_at: null });
        expect(await aplicarRetencion('parte-1', 5)).toBe('SIN_CAMBIO');
        expect(prismaMock.parteDiario.update).not.toHaveBeenCalled();
    });

    it('sin discrepancias y ya enviado: no toca nada', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({ estado: 'ENVIADO', validado_at: null });
        expect(await aplicarRetencion('parte-1', 0)).toBe('SIN_CAMBIO');
        expect(prismaMock.parteDiario.update).not.toHaveBeenCalled();
    });
});

describe('POST /api/partes/:id/validar (el dueño acepta)', () => {
    const handler = manejadorFinalDe('post', '/:id/validar');
    beforeEach(() => vi.clearAllMocks());

    it('pasa a ENVIADO, deja traza de quién lo aceptó y cierra sus anomalías', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(PARTE_RETENIDO);
        prismaMock.parteDiario.update.mockResolvedValue({ ...PARTE_RETENIDO, estado: 'ENVIADO' });
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON } as any, res);

        expect(prismaMock.parteDiario.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ estado: 'ENVIADO', validado_por: 42 }),
        }));
        expect(prismaMock.anomalia.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { parte_diario_id: 'parte-1', estado: 'ACTIVA' },
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'OK' }));
    });

    it('un parte de otro cliente → 404, sin tocar nada', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({
            ...PARTE_RETENIDO, vehiculo: { id: 'veh-1', cliente_id: 'cli-AJENO' },
        });
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON } as any, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(prismaMock.parteDiario.update).not.toHaveBeenCalled();
    });

    it('un parte que no está retenido → 409 (no hay nada que decidir)', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue({ ...PARTE_RETENIDO, estado: 'ENVIADO' });
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON } as any, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(prismaMock.parteDiario.update).not.toHaveBeenCalled();
    });
});

describe('POST /api/partes/:id/rehacer (el dueño lo rechaza)', () => {
    const handler = manejadorFinalDe('post', '/:id/rehacer');

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.documentoEnlace.findMany.mockResolvedValue([{ documento_id: 'doc-1' }, { documento_id: 'doc-2' }]);
        prismaMock.parteDiario.findMany.mockResolvedValue([{ km_fin: 252068 }]);
    });

    it('borra el parte y sus tickets para que el asalariado pueda repetir el día', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(PARTE_RETENIDO);
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON, body: { motivo: 'faltan tickets' } } as any, res);

        expect(prismaMock.documento.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['doc-1', 'doc-2'] } } });
        expect(prismaMock.calculoParte.deleteMany).toHaveBeenCalled();
        expect(prismaMock.parteDiario.delete).toHaveBeenCalledWith({ where: { id: 'parte-1' } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'OK', rehecho: true }));
    });

    it('CLAVE: el kilometraje del vehículo vuelve al del último parte que sobrevive', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(PARTE_RETENIDO);
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON, body: {} } as any, res);

        // Sin esto, el parte nuevo arrancaría en 252.100 km que nadie ha recorrido.
        expect(prismaMock.vehiculo.update).toHaveBeenCalledWith({
            where: { id: 'veh-1' }, data: { km_actuales: 252068 },
        });
    });

    it('deja constancia en el ledger con copia de las cifras que traía', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(PARTE_RETENIDO);
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON, body: { motivo: 'los km no cuadran' } } as any, res);

        const evento = prismaMock.ledgerEvento.create.mock.calls[0][0].data;
        expect(evento.tipo_evento).toBe('PARTE_RECHAZADO');
        expect(evento.datos.motivo).toBe('los km no cuadran');
        expect(evento.datos.snapshot).toMatchObject({ km_inicio: 252068, km_fin: 252100, ingreso_bruto: '32' });
    });

    it('las anomalías NO se borran: son el histórico de lo que pasó (R-AN-002)', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(PARTE_RETENIDO);
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON, body: {} } as any, res);

        expect(prismaMock.anomalia.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ estado: 'RESUELTA' }),
        }));
    });

    it('si no queda ningún parte del vehículo, el kilometraje no se toca', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(PARTE_RETENIDO);
        prismaMock.parteDiario.findMany.mockResolvedValue([]);
        const res = mockRes();

        await handler({ params: { id: 'parte-1' }, usuario: PATRON, body: {} } as any, res);

        expect(prismaMock.vehiculo.update).not.toHaveBeenCalled();
    });
});
