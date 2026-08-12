/**
 * Conectar el Drive del cliente (2026-08-12).
 *
 * Los papeles del taxi van al Drive DEL CLIENTE, no a uno nuestro. Aquí vive
 * el ida y vuelta con Google para que él nos dé permiso a dejarle archivos en
 * su carpeta — y para quitárnoslo cuando quiera.
 *
 * Solo el dueño conecta o desconecta: es su cuenta de Google y su Drive.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatron, AuthRequest } from '../middleware/auth.middleware';
import { urlDeConsentimiento, guardarConexion, estadoConexion, driveDisponible } from '../services/drive.service';

const router = Router();

/**
 * El `state` de OAuth va firmado con el secreto del JWT y caduca en 10
 * minutos. Sin firma, cualquiera podría completar la vuelta de Google
 * poniendo el cliente_id de otro y engancharle SU Drive.
 */
const VIGENCIA_STATE_MS = 10 * 60 * 1000;

function firmarState(clienteId: string, usuarioId: number): string {
    const datos = `${clienteId}.${usuarioId}.${Date.now()}`;
    const firma = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(datos).digest('hex');
    return Buffer.from(`${datos}.${firma}`).toString('base64url');
}

function verificarState(state: string): { clienteId: string; usuarioId: number } | null {
    try {
        const plano = Buffer.from(state, 'base64url').toString('utf8');
        const partes = plano.split('.');
        if (partes.length !== 4) return null;
        const [clienteId, usuarioId, emitido, firma] = partes;
        const esperada = crypto.createHmac('sha256', process.env.JWT_SECRET || '')
            .update(`${clienteId}.${usuarioId}.${emitido}`).digest('hex');
        // timingSafeEqual necesita longitudes iguales; si no coinciden, ya es inválida.
        if (firma.length !== esperada.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
        if (Date.now() - Number(emitido) > VIGENCIA_STATE_MS) return null;
        return { clienteId, usuarioId: Number(usuarioId) };
    } catch {
        return null;
    }
}

/** GET /api/drive/estado — ¿está conectado? ¿con qué cuenta? */
router.get('/estado', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.json({ status: 'OK', data: { disponible: driveDisponible(), conectado: false } }); return; }
        res.json({ status: 'OK', data: await estadoConexion(req.usuario.cliente_id) });
    } catch (err: any) {
        console.error('[DRIVE] Error de estado:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/** POST /api/drive/conectar — devuelve la URL de Google a la que ir. */
router.post('/conectar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        if (!driveDisponible()) {
            res.status(503).json({
                status: 'FAIL', error: 'drive_no_configurado',
                message: 'La conexión con Drive todavía no está habilitada en este entorno.',
            });
            return;
        }
        if (!req.usuario?.cliente_id) { res.status(403).json({ status: 'FAIL', error: 'no_client_context' }); return; }

        const url = urlDeConsentimiento(firmarState(req.usuario.cliente_id, req.usuario.id));
        res.json({ status: 'OK', authUrl: url });
    } catch (err: any) {
        console.error('[DRIVE] Error al iniciar conexión:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/**
 * GET /api/drive/callback — la vuelta de Google. NO lleva requireAuth: quien
 * llega aquí es el navegador del cliente redirigido por Google, sin nuestra
 * cabecera de sesión. Lo que autentica la petición es el `state` firmado.
 */
router.get('/callback', async (req: Request, res: Response) => {
    const destino = process.env.APP_URL || 'https://pilotos.nexostudios.digital';
    try {
        const { code, state, error } = req.query as Record<string, string | undefined>;

        if (error) return res.redirect(`${destino}/documentos?drive=denegado`);
        if (!code || !state) return res.redirect(`${destino}/documentos?drive=error`);

        const datos = verificarState(state);
        if (!datos) return res.redirect(`${destino}/documentos?drive=caducado`);

        const r = await guardarConexion(datos.clienteId, code, datos.usuarioId);
        if (!r.ok) {
            console.error('[DRIVE] No se pudo guardar la conexión:', r.error);
            return res.redirect(`${destino}/documentos?drive=error`);
        }
        return res.redirect(`${destino}/documentos?drive=conectado`);
    } catch (err: any) {
        console.error('[DRIVE] Error en el callback:', err.message);
        return res.redirect(`${destino}/documentos?drive=error`);
    }
});

/**
 * POST /api/drive/desconectar — deja de subir. NO borra nada de su Drive: los
 * documentos ya subidos son suyos y se quedan donde están.
 */
router.post('/desconectar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(403).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        await prisma.conexionDrive.updateMany({
            where: { cliente_id: req.usuario.cliente_id },
            data: { revocado_at: new Date() },
        });
        res.json({ status: 'OK', message: 'Desconectado. Los documentos ya subidos siguen en tu Drive.' });
    } catch (err: any) {
        console.error('[DRIVE] Error al desconectar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
