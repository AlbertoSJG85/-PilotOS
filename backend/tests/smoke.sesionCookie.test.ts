/**
 * PIL-04 — La sesión de PilotOS sale de `localStorage`.
 *
 * El JWT se guardaba en `localStorage` y además el frontal escribía una cookie
 * con `document.cookie`. Las dos son legibles por cualquier script del origen:
 * `localStorage` por definición, y una cookie escrita desde JavaScript no puede
 * ser `HttpOnly`. Un XSS, una dependencia comprometida o una extensión se
 * llevaban la sesión entera — y con la de un patrón van la flota, los partes y
 * la economía del tenant.
 *
 * PIL-03 ya permitía cortar. Pero cortar sirve cuando alguien se entera, y de
 * un robo de `localStorage` no se entera nadie.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const prismaMock = {
    minosUser: { findUnique: vi.fn(), update: vi.fn() },
    conductor: { findFirst: vi.fn() },
    cliente: { findFirst: vi.fn() },
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const {
    NOMBRE_COOKIE,
    VIDA_ACCESO_MS,
    VIDA_SESION_MS,
    opcionesCookie,
    leerCookie,
    tokenDeLaPeticion,
    inicioDeSesion,
    tocaRotar,
    dentroDelTecho,
    origenAjeno,
} = await import('../src/lib/sesion-cookie');

const { requireAuth, generarToken } = await import('../src/middleware/auth.middleware');
type AuthRequest = import('../src/middleware/auth.middleware').AuthRequest;

const USUARIO = { id: 7, telefono: '+34600111222', nombre: 'Conductor', role: 'user', email: 'c@x.test' };

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    res.clearCookie = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any; cookie: any; clearCookie: any };
}

function peticion(opciones: { cookie?: string; bearer?: string; method?: string; origin?: string }): AuthRequest {
    const headers: Record<string, string> = {};
    if (opciones.cookie) headers.cookie = `${NOMBRE_COOKIE}=${opciones.cookie}`;
    if (opciones.bearer) headers.authorization = `Bearer ${opciones.bearer}`;
    return {
        method: opciones.method ?? 'GET',
        path: '/api/algo',
        headers,
        get: (n: string) => (n.toLowerCase() === 'origin' ? opciones.origin : undefined),
    } as unknown as AuthRequest;
}

/** Un token firmado "hace N segundos", con el inicio de sesión que se le diga. */
function tokenDeHace(segundos: number, inicioHaceSegundos = segundos): string {
    const ahora = Math.floor(Date.now() / 1000);
    return jwt.sign(
        {
            id: USUARIO.id,
            telefono: USUARIO.telefono,
            role: 'user',
            iat: ahora - segundos,
            sesionDesde: ahora - inicioHaceSegundos,
        },
        process.env.JWT_SECRET!,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.conductor.findFirst.mockResolvedValue(null);
    prismaMock.cliente.findFirst.mockResolvedValue(null);
    prismaMock.minosUser.findUnique.mockResolvedValue({ ...USUARIO, sesiones_validas_desde: null });
    delete process.env.SESSION_ACEPTA_BEARER;
    delete process.env.SESSION_COOKIE_INSECURE;
});

afterEach(() => {
    delete process.env.SESSION_ACEPTA_BEARER;
    delete process.env.SESSION_COOKIE_INSECURE;
    delete process.env.ALLOWED_ORIGINS;
});

describe('PIL-04 — la cookie de sesión', () => {
    it('es HttpOnly, Secure y SameSite=Lax', () => {
        const o = opcionesCookie(VIDA_ACCESO_MS);
        expect(o.httpOnly).toBe(true);
        expect(o.secure).toBe(true);
        // `Lax` y no `Strict`: el `middleware.ts` de Next decide en la propia
        // navegación si te manda al login, y con `Strict` un conductor que abre
        // el enlace desde WhatsApp aterrizaría en el login estando dentro.
        expect(o.sameSite).toBe('lax');
    });

    it('quitar Secure exige escribirlo a mano, no depende de NODE_ENV', () => {
        const original = process.env.NODE_ENV;
        try {
            (process.env as any).NODE_ENV = 'development';
            expect(opcionesCookie(1000).secure).toBe(true);
            process.env.SESSION_COOKIE_INSECURE = 'true';
            expect(opcionesCookie(1000).secure).toBe(false);
        } finally {
            (process.env as any).NODE_ENV = original;
        }
    });

    it('se lee del encabezado sin confundirse con otra que empiece igual', () => {
        expect(leerCookie({ headers: { cookie: `otra=1; ${NOMBRE_COOKIE}=abc` } } as Request)).toBe('abc');
        expect(leerCookie({ headers: { cookie: 'pilotos_token_falsa=x' } } as Request)).toBeNull();
        expect(leerCookie({ headers: {} } as Request)).toBeNull();
        expect(leerCookie({ headers: { cookie: `${NOMBRE_COOKIE}=` } } as Request)).toBeNull();
    });
});

