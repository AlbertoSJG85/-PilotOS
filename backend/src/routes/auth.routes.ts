/**
 * Auth routes — Login y /me para PilotOS.
 * Conecta con minos.Users (DT-011 singleton, DT-010 sin fallback).
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { generarToken, requireAuth, AuthRequest } from '../middleware/auth.middleware';
import crypto from 'crypto';
import { esPlaceholder, hashPassword, validarFortalezaPassword, verificarPassword } from '../lib/password';
import { enviarAvisoGloria } from '../services/notificacion.service';
import { enviarEmail, esEmailEntregable, cuerpoCodigoRecuperacion } from '../services/email.service';

const router = Router();

// Fase 1 (seguridad): limitar intentos de login/establecimiento de contrasena
// por IP para dificultar fuerza bruta y enumeracion de telefonos.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'FAIL', error: 'too_many_requests', message: 'Demasiados intentos. Intentalo mas tarde.' },
});

/**
 * Busca todos los candidatos minos.Users para un telefono (dual-format +34/34)
 * y selecciona el que tenga contexto PilotOS (conductor o patron), igual que
 * hacia el login original. Puede haber varios usuarios NexOS con el mismo numero.
 */
async function resolverCandidatoPilotOS(telefono: string) {
    const phoneVariants = [telefono];
    if (telefono.startsWith('+')) phoneVariants.push(telefono.substring(1));
    else phoneVariants.push('+' + telefono);

    const candidatos = await prisma.minosUser.findMany({
        where: { telefono: { in: phoneVariants } },
    });

    if (candidatos.length === 0) return null;

    let usuario = candidatos[0];
    if (candidatos.length > 1) {
        for (const candidato of candidatos) {
            const tienePilotos = await prisma.conductor.findFirst({ where: { usuario_id: candidato.id, activo: true } })
                ?? await prisma.cliente.findFirst({ where: { patron_id: candidato.id, activo: true } });
            if (tienePilotos) { usuario = candidato; break; }
        }
    }
    return usuario;
}

/**
 * Resuelve el contexto PilotOS (cliente/conductor) de un usuario ya autenticado
 * y arma el payload de sesion (token + user + context). Compartido por login
 * y por establecer-password (que tambien inicia sesion tras fijar la contrasena).
 */
async function emitirSesion(usuario: { id: number; telefono: string | null; nombre: string | null; role: string | null }) {
    const conductor = await prisma.conductor.findFirst({
        where: { usuario_id: usuario.id, activo: true },
        include: { cliente: true },
    });
    const cliente = conductor?.cliente
        ?? await prisma.cliente.findFirst({ where: { patron_id: usuario.id, activo: true } });

    const esPatron = conductor?.es_patron ?? (cliente ? cliente.patron_id === usuario.id : false);

    // ¿Hay al menos un conductor asalariado activo en este cliente?
    // Esto permite al frontend ocultar UI de "asalariado/conductor/liquidación"
    // cuando el cliente trabaja solo como propietario.
    const tieneAsalariados = cliente
        ? (await prisma.conductor.count({
            where: { cliente_id: cliente.id, es_patron: false, activo: true },
        })) > 0
        : false;

    const token = generarToken({
        id: usuario.id,
        telefono: usuario.telefono || '',
        role: usuario.role || 'user',
        es_patron: esPatron,
        cliente_id: cliente?.id ?? null,
    });

    return {
        status: 'OK' as const,
        token,
        user: { id: usuario.id, nombre: usuario.nombre || '', telefono: usuario.telefono || '', role: usuario.role || 'user' },
        context: cliente ? {
            cliente_id: cliente.id,
            conductor_id: conductor?.id,
            es_patron: esPatron,
            tipo_actividad: cliente.tipo_actividad,
            tiene_asalariados: tieneAsalariados,
        } : null,
    };
}

