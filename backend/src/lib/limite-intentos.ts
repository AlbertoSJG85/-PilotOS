/**
 * Límite de intentos en login, activación y recuperación (2026-11-25).
 *
 * QUÉ PASABA (medido en producción). El frontal no llama al backend por dentro:
 * el proxy de Next sale a `api.pilotos…` y vuelve a entrar por Traefik. Traefik
 * descarta el `X-Forwarded-For` que trae esa petición (no confía en él) y pone
 * la IP de salida del servidor. Resultado: TODAS las peticiones que llegan por
 * la app tienen la misma IP, y el límite «10 intentos por IP» era en realidad
 * «10 intentos para todos los taxistas juntos». Con unos pocos logins a la vez,
 * o alguien probando a propósito, se bloqueaba la entrada de todo el mundo.
 *
 * QUÉ HACE ESTO. El contador es por IP **y cuenta** (teléfono, usuario o
 * enlace). Nadie puede probar más de N contraseñas contra la misma cuenta, y un
 * taxista ya no bloquea a los demás. Funciona igual se llegue por la app o
 * directamente a la API, sin depender de cómo esté montado el proxy.
 */
import type { Request } from 'express';
import crypto from 'crypto';
import { ipKeyGenerator } from 'express-rate-limit';

/** Últimos 9 dígitos: 34600…, +34600… y 600… son la misma cuenta. */
function normalizarTelefono(valor: string): string {
    const digitos = valor.replace(/\D/g, '');
    return digitos.slice(-9);
}

/** Lo que identifica la cuenta en la petición, o '' si no viene nada. */
export function cuentaDeLaPeticion(req: Request): string {
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    if (typeof cuerpo.telefono === 'string' && cuerpo.telefono.trim()) {
        return 'tel:' + normalizarTelefono(cuerpo.telefono);
    }
    if (typeof cuerpo.usuario === 'string' && cuerpo.usuario.trim()) {
        return 'usr:' + cuerpo.usuario.trim().toLowerCase().slice(0, 120);
    }
    const token = typeof cuerpo.token === 'string' ? cuerpo.token : typeof req.query?.token === 'string' ? req.query.token : '';
    if (token) {
        // No guardar el enlace en claro en la memoria del limitador.
        return 'tok:' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
    }
    return '';
}

/** Clave del contador: IP (agrupada en IPv6) + cuenta. */
export function claveDeIntento(req: Request): string {
    return `${ipKeyGenerator(req.ip ?? '')}|${cuentaDeLaPeticion(req)}`;
}

/**
 * Proxies de confianza: solo los de la red interna (Traefik y el proxy de Next
 * van por redes privadas de Docker). Antes era `true`, «confiar en cualquiera»:
 * hoy no se explotaba porque Traefik descarta la cabecera falsa, pero la
 * seguridad dependía de esa configuración. Así sigue funcionando
 * `req.protocol` (https) y el aviso ERR_ERL_PERMISSIVE_TRUST_PROXY desaparece.
 */
export const PROXIES_DE_CONFIANZA = 'loopback, linklocal, uniquelocal';
