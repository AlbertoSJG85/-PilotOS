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

export function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
    const tokenHeader = req.headers['x-internal-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    const expectedToken = process.env.INTERNAL_API_TOKEN;

    if (!expectedToken) {
        console.error('[INTERNAL] INTERNAL_API_TOKEN no configurado en variables de entorno');
        res.status(500).json({
            status: 'FAIL',
            error: 'server_config_error',
            message: 'Servicio no configurado correctamente',
        });
        return;
    }

    if (!token || !tokensCoinciden(token, expectedToken)) {
        res.status(401).json({
            status: 'FAIL',
            error: 'unauthorized',
            message: 'Token interno no valido',
        });
        return;
    }

    next();
}
