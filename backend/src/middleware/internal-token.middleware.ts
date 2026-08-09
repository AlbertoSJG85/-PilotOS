/**
 * Middleware para proteger endpoints /internal/ con x-internal-token.
 * Misma convencion que RentOS para comunicacion entre productos.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Compara dos strings en tiempo constante. Fase 7 (2026-07-24): antes se
 * usaba `token !== expectedToken`, vulnerable a timing attack (la comparacion
 * de strings de V8 corta en el primer caracter distinto, por lo que el
 * tiempo de respuesta varia segun cuantos caracteres iniciales acierta un
 * atacante). Si las longitudes difieren, se devuelve false sin comparar
 * contenido (la longitud del token no es el secreto que se protege aqui).
 */
function tokensCoinciden(recibido: string, esperado: string): boolean {
    const bufRecibido = Buffer.from(recibido);
    const bufEsperado = Buffer.from(esperado);
    if (bufRecibido.length !== bufEsperado.length) return false;
    return crypto.timingSafeEqual(bufRecibido, bufEsperado);
}

/**
 * Rutas que puede tocar un portador del token acotado de Hermes. Lo que no este
 * aqui le esta vedado aunque el token sea valido.
 */
const RUTAS_HERMES = new Set(['/resumen', '/registrar-gasto', '/mantenimientos', '/kb/producto']);

/**
 * Y estas son las de LucIA. **Solo lectura: no incluye registrar-gasto.**
 *
 * LucIA solo tiene que poder contestarle a Alberto cuando pregunta por su taxi.
 * Escribir es de Hermes, con su cola y su autorizacion. Que LucIA no pueda
 * escribir no es una limitacion: es la separacion entre preguntar y mandar.
 */
const RUTAS_LUCIA = new Set(['/resumen', '/mantenimientos', '/kb/producto']);

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** Alcance del token con el que se entro. */
            internalScope?: 'total' | 'hermes' | 'lucia';
        }
    }
}

/**
 * Protege /internal/ con x-internal-token.
 *
 * ── Dos tokens, dos alcances (2026-08-09) ──────────────────────────────────
 *
 * `INTERNAL_API_TOKEN` es el de siempre: alcance total, lo usa GlorIA.
 *
 * `HERMES_INTERNAL_TOKEN` es nuevo y esta ACOTADO. Hermes vive en otro servidor
 * y solo tiene que hacer dos cosas con el PilotOS personal de Alberto: leer su
 * resumen y registrarle un gasto. Darle el token total le habria dado acceso a
 * los datos internos de TODOS los clientes de PilotOS, que es un producto
 * comercial multi-cliente.
 *
 * Es la regla inamovible de minimo privilegio del proyecto Hermes: el limite no
 * puede depender de que Hermes se porte bien. Con este token:
 *   - solo valen las rutas de RUTAS_HERMES;
 *   - y `registrar-gasto` ignora el cliente_id que venga en el cuerpo y usa el
 *     de HERMES_CLIENTE_ID (ver internal.routes.ts).
 *
 * Si `HERMES_INTERNAL_TOKEN` no esta configurado, no existe ese camino y todo
 * sigue exactamente como antes.
 */
export function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
    const tokenHeader = req.headers['x-internal-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    const expectedToken = process.env.INTERNAL_API_TOKEN;
    const hermesToken = process.env.HERMES_INTERNAL_TOKEN;
    const luciaToken = process.env.LUCIA_INTERNAL_TOKEN;

    if (!expectedToken) {
        console.error('[INTERNAL] INTERNAL_API_TOKEN no configurado en variables de entorno');
        res.status(500).json({
            status: 'FAIL',
            error: 'server_config_error',
            message: 'Servicio no configurado correctamente',
        });
        return;
    }

    if (token && tokensCoinciden(token, expectedToken)) {
        req.internalScope = 'total';
        next();
        return;
    }

    // Los tokens acotados solo abren su puerta, y solo si estan configurados.
    const acotados: Array<[string | undefined, Set<string>, 'hermes' | 'lucia']> = [
        [hermesToken, RUTAS_HERMES, 'hermes'],
        [luciaToken, RUTAS_LUCIA, 'lucia'],
    ];
    for (const [esperado, rutas, alcance] of acotados) {
        if (!token || !esperado || !tokensCoinciden(token, esperado)) continue;
        // La ruta se calcula AQUI, solo cuando un token acotado ha coincidido.
        // Calcularla antes hacia que un 401 normal reventara si `req.path` no
        // venia (lo cazaron los tests de humo del token, que montan un `req` a
        // mano). `req.path` dentro del router monta sin el prefijo /internal.
        const ruta = String(req.path || '').replace(/\/$/, '') || '/';
        if (!rutas.has(ruta)) {
            console.warn(`[INTERNAL] token de ${alcance} usado en una ruta que no le toca:`, ruta);
            res.status(403).json({
                status: 'FAIL',
                error: 'forbidden',
                message: 'Ese token no alcanza a esta ruta',
            });
            return;
        }
        req.internalScope = alcance;
        next();
        return;
    }

    res.status(401).json({
        status: 'FAIL',
        error: 'unauthorized',
        message: 'Token interno no valido',
    });
}
