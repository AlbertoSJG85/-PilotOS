/**
 * /api/partners — panel de las asociaciones (PilotOS Partners, DT-041).
 *
 * Público a propósito (va antes de `requireAuth`): quien entra aquí no es un
 * taxista. Cada ruta comprueba su propia sesión de partner.
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { hashPassword, validarFortalezaPassword, verificarPassword } from '../lib/password';
import { origenAjeno } from '../lib/sesion-cookie';
import { claveDeIntento } from '../lib/limite-intentos';
import { consultarResumenPartner } from '../lib/nexos-pay';
import {
    borrarSesionPartner,
    cuentaDeLaSesion,
    cuentaDelEnlace,
    emitirSesionPartner,
    enviarRecuperacion,
    normalizarUsuario,
} from '../services/partners.service';

const router = Router();

const limitador = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Por IP y cuenta (usuario o enlace): ver lib/limite-intentos.ts.
    keyGenerator: claveDeIntento,
    message: { status: 'FAIL', error: 'too_many_requests', message: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' },
});

function fallo(res: Response, http: number, error: string, message: string) {
    res.status(http).json({ status: 'FAIL', error, message });
}

/** Lo que cambia estado no se acepta desde otra web. */
router.use((req: Request, res: Response, next) => {
    if (req.method !== 'GET' && origenAjeno(req)) {
        fallo(res, 403, 'origen_no_permitido', 'Origen no permitido');
        return;
    }
    next();
});

/**
 * GET /api/partners/enlace?token=…
 * Para la página del enlace del correo: dice si vale y a qué asociación es.
 */
router.get('/enlace', limitador, async (req: Request, res: Response) => {
    const cuenta = await cuentaDelEnlace(req.query.token);
    if (!cuenta) {
        fallo(res, 404, 'enlace_no_valido', 'Este enlace ya no sirve: ha caducado o ya se ha usado.');
        return;
    }
    res.json({
        status: 'OK',
        tipo: cuenta.token_tipo,
        nombre: cuenta.nombre,
        codigo: cuenta.codigo,
        usuario: cuenta.usuario,
    });
});

/**
 * POST /api/partners/acceso { token, usuario?, password }
 * Crea el acceso (enlace de bienvenida: elige usuario) o pone una contraseña
 * nueva (enlace de recuperación). Deja la sesión iniciada.
 */
router.post('/acceso', limitador, async (req: Request, res: Response) => {
    try {
        const cuenta = await cuentaDelEnlace(req.body?.token);
        if (!cuenta) {
            fallo(res, 404, 'enlace_no_valido', 'Este enlace ya no sirve: ha caducado o ya se ha usado.');
            return;
        }
        const fuerza = validarFortalezaPassword(req.body?.password);
        if (!fuerza.valid) {
            fallo(res, 400, 'password_debil', 'La contraseña debe tener al menos 8 caracteres.');
            return;
        }

        let usuario = cuenta.usuario;
        if (!usuario) {
            usuario = normalizarUsuario(req.body?.usuario);
            if (!usuario) {
                fallo(res, 400, 'usuario_no_valido', 'El usuario debe tener entre 3 y 40 caracteres: letras sin tilde, números, punto, guion o guion bajo.');
                return;
            }
            const ocupado = await prisma.partnerCuenta.findUnique({ where: { usuario } });
            if (ocupado && ocupado.id !== cuenta.id) {
                fallo(res, 409, 'usuario_ocupado', 'Ese usuario ya existe. Prueba con otro.');
                return;
            }
        }

        const ahora = new Date();
        const actualizada = await prisma.partnerCuenta.update({
            where: { id: cuenta.id },
            data: {
                usuario,
                password_hash: await hashPassword(req.body.password),
                token_hash: null,
                token_tipo: null,
                token_expira: null,
                sesiones_validas_desde: ahora,
                ultimo_acceso: ahora,
            },
        });
        emitirSesionPartner(res, actualizada);
        res.json({ status: 'OK', usuario });
    } catch (err: any) {
        // Dos personas eligiendo el mismo usuario a la vez.
        if (err?.code === 'P2002') {
            fallo(res, 409, 'usuario_ocupado', 'Ese usuario ya existe. Prueba con otro.');
            return;
        }
        console.error('[PARTNERS] acceso:', err?.message);
        fallo(res, 500, 'error_interno', 'No se ha podido guardar. Inténtalo de nuevo.');
    }
});

/** POST /api/partners/login { usuario, password } — el usuario o el correo de la asociación. */
router.post('/login', limitador, async (req: Request, res: Response) => {
    try {
        const entrada = typeof req.body?.usuario === 'string' ? req.body.usuario.trim().toLowerCase() : '';
        const password = req.body?.password;
        if (!entrada || typeof password !== 'string' || !password) {
            fallo(res, 400, 'faltan_datos', 'Escribe el usuario y la contraseña.');
            return;
        }
        const cuenta = await prisma.partnerCuenta.findFirst({
            where: { OR: [{ usuario: entrada }, { email: entrada }], usuario: { not: null } },
        });
        const valida = cuenta?.activo ? await verificarPassword(password, cuenta.password_hash) : false;
        if (!cuenta || !valida) {
            // Mismo mensaje siempre: no revela si el usuario existe.
            fallo(res, 401, 'credenciales_no_validas', 'Usuario o contraseña incorrectos.');
            return;
        }
        await prisma.partnerCuenta.update({ where: { id: cuenta.id }, data: { ultimo_acceso: new Date() } });
        emitirSesionPartner(res, cuenta);
        res.json({ status: 'OK' });
    } catch (err: any) {
        console.error('[PARTNERS] login:', err?.message);
        fallo(res, 500, 'error_interno', 'No se ha podido entrar. Inténtalo de nuevo.');
    }
});

/**
 * POST /api/partners/recuperar { usuario }
 * Usuario o correo. Responde siempre lo mismo, exista o no.
 */
router.post('/recuperar', limitador, async (req: Request, res: Response) => {
    const entrada = typeof req.body?.usuario === 'string' ? req.body.usuario.trim().toLowerCase() : '';
    if (entrada) {
        try {
            const cuenta = await prisma.partnerCuenta.findFirst({
                where: { activo: true, OR: [{ usuario: entrada }, { email: entrada }] },
            });
            if (cuenta) await enviarRecuperacion(cuenta);
        } catch (err: any) {
            console.error('[PARTNERS] recuperar:', err?.message);
        }
    }
    res.json({
        status: 'OK',
        message: 'Si hay una cuenta con ese usuario o correo, le hemos enviado un enlace para poner una contraseña nueva.',
    });
});

/** POST /api/partners/salir */
router.post('/salir', (_req: Request, res: Response) => {
    borrarSesionPartner(res);
    res.json({ status: 'OK' });
});

/** GET /api/partners/panel — los números de la asociación de la sesión. */
router.get('/panel', async (req: Request, res: Response) => {
    const cuenta = await cuentaDeLaSesion(req);
    if (!cuenta) {
        borrarSesionPartner(res);
        fallo(res, 401, 'sin_sesion', 'Inicia sesión para ver el panel.');
        return;
    }
    const resumen = await consultarResumenPartner(cuenta.codigo);
    if (!resumen.ok) {
        fallo(res, 503, 'datos_no_disponibles', 'Ahora mismo no podemos cargar los datos. Prueba de nuevo en unos minutos.');
        return;
    }
    res.json({
        status: 'OK',
        cuenta: { nombre: cuenta.nombre, codigo: cuenta.codigo, usuario: cuenta.usuario },
        ...resumen.datos,
    });
});

export default router;
