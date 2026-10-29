/**
 * Editar, quitar y listar conductores desde Flota (2026-10-29).
 *
 * Reglas que fija este fichero:
 *   · Nombre y teléfono son de la persona: solo se corrigen mientras su cuenta
 *     no está activada, y nunca a un número que ya usa otra cuenta (PIL-02).
 *   · El reparto se VERSIONA: se cierra la fila vigente y se abre otra, para que
 *     los partes ya calculados conserven su reparto.
 *   · La cuota de Seguridad Social se guarda (se validaba pero no se guardaba).
 *   · El listado no enseña a un compañero el email ni el reparto de otro, y
 *     nunca devuelve el hash de la contraseña.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth.middleware';
import { PLACEHOLDER_PASSWORD_HASHES } from '../src/lib/password';

const tx = {
    configuracionEconomica: { update: vi.fn(), create: vi.fn() },
};

const prismaMock = {
    conductor: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    minosUser: { findFirst: vi.fn(), update: vi.fn() },
    configuracionEconomica: { findFirst: vi.fn() },
    ledgerEvento: { upsert: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/billing-sync.service', () => ({
    sincronizarCantidadAsalariados: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/middleware/billing-access.middleware', () => ({
    clienteTieneFeaturePro: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/services/bienvenida.service', () => ({
    enviarBienvenidaAsalariado: vi.fn().mockResolvedValue(true),
}));

const { default: usuarioRoutes } = await import('../src/routes/usuario.routes');

function manejadorFinalDe(metodo: string, ruta: string) {
    const capa = (usuarioRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo],
    );
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    const stack = capa.route.stack;
    return stack[stack.length - 1].handle as (req: AuthRequest, res: Response) => Promise<void>;
}

const editar = manejadorFinalDe('patch', '/:id');
const listar = manejadorFinalDe('get', '/');

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const PATRON = { id: 42, nombre: 'Patrón', role: 'user', es_patron: true, cliente_id: 'cli-1' };
const COMPANERO = { id: 43, nombre: 'Compañero', role: 'user', es_patron: false, cliente_id: 'cli-1' };

const SIN_ACTIVAR = PLACEHOLDER_PASSWORD_HASHES[0];
const ACTIVADA = '$2b$10$hashquenoesunplaceholder';

function conductorExistente(over: Record<string, unknown> = {}) {
    return {
        cliente_id: 'cli-1', activo: true, es_patron: false, usuario_id: 7,
        usuario: { nombre: 'Pepe', telefono: '+34600000007', password_hash: SIN_ACTIVAR },
        ...over,
    };
}

function peticion(body: Record<string, unknown>): AuthRequest {
    return { params: { id: 'cond-7' }, body, usuario: PATRON } as unknown as AuthRequest;
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.conductor.findUnique.mockResolvedValue(conductorExistente());
    prismaMock.conductor.update.mockImplementation(async ({ data }: any) => ({
        id: 'cond-7', usuario_id: 7, cliente_id: 'cli-1', activo: true, updated_at: new Date(), ...data,
    }));
    prismaMock.minosUser.findFirst.mockResolvedValue(null);
    prismaMock.minosUser.update.mockResolvedValue({});
    prismaMock.configuracionEconomica.findFirst.mockResolvedValue({
        id: 'cfg-1', modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50, cuota_pilotos: 0,
        incluye_combustible_en_reparto: true, notas: null,
    });
    tx.configuracionEconomica.update.mockResolvedValue({});
    tx.configuracionEconomica.create.mockResolvedValue({});
});

describe('nombre y teléfono — son de la persona', () => {
    it('antes de que active la cuenta, el patrón puede corregir un error de tecleo', async () => {
        const res = mockRes();
        await editar(peticion({ nombre: 'Pepe García', telefono: '+34600000099' }), res);

        expect(res.json.mock.calls[0][0].status).toBe('OK');
        expect(prismaMock.minosUser.update).toHaveBeenCalledWith({
            where: { id: 7 }, data: { nombre: 'Pepe García', telefono: '+34600000099' },
        });
    });

    it('CLAVE: con la cuenta ya activada NO se le cambia el teléfono', async () => {
        prismaMock.conductor.findUnique.mockResolvedValue(
            conductorExistente({ usuario: { nombre: 'Pepe', telefono: '+34600000007', password_hash: ACTIVADA } }),
        );
        const res = mockRes();
        await editar(peticion({ telefono: '+34699999999' }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('cuenta_activada');
        expect(prismaMock.minosUser.update).not.toHaveBeenCalled();
    });

    it('reenviar los mismos datos (el formulario de edición lo hace) no cuenta como cambio', async () => {
        prismaMock.conductor.findUnique.mockResolvedValue(
            conductorExistente({ usuario: { nombre: 'Pepe', telefono: '+34600000007', password_hash: ACTIVADA } }),
        );
        const res = mockRes();
        await editar(peticion({ nombre: 'Pepe', telefono: '+34600000007', modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 55 }), res);

        expect(res.json.mock.calls[0][0].status).toBe('OK');
        expect(prismaMock.minosUser.update).not.toHaveBeenCalled();
    });

    it('un teléfono que ya usa otra cuenta se rechaza', async () => {
        prismaMock.minosUser.findFirst.mockResolvedValue({ id: 500 });
        const res = mockRes();
        await editar(peticion({ telefono: '+34611111111' }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].error).toBe('telefono_en_uso');
        expect(prismaMock.minosUser.update).not.toHaveBeenCalled();
    });
});

describe('condición económica — se versiona', () => {
    it('cambiar el reparto cierra la fila vigente y abre otra', async () => {
        const res = mockRes();
        await editar(peticion({ modelo_reparto: 'FIJO_DIARIO', porcentaje_conductor: 70 }), res);

        expect(tx.configuracionEconomica.update).toHaveBeenCalledWith({
            where: { id: 'cfg-1' }, data: { fecha_fin: expect.any(Date) },
        });
        expect(tx.configuracionEconomica.create.mock.calls[0][0].data).toMatchObject({
            conductor_id: 'cond-7', modelo_reparto: 'FIJO_DIARIO', porcentaje_conductor: 70, porcentaje_patron: 0,
        });
    });

    it('si no cambia nada, no se toca el histórico', async () => {
        const res = mockRes();
        await editar(peticion({ modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50 }), res);

        expect(tx.configuracionEconomica.update).not.toHaveBeenCalled();
        expect(tx.configuracionEconomica.create).not.toHaveBeenCalled();
    });

    it('un reparto imposible se rechaza sin tocar nada', async () => {
        const res = mockRes();
        await editar(peticion({ porcentaje_conductor: 250 }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error).toBe('reparto_invalido');
        expect(prismaMock.conductor.update).not.toHaveBeenCalled();
    });

    it('el propietario no tiene reparto de asalariado que editar', async () => {
        prismaMock.conductor.findUnique.mockResolvedValue(conductorExistente({ es_patron: true }));
        const res = mockRes();
        await editar(peticion({ porcentaje_conductor: 30 }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].error).toBe('reparto_solo_asalariados');
    });
});

describe('cuota de la Seguridad Social', () => {
    it('ahora SÍ se guarda', async () => {
        const res = mockRes();
        await editar(peticion({ cuota_ss_mensual: 320.5 }), res);

        expect(prismaMock.conductor.update.mock.calls[0][0].data).toMatchObject({ cuota_ss_mensual: 320.5 });
    });

    it('vacía quita la cuota', async () => {
        const res = mockRes();
        await editar(peticion({ cuota_ss_mensual: '' }), res);

        expect(prismaMock.conductor.update.mock.calls[0][0].data).toMatchObject({ cuota_ss_mensual: null });
    });
});

describe('listado de conductores', () => {
    function fila(over: Record<string, unknown> = {}) {
        return {
            id: 'cond-7', activo: true, es_patron: false, cliente_id: 'cli-1',
            usuario: { id: 7, nombre: 'Pepe', telefono: '+34600000007', role: 'user', email: 'pepe@ejemplo.com', password_hash: SIN_ACTIVAR },
            vehiculosAsignados: [],
            configuraciones: [{ id: 'cfg-1', modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50 }],
            ...over,
        };
    }

    it('el patrón ve email y reparto, y si la cuenta está pendiente de activar; nunca el hash', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([fila()]);
        const res = mockRes();
        await listar({ query: {}, usuario: PATRON } as unknown as AuthRequest, res);

        const c = res.json.mock.calls[0][0].data[0];
        expect(c.usuario.email).toBe('pepe@ejemplo.com');
        expect(c.configuracion).toMatchObject({ modelo_reparto: 'PORCENTAJE' });
        expect(c.cuenta_activada).toBe(false);
        expect(JSON.stringify(c)).not.toContain('password_hash');
    });

    it('un compañero no ve el email ni el reparto de otro', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([fila()]);
        const res = mockRes();
        await listar({ query: {}, usuario: COMPANERO } as unknown as AuthRequest, res);

        const c = res.json.mock.calls[0][0].data[0];
        expect(c.usuario.email).toBeUndefined();
        expect(c.configuracion).toBeUndefined();
        expect(JSON.stringify(c)).not.toContain('password_hash');
    });

    it('por defecto solo los activos; con incluir_inactivos salen también los quitados', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([]);
        await listar({ query: {}, usuario: PATRON } as unknown as AuthRequest, mockRes());
        expect(prismaMock.conductor.findMany.mock.calls[0][0].where).toMatchObject({ activo: true });

        await listar({ query: { incluir_inactivos: '1' }, usuario: PATRON } as unknown as AuthRequest, mockRes());
        expect(prismaMock.conductor.findMany.mock.calls[1][0].where).not.toHaveProperty('activo');
    });
});