/**
 * POST /api/auth/login
 * Autenticacion por telefono + contrasena (bcrypt). Dual-format (+34.../34...).
 *
 * Fase 1 (2026-07-24): antes de esta fase el login autenticaba solo con el
 * telefono, sin contrasena. Las cuentas creadas antes de esta fase tienen un
 * marcador en password_hash (ver lib/password.ts) y deben pasar primero por
 * POST /api/auth/establecer-password.
 */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
    try {
        const { telefono, password } = req.body;
        if (!telefono || !password) {
            res.status(400).json({ status: 'FAIL', error: 'missing_credentials', message: 'Telefono y contrasena son obligatorios' });
            return;
        }

        const usuario = await resolverCandidatoPilotOS(telefono);

        if (!usuario) {
            res.status(404).json({
                status: 'FAIL',
                error: 'user_not_found',
                message: 'Usuario no registrado',
                action: 'REDIRECT_ONBOARDING',
            });
            return;
        }

        if (esPlaceholder(usuario.password_hash)) {
            res.status(400).json({
                status: 'FAIL',
                error: 'password_not_set',
                message: 'Esta cuenta todavia no tiene contrasena. Establece una para continuar.',
                action: 'SET_PASSWORD',
            });
            return;
        }

        const passwordValida = await verificarPassword(password, usuario.password_hash);
        if (!passwordValida) {
            // Mensaje generico: no revelar si el telefono existe o si fallo la contrasena.
            res.status(401).json({ status: 'FAIL', error: 'invalid_credentials', message: 'Telefono o contrasena incorrectos' });
            return;
        }

        res.json(await emitirSesion(usuario));
    } catch (err: any) {
        console.error('[AUTH] login error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

/**
 * POST /api/auth/establecer-password
 * Fija la contrasena inicial de una cuenta que todavia tiene el marcador
 * placeholder (creada en onboarding o por el patron antes de esta fase).
 *
 * NOTA DE SEGURIDAD (pendiente de decision de negocio, ver auditoria Fase 1):
 * este endpoint solo exige "conocer el telefono" para fijar la PRIMERA
 * contrasena — la misma superficie de exposicion que tenia el login antiguo,
 * pero acotada a una unica vez por cuenta (en cuanto hay contrasena real,
 * esta ruta deja de aceptar esa cuenta y solo sirve /cambiar-password con
 * la contrasena anterior). Es un cierre parcial: ideal seria verificar
 * posesion del telefono (OTP WhatsApp via GlorIA) antes de fijarla. Queda
 * pendiente de que Alberto decida el canal de verificacion del bootstrap.
 */
router.post('/establecer-password', authLimiter, async (req: Request, res: Response) => {
    try {
        const { telefono, password } = req.body;
        if (!telefono || !password) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields', message: 'Telefono y contrasena son obligatorios' });
            return;
        }

        const fortaleza = validarFortalezaPassword(password);
        if (!fortaleza.valid) {
            res.status(400).json({ status: 'FAIL', error: 'weak_password', message: fortaleza.error });
            return;
        }

        const usuario = await resolverCandidatoPilotOS(telefono);
        if (!usuario) {
            res.status(404).json({ status: 'FAIL', error: 'user_not_found', message: 'Usuario no registrado', action: 'REDIRECT_ONBOARDING' });
            return;
        }

        if (!esPlaceholder(usuario.password_hash)) {
            res.status(409).json({
                status: 'FAIL',
                error: 'password_already_set',
                message: 'Esta cuenta ya tiene contrasena. Usa el cambio de contrasena si necesitas actualizarla.',
            });
            return;
        }

        const nuevoHash = await hashPassword(password);
        await prisma.minosUser.update({ where: { id: usuario.id }, data: { password_hash: nuevoHash } });

        res.json(await emitirSesion(usuario));
    } catch (err: any) {
        console.error('[AUTH] establecer-password error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

/**
 * POST /api/auth/cambiar-password
 * Cambia la contrasena de la cuenta autenticada. Exige la contrasena actual.
 */
router.post('/cambiar-password', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { password_actual, password_nueva } = req.body;
        if (!password_actual || !password_nueva) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields', message: 'password_actual y password_nueva son obligatorios' });
            return;
        }

        const fortaleza = validarFortalezaPassword(password_nueva);
        if (!fortaleza.valid) {
            res.status(400).json({ status: 'FAIL', error: 'weak_password', message: fortaleza.error });
            return;
        }

        const usuario = await prisma.minosUser.findUnique({ where: { id: req.usuario!.id } });
        if (!usuario) { res.status(404).json({ status: 'FAIL', error: 'user_not_found' }); return; }

        const passwordValida = await verificarPassword(password_actual, usuario.password_hash);
        if (!passwordValida) {
            res.status(401).json({ status: 'FAIL', error: 'invalid_credentials', message: 'La contrasena actual no es correcta' });
            return;
        }

        const nuevoHash = await hashPassword(password_nueva);
        await prisma.minosUser.update({ where: { id: usuario.id }, data: { password_hash: nuevoHash } });

        res.json({ status: 'OK', message: 'Contrasena actualizada' });
    } catch (err: any) {
        console.error('[AUTH] cambiar-password error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario) { res.status(401).json({ status: 'FAIL', error: 'auth_required' }); return; }

        const vehiculos = req.usuario.conductor_id
            ? await prisma.vehiculoConductor.findMany({
                where: { conductor_id: req.usuario.conductor_id, activo: true },
                include: { vehiculo: { select: { id: true, matricula: true, marca: true, modelo: true, km_actuales: true } } },
            })
            : [];

        const conductores = req.usuario.es_patron && req.usuario.cliente_id
            ? await prisma.conductor.findMany({
                where: { cliente_id: req.usuario.cliente_id, activo: true },
                include: { usuario: { select: { id: true, nombre: true, telefono: true } } },
            })
            : [];

        res.json({
            status: 'OK',
            user: req.usuario,
            vehiculos: vehiculos.map((vc) => vc.vehiculo),
            conductores: conductores.map((c) => ({ id: c.id, nombre: c.usuario.nombre, telefono: c.usuario.telefono, es_patron: c.es_patron })),
        });
    } catch (err: any) {
        console.error('[AUTH] /me error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
// Recuperación de contraseña (2026-08-11)
//
// Hasta hoy no existía: si olvidabas la contraseña había que editar el hash a
// mano en la base de datos. Pasó dos veces en cuatro días (C-039 el 7 de
// agosto, y otra vez el 11) — es la causa de fondo, no la anécdota.
//
// Decisiones que gobiernan estos dos endpoints:
//   - El código se manda por EMAIL (2026-08-12). Antes iba por WhatsApp, lo
//     que ataba una función crítica a que Meta apruebe una plantilla: a día de
//     hoy no han aprobado ninguna de las cuatro enviadas, así que el canal de
//     recuperación estaba de adorno. El correo solo depende de nosotros.
//     Se sigue identificando la cuenta por TELÉFONO (es lo que el usuario
//     recuerda y con lo que entra); el email es a dónde llega el código.
//   - La respuesta de `/recuperar` es SIEMPRE la misma exista o no la cuenta.
//     Si dijera "ese teléfono no está registrado" cualquiera podría averiguar
//     quién usa PilotOS probando números.
//   - El código no se guarda en claro, solo su hash: quien lea la tabla no
//     puede entrar en ninguna cuenta.
//   - Un solo uso, caduca en 15 minutos, y se quema a los 5 intentos fallidos.
// ─────────────────────────────────────────────────────────────────────────

const RESET_VIGENCIA_MIN = 15;
const RESET_MAX_INTENTOS = 5;

function generarCodigo(): string {
    // 6 dígitos con aleatoriedad criptográfica (no Math.random).
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * POST /api/auth/recuperar   { telefono }
 * Manda un código por email. Responde igual exista o no la cuenta.
 */
router.post('/recuperar', authLimiter, async (req: Request, res: Response) => {
    // Respuesta única, se use el camino que se use. Definida una sola vez para
    // que sea imposible que una rama conteste distinto sin querer.
    const respuestaNeutra = {
        status: 'OK',
        message: 'Si el telefono corresponde a una cuenta, recibiras un codigo en tu correo.',
    };

    try {
        const { telefono } = req.body;
        if (!telefono) {
            res.status(400).json({ status: 'FAIL', error: 'missing_telefono', message: 'El telefono es obligatorio' });
            return;
        }

        const usuario = await resolverCandidatoPilotOS(String(telefono).trim());
        // Sin cuenta, o con un email al que no se puede escribir (los
        // asalariados dados de alta antes del 2026-08-12 llevan el sintético
        // telefono@pilotos.app), no hay a dónde mandar el código. Se responde
        // igual —no se revela nada— pero queda en el log, porque significa que
        // esa persona no puede recuperar su contraseña sola.
        if (!usuario) {
            res.json(respuestaNeutra);
            return;
        }
        if (!esEmailEntregable(usuario.email)) {
            console.error(`[AUTH] El usuario ${usuario.id} no tiene un email al que escribir (${usuario.email}): no puede recuperar la contrasena solo.`);
            res.json(respuestaNeutra);
            return;
        }

        // Un código nuevo invalida los anteriores: si no, pedir varios dejaría
        // varias puertas abiertas a la vez.
        await prisma.passwordReset.updateMany({
            where: { usuario_id: usuario.id, usado_at: null },
            data: { usado_at: new Date() },
        });

        const codigo = generarCodigo();
        await prisma.passwordReset.create({
            data: {
                usuario_id: usuario.id,
                codigo_hash: await hashPassword(codigo),
                expira_at: new Date(Date.now() + RESET_VIGENCIA_MIN * 60 * 1000),
            },
        });

        const { asunto, cuerpo } = cuerpoCodigoRecuperacion(codigo, RESET_VIGENCIA_MIN);
        const envio = await enviarEmail(usuario.email, asunto, cuerpo);
        if (!envio.ok) {
            // No se le cuenta al usuario (revelaría que la cuenta existe), pero
            // tiene que verse en el log: si esto falla, nadie puede recuperar.
            console.error(`[AUTH] No se pudo enviar el codigo de recuperacion al usuario ${usuario.id}: ${envio.error}`);
        }

        res.json(respuestaNeutra);
    } catch (err: any) {
        console.error('[AUTH] recuperar error:', err.message);
        // Incluso ante un fallo interno se responde igual, por lo mismo.
        res.json(respuestaNeutra);
    }
});

/**
 * POST /api/auth/restablecer   { telefono, codigo, password }
 * Valida el código y fija la contraseña nueva. Deja la sesión iniciada.
 */
router.post('/restablecer', authLimiter, async (req: Request, res: Response) => {
    try {
        const { telefono, codigo, password } = req.body;
        if (!telefono || !codigo || !password) {
            res.status(400).json({
                status: 'FAIL', error: 'missing_fields',
                message: 'Telefono, codigo y contrasena son obligatorios',
            });
            return;
        }

        const fortaleza = validarFortalezaPassword(password);
        if (!fortaleza.valid) {
            res.status(400).json({ status: 'FAIL', error: 'weak_password', message: fortaleza.error });
            return;
        }

        // Mismo mensaje para "no existe la cuenta", "código incorrecto" y
        // "código caducado": no damos pistas sobre en cuál de las tres falla.
        const rechazar = () => res.status(400).json({
            status: 'FAIL', error: 'codigo_invalido',
            message: 'El codigo no es valido o ha caducado. Pide uno nuevo.',
        });

        const usuario = await resolverCandidatoPilotOS(String(telefono).trim());
        if (!usuario) { rechazar(); return; }

        const reset = await prisma.passwordReset.findFirst({
            where: { usuario_id: usuario.id, usado_at: null, expira_at: { gt: new Date() } },
            orderBy: { created_at: 'desc' },
        });
        if (!reset) { rechazar(); return; }

        if (reset.intentos >= RESET_MAX_INTENTOS) {
            await prisma.passwordReset.update({ where: { id: reset.id }, data: { usado_at: new Date() } });
            rechazar();
            return;
        }

        const coincide = await verificarPassword(String(codigo).trim(), reset.codigo_hash);
        if (!coincide) {
            await prisma.passwordReset.update({ where: { id: reset.id }, data: { intentos: { increment: 1 } } });
            rechazar();
            return;
        }

        // Código bueno: contraseña nueva y código quemado, de forma atómica —
        // que no pueda quedar la contraseña cambiada con el código aún vivo.
        await prisma.$transaction([
            prisma.minosUser.update({
                where: { id: usuario.id },
                data: { password_hash: await hashPassword(password) },
            }),
            prisma.passwordReset.update({
                where: { id: reset.id },
                data: { usado_at: new Date() },
            }),
        ]);

        console.log(`[AUTH] Contrasena restablecida para el usuario ${usuario.id}`);
        res.json(await emitirSesion(usuario));
    } catch (err: any) {
        console.error('[AUTH] restablecer error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

export default router;
