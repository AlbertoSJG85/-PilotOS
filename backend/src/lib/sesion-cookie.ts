/**
 * PIL-04 — La sesión de PilotOS sale de `localStorage`.
 *
 * QUÉ ESTABA MAL. El JWT se guardaba en `localStorage` **y además** el propio
 * JavaScript de la página escribía una cookie con `document.cookie`, para que
 * el middleware de Next.js pudiera leerla. Las dos cosas son legibles por
 * cualquier script que corra en el origen: `localStorage` por definición, y una
 * cookie escrita desde JavaScript no puede ser `HttpOnly`. Un XSS, una
 * dependencia comprometida o una extensión se llevaban la sesión entera.
 *
 * En este producto duele más que en otros. El token trae `es_patron` y
 * `cliente_id`: con la sesión de un patrón van la flota, los partes y la
 * economía del tenant.
 *
 * PIL-03 ya permitía cortar una sesión. Pero cortar sirve cuando alguien se
 * entera, y de un robo de `localStorage` no se entera nadie.
 *
 * QUÉ HACE ESTO. El servidor pone la cookie, con `HttpOnly`, y el navegador la
 * manda sola. El frontal no conoce el token. El middleware de Next.js la sigue
 * leyendo sin problema, porque la lee en el servidor.
 *
 * ── POR QUÉ `SameSite=Lax` Y NO `Strict` COMO EN RENTOS ────────────────────
 *
 * No es una relajación por comodidad; es que aquí `Strict` rompe el producto.
 *
 * `Strict` no manda la cookie en una navegación de nivel superior que venga de
 * otro sitio. En RentOS eso da igual: sus páginas son estáticas y la sesión se
 * usa en la primera llamada de la propia página, que ya es del mismo sitio. En
 * PilotOS **no**: el `middleware.ts` de Next decide en esa misma navegación si
 * te manda a `/login`. Con `Strict`, un conductor que abre el enlace desde
 * WhatsApp —que es como llega la gente a esta PWA— aterrizaría en el login
 * estando dentro.
 *
 * `Lax` sigue impidiendo lo que importa: no viaja en peticiones de escritura
 * cross-site. Y encima se comprueba el `Origin` en todo lo que cambia estado.
 *
 * ── POR QUÉ EL ACCESO DURA 24 h Y NO 2 h ───────────────────────────────────
 *
 * Quien usa esto es un taxista con la PWA en el móvil durante la jornada. Una
 * sesión de 2 h le echaría a mitad de turno y le haría pelearse con el
 * producto — es la misma razón por la que PIL-03 defendió una sesión larga.
 *
 * Lo que sí cambia: el token **rota**. Se renueva mientras se usa, hasta un
 * techo absoluto de 7 días que la rotación no puede saltarse. Efecto real: un
 * conductor que trabaja a diario sigue dentro; **un móvil robado que se queda
 * quieto 24 h tiene la sesión muerta**, cuando antes tenía siete días.
 */

import type { Request, Response } from 'express';

export const NOMBRE_COOKIE = 'pilotos_token';

/** Vida del token de acceso. Rota mientras se usa. */
export const VIDA_ACCESO_MS = 24 * 60 * 60 * 1000;

/** Techo absoluto. Era la vida completa del token; ahora es solo el techo. */
export const VIDA_SESION_MS = 7 * 24 * 60 * 60 * 1000;

/** Se renueva cuando se ha consumido más de la mitad de la vida del acceso. */
export const FRACCION_PARA_ROTAR = 0.5;

export interface ClaimsSesion {
    iat?: number;
    sesionDesde?: number;
    [clave: string]: unknown;
}

/**
 * `Secure` va puesto salvo que se pida expresamente lo contrario.
 *
 * No se decide por `NODE_ENV`. Esa fue exactamente la causa de CLI-01 en
 * ClinicOS: un ajuste de seguridad atado a una variable de entorno que en
 * producción puede no estar, y que falla ABIERTO cuando no lo está. Aquí el
 * valor inseguro hay que escribirlo a mano, y se ve.
 */
export function cookieInsegura(): boolean {
    return process.env.SESSION_COOKIE_INSECURE === 'true';
}

export function opcionesCookie(maxAgeMs: number) {
    return {
        httpOnly: true,
        secure: !cookieInsegura(),
        sameSite: 'lax' as const,
        path: '/',
        maxAge: maxAgeMs,
    };
}

