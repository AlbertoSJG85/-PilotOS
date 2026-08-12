/**
 * Tests de humo — recuperación de contraseña (2026-08-11).
 *
 * Es un endpoint de seguridad, así que lo que más se vigila aquí no es el
 * camino feliz: es que NO se pueda usar para averiguar quién tiene cuenta,
 * que un código no valga dos veces, que caduque, y que no se pueda romper
 * a fuerza bruta.
 *
 * Contexto: hasta hoy PilotOS no tenía recuperación. Si olvidabas la
 * contraseña había que editar el hash a mano en la base de datos — pasó dos
 * veces en cuatro días (C-039 el 7 de agosto y otra vez el 11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const prismaMock = {
    minosUser: { findMany: vi.fn(), update: vi.fn() },
    conductor: { findFirst: vi.fn(), count: vi.fn() },
    cliente: { findFirst: vi.fn() },
    passwordReset: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
};
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const enviarAvisoGlorMock = vi.fn();
vi.mock('../src/services/notificacion.service', () => ({ enviarAvisoGloria: enviarAvisoGlorMock }));

// El codigo va por EMAIL desde el 2026-08-12: WhatsApp dependia de que Meta
// aprobara una plantilla, y a esa fecha no habian aprobado ninguna.
const enviarEmailMock = vi.fn();
vi.mock('../src/services/email.service', async (original) => ({
    ...(await original() as object),
    enviarEmail: enviarEmailMock,
}));

process.env.JWT_SECRET = 'secreto-de-prueba-para-los-tests';
const { default: authRoutes } = await import('../src/routes/auth.routes');
const { hashPassword } = await import('../src/lib/password');

function manejadorDe(ruta: string) {
    const capa = (authRoutes as any).stack.find((c: any) => c.route?.path === ruta && c.route?.methods?.post);
    if (!capa) throw new Error(`no existe POST ${ruta}`);
    return capa.route.stack[capa.route.stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const USUARIO = { id: 25, telefono: '+34615380646', email: 'alberto@nexostudios.digital', nombre: 'Alberto', role: 'landlord', password_hash: '$2b$10$loquesea' };
/** Alta antigua de asalariado: email sintetico, no existe, no se le puede escribir. */
const USUARIO_SIN_EMAIL_REAL = { ...USUARIO, id: 26, email: '+34600111222@pilotos.app' };