describe('PIL-04 — la cabecera Authorization ya no entra', () => {
    it('un token robado de localStorage NO pasa por la cabecera', async () => {
        const robado = tokenDeHace(60);
        const next = vi.fn() as NextFunction;
        const res = mockRes();

        await requireAuth(peticion({ bearer: robado }), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].error).toBe('auth_required');
    });

    it('CONTROL POSITIVO: el mismo token por cookie sí pasa', async () => {
        const next = vi.fn() as NextFunction;
        await requireAuth(peticion({ cookie: tokenDeHace(60) }), mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('reactivarla exige escribir la variable a mano', async () => {
        process.env.SESSION_ACEPTA_BEARER = 'true';
        const next = vi.fn() as NextFunction;
        await requireAuth(peticion({ bearer: tokenDeHace(60) }), mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('y aun así la cookie manda sobre la cabecera', () => {
        process.env.SESSION_ACEPTA_BEARER = 'true';
        const r = tokenDeLaPeticion(peticion({ cookie: 'deLaCookie', bearer: 'deLaCabecera' }) as unknown as Request);
        expect(r).toEqual({ token: 'deLaCookie', origen: 'cookie' });
    });
});

describe('PIL-04 — rotación con techo', () => {
    it('no rota un token recién emitido', async () => {
        const res = mockRes();
        await requireAuth(peticion({ cookie: tokenDeHace(5) }), res, vi.fn() as NextFunction);
        expect(res.cookie).not.toHaveBeenCalled();
    });

    it('rota cuando el token ha consumido más de la mitad de su vida', async () => {
        const consumido = Math.floor((VIDA_ACCESO_MS * 0.6) / 1000);
        const res = mockRes();
        await requireAuth(peticion({ cookie: tokenDeHace(consumido) }), res, vi.fn() as NextFunction);
        expect(res.cookie).toHaveBeenCalledWith(NOMBRE_COOKIE, expect.any(String), expect.objectContaining({ httpOnly: true }));
    });

    it('NO rota pasado el techo absoluto: renovarse solo no puede ser eterno', async () => {
        const consumido = Math.floor((VIDA_ACCESO_MS * 0.6) / 1000);
        const inicioViejo = Math.floor(VIDA_SESION_MS / 1000) + 60;
        const res = mockRes();
        await requireAuth(peticion({ cookie: tokenDeHace(consumido, inicioViejo) }), res, vi.fn() as NextFunction);
        expect(res.cookie).not.toHaveBeenCalled();
    });

    it('el token renovado hereda sesionDesde: la rotación no reinicia el reloj', () => {
        const inicio = Date.now() - 3 * 60 * 60 * 1000;
        const renovado = generarToken({ id: 7, telefono: '+34600111222', role: 'user' }, inicio);
        const claims = jwt.decode(renovado) as { sesionDesde: number };
        expect(claims.sesionDesde).toBe(Math.floor(inicio / 1000));
    });

    it('un token sin sesionDesde no recibe techo de regalo', () => {
        const ahora = Date.now();
        const viejo = { iat: Math.floor((ahora - VIDA_SESION_MS - 1000) / 1000) };
        expect(inicioDeSesion(viejo)).toBe(viejo.iat * 1000);
        expect(dentroDelTecho(viejo, ahora)).toBe(false);
        expect(tocaRotar({}, ahora)).toBe(false);
    });

    it('la revocación gana a la rotación: un intruso no se renueva solo', async () => {
        // Si la rotación se ejecutara antes del corte de PIL-03, alguien con un
        // token robado se renovaría a sí mismo en la misma petición en la que
        // debería ser expulsado, y el corte no surtiría efecto nunca.
        prismaMock.minosUser.findUnique.mockResolvedValue({ ...USUARIO, sesiones_validas_desde: new Date() });
        const consumido = Math.floor((VIDA_ACCESO_MS * 0.6) / 1000);
        const res = mockRes();
        const next = vi.fn() as NextFunction;

        await requireAuth(peticion({ cookie: tokenDeHace(consumido) }), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].error).toBe('sesion_revocada');
        expect(res.cookie).not.toHaveBeenCalled();
    });
});

describe('PIL-04 — origen en lo que cambia estado', () => {
    it('rechaza un Origin fuera de ALLOWED_ORIGINS y deja pasar el propio', () => {
        process.env.ALLOWED_ORIGINS = 'https://pilotos.nexostudios.digital';
        const con = (origin?: string) => ({ get: () => origin } as unknown as Request);

        expect(origenAjeno(con('https://malo.example'))).toBe(true);
        expect(origenAjeno(con('https://pilotos.nexostudios.digital'))).toBe(false);
        expect(origenAjeno(con('https://pilotos.nexostudios.digital/'))).toBe(false);
        // Sin `Origin` no se rechaza: una llamada de servidor a servidor no lo
        // manda ni tiene cookie que robar. Exigirlo rompería /internal y GlorIA.
        expect(origenAjeno(con(undefined))).toBe(false);
    });

    it('una escritura desde otro origen se corta antes de mirar la sesión', async () => {
        process.env.ALLOWED_ORIGINS = 'https://pilotos.nexostudios.digital';
        const res = mockRes();
        const next = vi.fn() as NextFunction;

        await requireAuth(
            peticion({ cookie: tokenDeHace(60), method: 'POST', origin: 'https://malo.example' }),
            res, next,
        );

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].error).toBe('origen_no_permitido');
    });

    it('una LECTURA desde otro origen no se corta por esto: CORS ya decide eso', async () => {
        process.env.ALLOWED_ORIGINS = 'https://pilotos.nexostudios.digital';
        const next = vi.fn() as NextFunction;
        await requireAuth(
            peticion({ cookie: tokenDeHace(60), method: 'GET', origin: 'https://malo.example' }),
            mockRes(), next,
        );
        expect(next).toHaveBeenCalled();
    });
});