export function leerCookie(req: Request, nombre: string = NOMBRE_COOKIE): string | null {
    const cabecera = req?.headers?.cookie;
    if (!cabecera || typeof cabecera !== 'string') return null;

    for (const trozo of cabecera.split(';')) {
        const separador = trozo.indexOf('=');
        if (separador < 0) continue;
        if (trozo.slice(0, separador).trim() !== nombre) continue;
        const valor = trozo.slice(separador + 1).trim();
        return valor.length > 0 ? valor : null;
    }
    return null;
}

/**
 * La cabecera `Authorization` está **apagada por defecto**.
 *
 * La tentación era dejarla aceptada "durante la transición". Pero mientras esa
 * puerta siga abierta este cambio no arregla nada: cualquier token que un XSS
 * se hubiera llevado de `localStorage` antes del despliegue sigue valiendo por
 * esa vía, y la cookie `HttpOnly` no protege de lo que se puede mandar por
 * otro sitio. Un puente de compatibilidad dentro de un cierre de seguridad es
 * el propio agujero con otro nombre.
 *
 * `SESSION_ACEPTA_BEARER=true` la reactiva. Hay que escribirlo a mano.
 */
export function aceptaBearer(): boolean {
    return process.env.SESSION_ACEPTA_BEARER === 'true';
}

export function tokenDeLaPeticion(req: Request): { token: string | null; origen: 'cookie' | 'cabecera' | null } {
    const deCookie = leerCookie(req);
    if (deCookie) return { token: deCookie, origen: 'cookie' };

    if (aceptaBearer()) {
        const cabecera = req?.headers?.authorization;
        if (cabecera?.startsWith('Bearer ')) {
            const deCabecera = cabecera.split(' ')[1];
            if (deCabecera) return { token: deCabecera, origen: 'cabecera' };
        }
    }

    return { token: null, origen: null };
}

export function emitirCookieSesion(res: Response, token: string): void {
    res.cookie(NOMBRE_COOKIE, token, opcionesCookie(VIDA_ACCESO_MS));
}

export function borrarCookieSesion(res: Response): void {
    res.clearCookie(NOMBRE_COOKIE, { ...opcionesCookie(0), maxAge: undefined });
}

/**
 * El instante en que empezó la sesión, arrastrado de un token al siguiente.
 * Si un token no lo trae —emitido antes de este cambio—, cuenta su propia
 * firma: nunca se le regala techo.
 */
export function inicioDeSesion(claims: ClaimsSesion | null | undefined): number | null {
    if (typeof claims?.sesionDesde === 'number') return claims.sesionDesde * 1000;
    if (typeof claims?.iat === 'number') return claims.iat * 1000;
    return null;
}

export function tocaRotar(claims: ClaimsSesion | null | undefined, ahora: number = Date.now()): boolean {
    if (typeof claims?.iat !== 'number') return false;
    return ahora - claims.iat * 1000 > VIDA_ACCESO_MS * FRACCION_PARA_ROTAR;
}

/**
 * ¿Se puede rotar todavía, o la sesión llegó a su techo absoluto?
 * Esta es la línea que impide que "se renueva mientras trabajes" se convierta
 * en "no caduca nunca".
 */
export function dentroDelTecho(claims: ClaimsSesion | null | undefined, ahora: number = Date.now()): boolean {
    const inicio = inicioDeSesion(claims);
    if (inicio === null) return false;
    return ahora - inicio < VIDA_SESION_MS;
}

/**
 * Comprobación de origen para lo que cambia estado.
 *
 * `SameSite=Lax` ya impide que la cookie viaje en una escritura cross-site,
 * pero eso lo decide el navegador. Esto lo decide el servidor.
 *
 * Solo se rechaza cuando el `Origin` viene y no está en la lista. Una llamada
 * de servidor a servidor no manda `Origin`: exigirlo rompería `/internal` y a
 * GlorIA sin ganar nada, porque una petición sin navegador no tiene cookie que
 * robar.
 */
export function origenAjeno(req: Request): boolean {
    const origen = req?.get?.('origin');
    if (!origen) return false;

    const permitidos = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean);

    // Sin lista configurada no se aplica. Es el mismo criterio que `cors()` de
    // `index.ts`, que sin `ALLOWED_ORIGINS` permite todo en desarrollo.
    if (permitidos.length === 0) return false;

    return !permitidos.includes(origen.replace(/\/$/, ''));
}
