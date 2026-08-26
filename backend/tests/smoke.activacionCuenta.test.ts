/**
 * PIL-01 — Activación de cuenta: conocer el teléfono ya no basta (2026-08-26).
 *
 * El endpoint `/establecer-password` fijaba la PRIMERA contraseña de una cuenta
 * placeholder pidiendo solo teléfono y contraseña, y devolvía sesión. Un
 * teléfono no es un secreto: está en un albarán, en un grupo de WhatsApp, en la
 * puerta de un taxi. Quien llegase antes que el titular se quedaba la cuenta —
 * y si era la del patrón, la flota, los partes y la economía.
 *
 * Aquí se prueban las dos direcciones. Que el atacante no entre, y que el
 * titular legítimo sí: un 400 universal también "cerraría" el hallazgo y
 * dejaría a la gente sin poder activar su cuenta.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Request, Response } from 'express';
import { hashPassword } from '../src/lib/password';

const prismaMock = {
    minosUser: { findMany: vi.fn(), update: vi.fn() },
    passwordReset: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    conductor: { findFirst: vi.fn(), count: vi.fn() },
    cliente: { findFirst: vi.fn() },
    $transaction: vi.fn(),
};

const emailMock = {
    enviarEmail: vi.fn(),
    esEmailEntregable: vi.fn(),
    cuerpoCodigoRecuperacion: vi.fn(() => ({ asunto: 'a', cuerpo: 'c' })),
    cuerpoCodigoActivacion: vi.fn(() => ({ asunto: 'a', cuerpo: 'c' })),
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/email.service', () => emailMock);
vi.mock('../src/services/notificacion.service', () => ({ enviarAvisoGloria: vi.fn() }));

const { default: authRoutes } = await import('../src/routes/auth.routes');

function manejadorFinalDe(metodo: string, ruta: string) {
    const capa = (authRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo],
    );
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    const stack = capa.route.stack;
    return stack[stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
}

const solicitar = manejadorFinalDe('post', '/establecer-password/solicitar');
const establecer = manejadorFinalDe('post', '/establecer-password');

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const TELEFONO = '+34600111222';
const CODIGO = '123456';
const PASSWORD_NUEVA = 'UnaContrasenaLarga1';

/** Cuenta creada por el patrón y todavía sin activar. */
const CUENTA_PENDIENTE = {
    id: 7,
    telefono: TELEFONO,
    nombre: 'Conductor Nuevo',
    role: 'user',
    email: 'conductor@example.com',
    password_hash: 'CONDUCTOR_NUEVO',
};

let hashDelCodigo: string;

beforeAll(async () => {
    hashDelCodigo = await hashPassword(CODIGO);
});

/** Un código vivo, del propósito indicado, sin intentos gastados. */
function codigoVivo(overrides: Record<string, unknown> = {}) {
    return {
        id: 'reset-1',
        usuario_id: CUENTA_PENDIENTE.id,
        codigo_hash: hashDelCodigo,
        expira_at: new Date(Date.now() + 10 * 60 * 1000),
        usado_at: null,
        intentos: 0,
        proposito: 'BOOTSTRAP',
        created_at: new Date(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.minosUser.findMany.mockResolvedValue([CUENTA_PENDIENTE]);
    prismaMock.conductor.findFirst.mockResolvedValue(null);
    prismaMock.conductor.count.mockResolvedValue(0);
    prismaMock.cliente.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.passwordReset.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordReset.create.mockResolvedValue(codigoVivo());
    prismaMock.passwordReset.update.mockResolvedValue(codigoVivo());
    emailMock.esEmailEntregable.mockReturnValue(true);
    emailMock.enviarEmail.mockResolvedValue({ ok: true });
});

describe('PIL-01 — el teléfono ya no basta para activar una cuenta', () => {
    it('el vector original: teléfono + contraseña, sin código, NO crea sesión', async () => {
        const res = mockRes();
        await establecer({ body: { telefono: TELEFONO, password: PASSWORD_NUEVA } } as Request, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0]).not.toHaveProperty('token');
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('con un código inventado tampoco: la contraseña no se toca', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue(codigoVivo());

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: '999999', password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        // El intento fallido se contabiliza: es lo que quema el código.
        expect(prismaMock.passwordReset.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { intentos: { increment: 1 } } }),
        );
    });

    it('CONTROL POSITIVO: con el código bueno, el titular activa y recibe sesión', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue(codigoVivo());

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: CODIGO, password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0]).toHaveProperty('token');
        // Contraseña y quemado del código, en la MISMA transacción.
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('un código caducado no sirve', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue(null); // la query filtra por expira_at

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: CODIGO, password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('replay: un código ya usado no vuelve a servir', async () => {
        // `usado_at` no nulo queda fuera del filtro, igual que en la BD.
        prismaMock.passwordReset.findFirst.mockResolvedValue(null);

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: CODIGO, password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('pasados los intentos, el código se quema aunque luego acierten', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue(codigoVivo({ intentos: 5 }));

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: CODIGO, password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        expect(prismaMock.passwordReset.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { usado_at: expect.any(Date) } }),
        );
    });

    it('una cuenta que YA tiene contraseña no se puede "activar" otra vez', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([
            { ...CUENTA_PENDIENTE, password_hash: await hashPassword('la-real') },
        ]);
        prismaMock.passwordReset.findFirst.mockResolvedValue(codigoVivo());

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: CODIGO, password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
});

