/**
 * PIL-03 — Poder cortar una sesión de verdad.
 *
 * El JWT duraba 30 días y no había forma de invalidarlo. Los tres casos que
 * duelen:
 *
 *   · Móvil robado — el ladrón tiene un mes de acceso.
 *   · Conductor despedido — se le marca inactivo y sigue entrando con la app
 *     que ya tenía abierta.
 *   · Contraseña cambiada porque sospechas que alguien entró — el intruso sigue
 *     dentro, porque su token no dependía de la contraseña.
 *
 * El corte es `sesiones_validas_desde`: todo JWT firmado antes de ese instante
 * deja de valer. Se compara contra el `iat` que ya lleva cada token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const prismaMock = {
    minosUser: { findUnique: vi.fn(), update: vi.fn() },
    conductor: { findFirst: vi.fn() },
    cliente: { findFirst: vi.fn() },
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const { requireAuth, generarToken, revocarSesiones } = await import('../src/middleware/auth.middleware');
type AuthRequest = import('../src/middleware/auth.middleware').AuthRequest;

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const USUARIO = { id: 7, telefono: '+34600111222', nombre: 'Conductor', role: 'user', email: 'c@x.test' };

function peticionCon(token: string): AuthRequest {
    return { headers: { authorization: `Bearer ${token}` } } as unknown as AuthRequest;
}

/** Un token firmado "hace N segundos". */
function tokenDeHace(segundos: number): string {
    const iat = Math.floor(Date.now() / 1000) - segundos;
    return jwt.sign({ id: USUARIO.id, telefono: USUARIO.telefono, role: 'user', iat }, process.env.JWT_SECRET!);
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.conductor.findFirst.mockResolvedValue(null);
    prismaMock.cliente.findFirst.mockResolvedValue(null);
    prismaMock.minosUser.update.mockResolvedValue(USUARIO);
});

describe('PIL-03 — corte de sesiones', () => {
    it('sin revocación, un token válido pasa (control positivo)', async () => {
        prismaMock.minosUser.findUnique.mockResolvedValue({ ...USUARIO, sesiones_validas_desde: null });
        const next = vi.fn() as NextFunction;
        const req = peticionCon(tokenDeHace(60));

        await requireAuth(req, mockRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.usuario?.id).toBe(USUARIO.id);
    });

    // EL CASO DEL DESPIDO Y DEL MÓVIL ROBADO.
    it('un token anterior al corte deja de valer aunque no haya caducado', async () => {
        prismaMock.minosUser.findUnique.mockResolvedValue({
            ...USUARIO,
            sesiones_validas_desde: new Date(),   // corte ahora
        });
        const next = vi.fn() as NextFunction;
        const res = mockRes();

        await requireAuth(peticionCon(tokenDeHace(3600)), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].error).toBe('sesion_revocada');
    });

    it('un token emitido DESPUÉS del corte sí vale: revocar no bloquea para siempre', async () => {
        prismaMock.minosUser.findUnique.mockResolvedValue({
            ...USUARIO,
            sesiones_validas_desde: new Date(Date.now() - 3600 * 1000),   // corte hace una hora
        });
        const next = vi.fn() as NextFunction;

        await requireAuth(peticionCon(tokenDeHace(10)), mockRes(), next);

        expect(next).toHaveBeenCalled();
    });

    // `iat` va en segundos y el corte en milisegundos. Sin margen, un token
    // emitido en el mismo segundo del corte se invalidaría a sí mismo al nacer.
    it('un token emitido en el mismo segundo del corte no se mata solo', async () => {
        const ahora = new Date();
        prismaMock.minosUser.findUnique.mockResolvedValue({ ...USUARIO, sesiones_validas_desde: ahora });
        const next = vi.fn() as NextFunction;

        await requireAuth(peticionCon(tokenDeHace(0)), mockRes(), next);

        expect(next).toHaveBeenCalled();
    });

    it('la sesión nueva que se entrega tras revocar funciona de inmediato', async () => {
        const corte = new Date();
        prismaMock.minosUser.findUnique.mockResolvedValue({ ...USUARIO, sesiones_validas_desde: corte });

        // generarToken firma con el `iat` de ahora, posterior al corte.
        const nuevo = generarToken({ id: USUARIO.id, telefono: USUARIO.telefono, role: 'user' });
        const next = vi.fn() as NextFunction;

        await requireAuth(peticionCon(nuevo), mockRes(), next);

        expect(next).toHaveBeenCalled();
    });
});

describe('PIL-03 — revocarSesiones', () => {
    it('mueve el corte a ahora', async () => {
        const antes = Date.now();
        await revocarSesiones(USUARIO.id);

        expect(prismaMock.minosUser.update).toHaveBeenCalledTimes(1);
        const llamada = prismaMock.minosUser.update.mock.calls[0][0];
        expect(llamada.where).toEqual({ id: USUARIO.id });
        expect(llamada.data.sesiones_validas_desde.getTime()).toBeGreaterThanOrEqual(antes);
    });

    it('no borra ninguna lista de tokens: no hay lista que borrar', async () => {
        await revocarSesiones(USUARIO.id);
        const llamada = prismaMock.minosUser.update.mock.calls[0][0];
        expect(Object.keys(llamada.data)).toEqual(['sesiones_validas_desde']);
    });
});

describe('PIL-03 — la duración deja de ser un mes', () => {
    it('el token no dura más de 7 días', () => {
        const token = generarToken({ id: 1, telefono: '+34600000000', role: 'user' });
        const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
        const dias = (exp - iat) / 86400;

        expect(dias).toBeLessThanOrEqual(7);
        expect(dias).toBeGreaterThan(0);
    });
});
