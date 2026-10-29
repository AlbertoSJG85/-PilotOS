/**
 * PIL-02 — Dar de alta un asalariado no puede secuestrar la cuenta de otro.
 *
 * `minos."Users"` es la tabla de identidad COMPARTIDA de todo el ecosistema:
 * la misma fila sirve a RentOS, IngresOS y PilotOS. El alta de asalariado hacía
 * `upsert` por email, así que un patrón que escribiera el email de un usuario ya
 * existente le **sobrescribía el teléfono** con el suyo y lo enganchaba como
 * conductor de su flota.
 *
 * La víctima entra por teléfono. Al cambiárselo, pierde el acceso a su cuenta
 * sin haber hecho nada y sin enterarse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth.middleware';

const tx = {
    minosUser: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    conductor: { findFirst: vi.fn(), create: vi.fn() },
    configuracionEconomica: { create: vi.fn() },
    vehiculoConductor: { create: vi.fn() },
    ledgerEvento: { create: vi.fn() },
};

const prismaMock = {
    conductor: { findMany: vi.fn(), findUnique: vi.fn() },
    vehiculo: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/billing-sync.service', () => ({
    sincronizarCantidadAsalariados: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/middleware/billing-access.middleware', () => ({
    clienteTieneFeaturePro: vi.fn().mockResolvedValue(true),
}));

const bienvenidaMock = { enviarBienvenidaAsalariado: vi.fn().mockResolvedValue(true) };
vi.mock('../src/services/bienvenida.service', () => bienvenidaMock);

const { default: usuarioRoutes } = await import('../src/routes/usuario.routes');

function manejadorFinalDe(metodo: string, ruta: string) {
    const capa = (usuarioRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo],
    );
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    const stack = capa.route.stack;
    return stack[stack.length - 1].handle as (req: AuthRequest, res: Response) => Promise<void>;
}

const crear = manejadorFinalDe('post', '/');

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const PATRON = { id: 42, telefono: '+34600000000', nombre: 'Patrón', role: 'user', es_patron: true, cliente_id: 'cli-1' };

function peticion(body: Record<string, unknown>): AuthRequest {
    return { body, usuario: PATRON } as unknown as AuthRequest;
}

/** Un usuario de otro producto del ecosistema, con su propio teléfono. */
const VICTIMA = {
    id: 999,
    email: 'gestor@otraempresa.com',
    telefono: '+34611111111',
    nombre: 'Gestora de RentOS',
};

beforeEach(() => {
    vi.clearAllMocks();
    tx.minosUser.findUnique.mockResolvedValue(null);
    tx.minosUser.findFirst.mockResolvedValue(null);
    prismaMock.vehiculo.findMany.mockResolvedValue([]);
    prismaMock.vehiculo.findUnique.mockResolvedValue(null);
    tx.conductor.findFirst.mockResolvedValue(null);
    tx.minosUser.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));
    tx.conductor.create.mockResolvedValue({ id: 'cond-1', cliente_id: 'cli-1' });
    tx.configuracionEconomica.create.mockResolvedValue({});
    tx.ledgerEvento.create.mockResolvedValue({});
});

