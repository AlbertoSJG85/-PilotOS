/**
 * PIL-02 (onboarding) — completar el alta no puede sobrescribir la cuenta de
 * otro al dar de alta un asalariado cuyo email ya existe en minos.Users.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const tx: any = {
    minosUser: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    cliente: { create: vi.fn() },
    conductor: { findFirst: vi.fn(), create: vi.fn() },
    configuracionEconomica: { create: vi.fn() },
    vehiculo: { create: vi.fn() },
    vehiculoConductor: { create: vi.fn() },
    gastoFijo: { create: vi.fn() },
    mantenimientoCatalogo: { findMany: vi.fn() },
    mantenimientoVehiculo: { create: vi.fn() },
    onboarding: { update: vi.fn() },
    ledgerEvento: { create: vi.fn() },
};

const prismaMock: any = {
    onboarding: { findUnique: vi.fn() },
    minosUser: { findUnique: vi.fn() },
    cliente: { findFirst: vi.fn() },
    conductor: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/lib/nexos-pay', () => ({
    planPro: vi.fn(),
    provisionarCliente: vi.fn().mockResolvedValue({ ok: false }),
}));
vi.mock('../src/services/billing-sync.service', () => ({
    sincronizarCantidadAsalariados: vi.fn().mockResolvedValue(undefined),
}));

const { default: onboardingRoutes } = await import('../src/routes/onboarding.routes');

const completar = (() => {
    const capa = (onboardingRoutes as any).stack.find((c: any) => c.route?.path === '/:telefono/completar');
    return capa.route.stack[capa.route.stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
})();

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const peticion = () => ({ params: { telefono: '+34600000000' } }) as unknown as Request;

function onboardingCon(asalariados: any[]) {
    return {
        telefono: '+34600000000', completado: false, email_patron: 'tia@gmail.com',
        nombre_patron: 'Tía', tipo_actividad: 'TAXI', asalariados, gastos_fijos: [],
        matricula: '1234ABC', marca_modelo: 'Toyota Prius',
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.minosUser.findUnique.mockResolvedValue(null);
    tx.minosUser.findUnique.mockResolvedValue(null);
    tx.minosUser.create.mockImplementation(async ({ data }: any) => ({ id: 7, ...data }));
    tx.cliente.create.mockResolvedValue({ id: 'cli-1' });
    tx.conductor.findFirst.mockResolvedValue(null);
    tx.conductor.create.mockResolvedValue({ id: 'cond-1' });
    tx.vehiculo.create.mockResolvedValue({ id: 'veh-1', km_actuales: 0 });
    tx.mantenimientoCatalogo.findMany.mockResolvedValue([]);
});

describe('onboarding completar — asalariados', () => {
    it('control positivo: un asalariado nuevo se crea con normalidad', async () => {
        prismaMock.onboarding.findUnique.mockResolvedValue(
            onboardingCon([{ nombre: 'Chico', telefono: '+34622222222', email: 'Sara@Gmail.com' }]),
        );
        const res = mockRes();
        await completar(peticion(), res);
        expect(res.status).not.toHaveBeenCalled();
        expect(tx.minosUser.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ email: 'sara@gmail.com', telefono: '+34622222222' }) }),
        );
        expect(tx.minosUser.upsert).not.toHaveBeenCalled();
    });

    it('vector PIL-02: el email de otro usuario con otro teléfono se rechaza y no se toca', async () => {
        tx.minosUser.findUnique.mockResolvedValue({ id: 999, email: 'victima@x.com', telefono: '+34611111111' });
        prismaMock.onboarding.findUnique.mockResolvedValue(
            onboardingCon([{ nombre: 'Chico', telefono: '+34622222222', email: 'victima@x.com' }]),
        );
        const res = mockRes();
        await completar(peticion(), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('telefono_no_coincide');
        expect(tx.minosUser.upsert).not.toHaveBeenCalled();
    });

    it('si el email ya es de un conductor activo, 409 conductor_ya_asignado', async () => {
        tx.minosUser.findUnique.mockResolvedValue({ id: 999, email: 'v@x.com', telefono: '+34622222222' });
        tx.conductor.findFirst.mockResolvedValue({ id: 'otro' });
        prismaMock.onboarding.findUnique.mockResolvedValue(
            onboardingCon([{ nombre: 'Chico', telefono: '+34622222222', email: 'v@x.com' }]),
        );
        const res = mockRes();
        await completar(peticion(), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('conductor_ya_asignado');
    });

    it('control positivo: alguien del ecosistema con el mismo teléfono se engancha sin modificar su fila', async () => {
        tx.minosUser.findUnique.mockResolvedValue({ id: 999, email: 'e@x.com', telefono: '+34622222222', nombre: 'Suyo' });
        prismaMock.onboarding.findUnique.mockResolvedValue(
            onboardingCon([{ nombre: 'Otro nombre', telefono: '+34622222222', email: 'e@x.com' }]),
        );
        const res = mockRes();
        await completar(peticion(), res);
        expect(res.status).not.toHaveBeenCalled();
        expect(tx.minosUser.create).toHaveBeenCalledTimes(1); // solo el patrón
        expect(tx.conductor.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ usuario_id: 999, es_patron: false }) }),
        );
    });
});