describe('PIL-01 — separación de propósitos', () => {
    it('un código de RECUPERACION no vale para activar', async () => {
        // La consulta de activación filtra por proposito BOOTSTRAP.
        prismaMock.passwordReset.findFirst.mockImplementation(async (args: any) =>
            args.where.proposito === 'BOOTSTRAP' ? null : codigoVivo({ proposito: 'RECUPERACION' }),
        );

        const res = mockRes();
        await establecer(
            { body: { telefono: TELEFONO, codigo: CODIGO, password: PASSWORD_NUEVA } } as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('pedir un código de activación no invalida los de recuperación', async () => {
        const res = mockRes();
        await solicitar({ body: { telefono: TELEFONO } } as Request, res);

        expect(prismaMock.passwordReset.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ proposito: 'BOOTSTRAP' }),
            }),
        );
    });
});

describe('PIL-01 — la solicitud no revela qué teléfonos existen', () => {
    it('teléfono desconocido: misma respuesta y ningún email', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([]);

        const res = mockRes();
        await solicitar({ body: { telefono: TELEFONO } } as Request, res);

        expect(res.status).not.toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].status).toBe('OK');
        expect(emailMock.enviarEmail).not.toHaveBeenCalled();
    });

    it('cuenta ya activada: misma respuesta y ningún email', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([
            { ...CUENTA_PENDIENTE, password_hash: await hashPassword('la-real') },
        ]);

        const res = mockRes();
        await solicitar({ body: { telefono: TELEFONO } } as Request, res);

        expect(res.json.mock.calls[0][0].status).toBe('OK');
        expect(emailMock.enviarEmail).not.toHaveBeenCalled();
    });

    it('cuenta pendiente y email entregable: misma respuesta, pero SÍ manda el código', async () => {
        const res = mockRes();
        await solicitar({ body: { telefono: TELEFONO } } as Request, res);

        expect(res.json.mock.calls[0][0].status).toBe('OK');
        expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
        expect(emailMock.cuerpoCodigoActivacion).toHaveBeenCalled();
        // Nunca el cuerpo de recuperación: el texto tiene que explicar que es
        // una activación y avisar de qué hacer si no la ha pedido.
        expect(emailMock.cuerpoCodigoRecuperacion).not.toHaveBeenCalled();
    });

    it('email sintético (asalariados antiguos): no se manda nada y se responde igual', async () => {
        emailMock.esEmailEntregable.mockReturnValue(false);

        const res = mockRes();
        await solicitar({ body: { telefono: TELEFONO } } as Request, res);

        expect(res.json.mock.calls[0][0].status).toBe('OK');
        expect(emailMock.enviarEmail).not.toHaveBeenCalled();
    });

    it('el código nunca viaja en la respuesta HTTP', async () => {
        const res = mockRes();
        await solicitar({ body: { telefono: TELEFONO } } as Request, res);

        const cuerpo = JSON.stringify(res.json.mock.calls[0][0]);
        expect(cuerpo).not.toMatch(/\d{6}/);
    });
});