describe('POST /recuperar — no debe revelar quién tiene cuenta', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        enviarAvisoGlorMock.mockResolvedValue({ ok: true });
        enviarEmailMock.mockResolvedValue({ ok: true });
        prismaMock.passwordReset.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.passwordReset.create.mockResolvedValue({ id: 'r1' });
    });

    it('cuenta que existe → respuesta neutra y envía el código', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([USUARIO]);
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: { telefono: '+34615380646' } } as Request, res);

        expect(enviarEmailMock).toHaveBeenCalledTimes(1);
        expect(enviarEmailMock.mock.calls[0][0]).toBe('alberto@nexostudios.digital');
        expect(enviarEmailMock.mock.calls[0][1]).toMatch(/contrase/i);
        expect(res.json.mock.calls[0][0].message).toMatch(/Si el telefono corresponde/i);
    });

    it('CLAVE: cuenta que NO existe → exactamente la misma respuesta', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([]);
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: { telefono: '+34600000000' } } as Request, res);

        expect(enviarEmailMock).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].message).toMatch(/Si el telefono corresponde/i);
        expect(res.status).not.toHaveBeenCalledWith(404);
    });

    it('cuenta con el email sintético del onboarding antiguo → ni se intenta enviar, y la respuesta no cambia', async () => {
        // Los asalariados dados de alta antes del 2026-08-12 llevan
        // telefono@pilotos.app, un buzón que no existe. No se puede recuperar
        // por correo, pero por fuera tiene que verse exactamente igual.
        prismaMock.minosUser.findMany.mockResolvedValue([USUARIO_SIN_EMAIL_REAL]);
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: { telefono: '+34600111222' } } as Request, res);

        expect(enviarEmailMock).not.toHaveBeenCalled();
        expect(prismaMock.passwordReset.create).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].message).toMatch(/Si el telefono corresponde/i);
    });

    it('CLAVE: si el envío del correo falla, tampoco se nota por fuera', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([USUARIO]);
        enviarEmailMock.mockResolvedValue({ ok: false, error: 'smtp_no_configurado' });
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: { telefono: '+34615380646' } } as Request, res);

        expect(res.json.mock.calls[0][0].message).toMatch(/Si el telefono corresponde/i);
    });

    it('pedir un código nuevo invalida los anteriores', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([USUARIO]);
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: { telefono: '+34615380646' } } as Request, res);

        expect(prismaMock.passwordReset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { usuario_id: 25, usado_at: null },
        }));
    });

    it('el código NO se guarda en claro, solo su hash', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([USUARIO]);
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: { telefono: '+34615380646' } } as Request, res);

        // El código viaja dentro del cuerpo del correo, no como parámetro suelto.
        const guardado = prismaMock.passwordReset.create.mock.calls[0][0].data;
        const enviado = (enviarEmailMock.mock.calls[0][2] as string).match(/(\d{6})/)![1];
        expect(guardado.codigo_hash).not.toBe(enviado);
        expect(guardado.codigo_hash.startsWith('$2')).toBe(true);
        expect(enviado).toMatch(/^\d{6}$/);
    });

    it('sin teléfono → 400', async () => {
        const res = mockRes();
        await manejadorDe('/recuperar')({ body: {} } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('POST /restablecer — validación del código', () => {
    let hashCodigo: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        hashCodigo = await hashPassword('123456');
        prismaMock.minosUser.findMany.mockResolvedValue([USUARIO]);
        prismaMock.conductor.findFirst.mockResolvedValue(null);
        prismaMock.cliente.findFirst.mockResolvedValue({ id: 'cli-1', patron_id: 25, tipo_actividad: 'TAXI' });
        prismaMock.conductor.count.mockResolvedValue(0);
        prismaMock.$transaction.mockResolvedValue([]);
    });

    const futuro = () => new Date(Date.now() + 10 * 60 * 1000);

    it('código correcto → cambia la contraseña y devuelve sesión', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue({ id: 'r1', codigo_hash: hashCodigo, intentos: 0, expira_at: futuro() });
        const res = mockRes();

        await manejadorDe('/restablecer')(
            { body: { telefono: '+34615380646', codigo: '123456', password: 'unaBuena123' } } as Request, res,
        );

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(res.json.mock.calls[0][0].token).toBeDefined();
    });

    it('CLAVE: la contraseña y el quemado del código van en la MISMA transacción', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue({ id: 'r1', codigo_hash: hashCodigo, intentos: 0, expira_at: futuro() });
        await manejadorDe('/restablecer')(
            { body: { telefono: '+34615380646', codigo: '123456', password: 'unaBuena123' } } as Request, mockRes(),
        );
        // No puede quedar la contraseña cambiada con el código todavía vivo.
        expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(2);
    });

    it('código incorrecto → rechaza y suma un intento', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue({ id: 'r1', codigo_hash: hashCodigo, intentos: 0, expira_at: futuro() });
        const res = mockRes();

        await manejadorDe('/restablecer')(
            { body: { telefono: '+34615380646', codigo: '999999', password: 'unaBuena123' } } as Request, res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.passwordReset.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { intentos: { increment: 1 } },
        }));
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('CLAVE: a los 5 intentos el código se quema', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue({ id: 'r1', codigo_hash: hashCodigo, intentos: 5, expira_at: futuro() });
        const res = mockRes();

        await manejadorDe('/restablecer')(
            { body: { telefono: '+34615380646', codigo: '123456', password: 'unaBuena123' } } as Request, res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.passwordReset.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { usado_at: expect.any(Date) },
        }));
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('código caducado o ya usado → no lo encuentra y rechaza', async () => {
        prismaMock.passwordReset.findFirst.mockResolvedValue(null);
        const res = mockRes();

        await manejadorDe('/restablecer')(
            { body: { telefono: '+34615380646', codigo: '123456', password: 'unaBuena123' } } as Request, res,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        // La consulta exige no usado y no caducado.
        const where = prismaMock.passwordReset.findFirst.mock.calls[0][0].where;
        expect(where.usado_at).toBeNull();
        expect(where.expira_at.gt).toBeInstanceOf(Date);
    });

    it('contraseña débil → 400 antes de mirar siquiera el código', async () => {
        const res = mockRes();
        await manejadorDe('/restablecer')(
            { body: { telefono: '+34615380646', codigo: '123456', password: 'corta' } } as Request, res,
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.passwordReset.findFirst).not.toHaveBeenCalled();
    });

    it('teléfono desconocido → mismo mensaje que un código malo (no revela nada)', async () => {
        prismaMock.minosUser.findMany.mockResolvedValue([]);
        const res = mockRes();
        await manejadorDe('/restablecer')(
            { body: { telefono: '+34600000000', codigo: '123456', password: 'unaBuena123' } } as Request, res,
        );
        expect(res.json.mock.calls[0][0].error).toBe('codigo_invalido');
    });
});
