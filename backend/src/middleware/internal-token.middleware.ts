/**
 * Middleware para proteger endpoints /internal/ con x-internal-token.
 * Misma convencion que RentOS para comunicacion entre productos.
 */
import { Request, Response, NextFunction } from 'express';

export function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
    const token = req.headers['x-internal-token'];
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

    if (!token || token !== expectedToken) {
        res.status(401).json({
            status: 'FAIL',
            error: 'unauthorized',
            message: 'Token interno no valido',
        });
        return;
    }

    next();
}