describe('PIL-02 — alta de asalariado', () => {
    it('el vector original: usar el email de otro NO le cambia el teléfono', async () => {
        tx.minosUser.findUnique.mockResolvedValue(VICTIMA);

        const res = mockRes();
        await crear(peticion({ nombre: 'Mío', telefono: '+34622222222', email: VICTIMA.email }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(tx.minosUser.upsert).not.toHaveBeenCalled();
        expect(tx.minosUser.create).not.toHaveBeenCalled();
        expect(tx.conductor.create).not.toHaveBeenCalled();
    });

    it('ya no queda ningún upsert por email en el alta', async () => {
        const res = mockRes();
        await crear(peticion({ nombre: 'Nuevo', telefono: '+34633333333', email: 'nuevo@ejemplo.com' }), res);

        expect(tx.minosUser.upsert).not.toHaveBeenCalled();
    });

    it('CONTROL POSITIVO: un asalariado nuevo se da de alta sin problema', async () => {
        const res = mockRes();
        await crear(peticion({ nombre: 'Nuevo', telefono: '+34633333333', email: 'nuevo@ejemplo.com' }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(tx.minosUser.create).toHaveBeenCalledTimes(1);
        expect(tx.conductor.create).toHaveBeenCalledTimes(1);
        // y se le da la bienvenida, con el nombre de su responsable
        expect(bienvenidaMock.enviarBienvenidaAsalariado).toHaveBeenCalledTimes(1);
        expect(bienvenidaMock.enviarBienvenidaAsalariado.mock.calls[0][1]).toBe('Patrón');
    });

    it('si el alta se rechaza no se manda bienvenida', async () => {
        tx.minosUser.findUnique.mockResolvedValue(VICTIMA);
        await crear(peticion({ nombre: 'X', telefono: '+34600000999', email: VICTIMA.email }), mockRes());
        expect(bienvenidaMock.enviarBienvenidaAsalariado).not.toHaveBeenCalled();
    });

    it('sin email NO se da de alta: no podría activar su cuenta nunca', async () => {
        const res = mockRes();
        await crear(peticion({ nombre: 'Nuevo', telefono: '+34633333333' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error).toBe('email_invalido');
        expect(tx.minosUser.create).not.toHaveBeenCalled();
    });

    it('el email se normaliza: mayúsculas y espacios no crean cuentas gemelas', async () => {
        const res = mockRes();
        await crear(peticion({ nombre: 'Nuevo', telefono: '+34644444444', email: '  Nuevo@Ejemplo.COM ' }), res);

        expect(tx.minosUser.findUnique).toHaveBeenCalledWith({ where: { email: 'nuevo@ejemplo.com' } });
    });

    it('quien ya conduce para OTRA empresa no se puede fichar sin más', async () => {
        tx.minosUser.findUnique.mockResolvedValue({ ...VICTIMA, telefono: '+34622222222' });
        tx.conductor.findFirst.mockResolvedValue({ id: 'cond-x', cliente_id: 'cli-AJENO' });

        const res = mockRes();
        await crear(peticion({ nombre: 'X', telefono: '+34622222222', email: VICTIMA.email }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('conductor_de_otro_cliente');
        expect(tx.conductor.create).not.toHaveBeenCalled();
    });

    it('dar de alta dos veces a la misma persona no la duplica', async () => {
        tx.minosUser.findUnique.mockResolvedValue({ ...VICTIMA, telefono: '+34622222222' });
        tx.conductor.findFirst.mockResolvedValue({ id: 'cond-y', cliente_id: 'cli-1' });

        const res = mockRes();
        await crear(peticion({ nombre: 'X', telefono: '+34622222222', email: VICTIMA.email }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('ya_es_conductor');
        expect(tx.conductor.create).not.toHaveBeenCalled();
    });

    it('CONTROL POSITIVO: alguien del ecosistema que aún no conduce sí se engancha, sin tocar sus datos', async () => {
        tx.minosUser.findUnique.mockResolvedValue({ ...VICTIMA, telefono: '+34622222222' });
        tx.conductor.findFirst.mockResolvedValue(null);

        const res = mockRes();
        await crear(peticion({ nombre: 'Nombre que pone el patrón', telefono: '+34622222222', email: VICTIMA.email }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(tx.minosUser.create).not.toHaveBeenCalled();
        // Lo importante: su fila de identidad no se toca de ninguna forma.
        expect(tx.minosUser.upsert).not.toHaveBeenCalled();
        expect(tx.conductor.create).toHaveBeenCalledTimes(1);
        expect(tx.conductor.create.mock.calls[0][0].data.usuario_id).toBe(VICTIMA.id);
    });

    it('el conflicto se explica, no se devuelve un 500 mudo', async () => {
        tx.minosUser.findUnique.mockResolvedValue(VICTIMA);

        const res = mockRes();
        await crear(peticion({ nombre: 'X', telefono: '+34622222222', email: VICTIMA.email }), res);

        const cuerpo = res.json.mock.calls[0][0];
        expect(cuerpo.error).toBe('telefono_no_coincide');
        expect(cuerpo.message).toMatch(/comprueba los datos/i);
    });
});

describe('alta de asalariado desde Flota — tan completa como el onboarding', () => {
    const base = { nombre: 'Nuevo', telefono: '+34633333333', email: 'nuevo@ejemplo.com' };

    it('el nombre es obligatorio', async () => {
        const res = mockRes();
        await crear(peticion({ ...base, nombre: '  ' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error).toBe('missing_nombre');
    });

    it('un email mal escrito se rechaza', async () => {
        const res = mockRes();
        await crear(peticion({ ...base, email: 'sin-arroba' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error).toBe('email_invalido');
    });

    it('si el cliente solo tiene un vehículo, se le asigna solo', async () => {
        prismaMock.vehiculo.findMany.mockResolvedValue([{ id: 'veh-1' }]);
        tx.vehiculoConductor.create.mockResolvedValue({});
        const res = mockRes();
        await crear(peticion(base), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(tx.vehiculoConductor.create.mock.calls[0][0].data).toMatchObject({ vehiculo_id: 'veh-1', activo: true });
    });

    it('con varios vehículos y sin elegir, no se adivina', async () => {
        prismaMock.vehiculo.findMany.mockResolvedValue([{ id: 'veh-1' }, { id: 'veh-2' }]);
        const res = mockRes();
        await crear(peticion(base), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(tx.vehiculoConductor.create).not.toHaveBeenCalled();
    });

    it('un vehículo de OTRO cliente no se puede usar', async () => {
        prismaMock.vehiculo.findUnique.mockResolvedValue({ cliente_id: 'cli-AJENO' });
        const res = mockRes();
        await crear(peticion({ ...base, vehiculo_id: 'veh-ajeno' }), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(tx.conductor.create).not.toHaveBeenCalled();
        expect(tx.vehiculoConductor.create).not.toHaveBeenCalled();
    });

    it('un teléfono que ya usa otra cuenta no se duplica (el login es por teléfono)', async () => {
        tx.minosUser.findFirst.mockResolvedValue({ id: 77 });
        const res = mockRes();
        await crear(peticion(base), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('telefono_en_uso');
        expect(tx.minosUser.create).not.toHaveBeenCalled();
    });

    it('fijo diario: guarda los euros y no inventa un porcentaje del patrón', async () => {
        const res = mockRes();
        await crear(peticion({ ...base, modelo_reparto: 'FIJO_DIARIO', porcentaje_conductor: 60 }), res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(tx.configuracionEconomica.create.mock.calls[0][0].data).toMatchObject({
            modelo_reparto: 'FIJO_DIARIO', porcentaje_conductor: 60, porcentaje_patron: 0,
        });
    });

    it('porcentaje: el patrón se queda con el resto', async () => {
        const res = mockRes();
        await crear(peticion({ ...base, porcentaje_conductor: 40 }), res);

        expect(tx.configuracionEconomica.create.mock.calls[0][0].data).toMatchObject({
            modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 40, porcentaje_patron: 60,
        });
    });

    it('reparto imposible (más de 100 %, o un texto) se rechaza antes de tocar nada', async () => {
        for (const valor of [150, 'mucho', -5]) {
            const res = mockRes();
            await crear(peticion({ ...base, porcentaje_conductor: valor }), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].error).toBe('reparto_invalido');
        }
        expect(tx.minosUser.create).not.toHaveBeenCalled();
    });
});
