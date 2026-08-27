import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';

// DT-011: PrismaClient singleton
import { prisma } from './lib/prisma';
import { resolverClienteIdDeArchivo } from './services/propiedadArchivo.service';
import { tokenDeLaPeticion } from './lib/sesion-cookie';

// Routes — Public API
import authRoutes from './routes/auth.routes';
import onboardingRoutes from './routes/onboarding.routes';
import uploadRoutes from './routes/upload.routes';

// Routes — Protected API
import parteDiarioRoutes from './routes/parteDiario.routes';
import vehiculoRoutes from './routes/vehiculo.routes';
import usuarioRoutes from './routes/usuario.routes';
import anomaliaRoutes from './routes/anomalia.routes';
import gastoRoutes from './routes/gasto.routes';
import mantenimientoRoutes from './routes/mantenimiento.routes';
import fotoRoutes from './routes/foto.routes';
import documentoVehiculoRoutes from './routes/documentoVehiculo.routes';
import notificacionRoutes from './routes/notificacion.routes';
import driveRoutes from './routes/drive.routes';
import incidenciaRoutes from './routes/incidencia.routes';
import cierreRoutes from './routes/cierre.routes';
import dashboardRoutes from './routes/dashboard.routes';

// Routes — Internal API (GlorIA integration)
import internalRoutes from './routes/internal.routes';
import { requireInternalToken } from './middleware/internal-token.middleware';
import { requireAuth } from './middleware/auth.middleware';
import { requireNexosPayAccess } from './middleware/billing-access.middleware';

// Services
import { iniciarScheduler } from './services/scheduler.service';

dotenv.config();

// DT-010: Fail if critical env vars are missing
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET no esta definido en variables de entorno');
    process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
    console.error('FATAL: ALLOWED_ORIGINS no esta definido en produccion');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Fase 1 (seguridad): cabeceras HTTP endurecidas. crossOriginResourcePolicy se
// relaja a 'cross-origin' porque el frontend (Next.js, otro origen) carga
// imagenes desde /uploads directamente en <img>; con el default 'same-origin'
// el navegador las bloquearia. crossOriginEmbedderPolicy se desactiva por la
// misma razon (esto es una API, no una pagina que empotre recursos de terceros).
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
}));

// Trust HTTPS reverse proxy (Coolify/nginx) so req.protocol returns 'https'
// and URLs stored in DB use the correct scheme.
app.set('trust proxy', true);

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true; // Allow all in development
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Liveness — "¿estoy vivo?". NO toca la base de datos, a propósito.
//
// El orquestador usa el healthcheck para decidir si MATAR el contenedor.
// Atarlo a la base de datos significa que un parpadeo de BD —o su
// mantenimiento— mate un proceso perfectamente sano; y como la base es
// compartida por todo el ecosistema, los mataría a todos a la vez. El
// healthcheck dejaría de ser una red de seguridad para ser un amplificador.
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'PilotOS Backend', version: '1.0.0' });
});

/** Cota de la sonda de readiness. Una sonda que no vuelve no informa de nada. */
const SONDA_READY_MS = 2000;

// Readiness — "¿puedo atender tráfico útil?". Esta SÍ mira la base de datos.
//
// La diferencia con /health es lo que hace el orquestador con la respuesta: un
// `not ready` saca del balanceo, no mata el proceso. Es reversible en cuanto la
// base vuelve.
app.get('/ready', async (_req, res) => {
    let temporizador: NodeJS.Timeout | undefined;
    try {
        const cota = new Promise<never>((_, rechazar) => {
            temporizador = setTimeout(() => rechazar(new Error('la base de datos no respondió a tiempo')), SONDA_READY_MS);
        });
        await Promise.race([prisma.$queryRaw`SELECT 1`, cota]);
        res.json({ status: 'ready', service: 'PilotOS Backend' });
    } catch (err: any) {
        res.status(503).json({ status: 'not_ready', motivo: err.message });
    } finally {
        // Sin esto, cada sonda deja un temporizador pendiente hasta que vence:
        // con una sonda cada pocos segundos son cientos de temporizadores vivos,
        // y al apagar retrasan la salida del proceso.
        //
        // `unref()` NO sirve aunque lo parezca: un temporizador sin referencia
        // no mantiene vivo el bucle de eventos, así que si la consulta se
        // cuelga, la carrera puede no resolverse nunca. Limpiar es lo correcto;
        // desreferenciar solo esconde el problema.
        clearTimeout(temporizador);
    }
});

// ============================================
// Internal API — GlorIA integration
// Protegido por x-internal-token (misma convencion que RentOS)
// ============================================
app.use('/internal', requireInternalToken, internalRoutes);

// ============================================
// Public routes (no auth required)
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Uploads
app.use('/api/upload', uploadRoutes);
const uploadsDir = path.join(process.cwd(), 'uploads');

// Quién es el dueño de un fichero de /uploads: en
// services/propiedadArchivo.service.ts, para que se pueda probar (2026-08-12).

app.use('/uploads', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // PIL-04: una sola forma de sacar el token de una petición, la de
    // `lib/sesion-cookie.ts`. Antes esto tenía su propio parseo y aceptaba
    // `Bearer` por su cuenta: dos criterios distintos para lo mismo, y el de
    // aquí se habría quedado atrás al cerrar el otro.
    const { token } = tokenDeLaPeticion(req);
    if (!token) { res.status(401).json({ error: 'auth_required' }); return; }

    let decoded: { role?: string; cliente_id?: string | null };
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET!) as typeof decoded;
    } catch {
        res.status(401).json({ error: 'invalid_token' });
        return;
    }

    if (decoded.role === 'admin') { next(); return; }

    if (!decoded.cliente_id) {
        res.status(403).json({ error: 'forbidden' });
        return;
    }

    try {
        const filename = decodeURIComponent(req.path).replace(/^\/+/, '').split('/').pop() || '';
        const clienteIdArchivo = await resolverClienteIdDeArchivo(filename);
        if (!clienteIdArchivo || clienteIdArchivo !== decoded.cliente_id) {
            res.status(403).json({ error: 'forbidden' });
            return;
        }
        next();
    } catch (err) {
        console.error('[UPLOADS] Error verificando tenencia:', (err as Error).message);
        res.status(500).json({ error: 'server_error' });
    }
}, express.static(uploadsDir));

// ============================================
// Protected routes (auth required)
// ============================================
// Drive DEL CLIENTE. Va ANTES del guardia global y no es un descuido
// (2026-08-13, C-066): la vuelta de Google —`GET /api/drive/callback`— la
// hace el navegador del cliente redirigido por Google, SIN nuestra cabecera
// de sesión ni nuestra cookie. Lo que autentica esa petición es el `state`
// firmado con HMAC que comprueba el propio router.
//
// Montado después del guardia, el callback moría en un 401 `auth_required`
// y el cliente veía un JSON crudo en la cara justo al volver de Google, con
// la conexión a medio hacer. El comentario de este bloque ya decía "va
// montado antes del requireAuth global" — pero la línea estaba debajo.
//
// Los otros endpoints (/estado, /conectar, /desconectar) NO quedan abiertos:
// llevan su propio requireAuth y su propio requirePatron dentro del router,
// más la comprobación de Pay que se les pone aquí.
app.use('/api/drive', requireNexosPayAccess(), driveRoutes);

// Pay gobierna el acceso del cliente PilotOS. Los routers conservan sus
// controles RBAC propios; requireAuth es idempotente para no repetir consultas.
app.use('/api', requireAuth, requireNexosPayAccess());
app.use('/api/partes', parteDiarioRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/anomalias', anomaliaRoutes);
app.use('/api/gastos', gastoRoutes);
app.use('/api/mantenimientos', requireNexosPayAccess('pilotos_proactividad'), mantenimientoRoutes);
app.use('/api/fotos', fotoRoutes);
// Documentacion del taxi (ITV, facturas de taller, poliza). Distinta de
// /api/fotos, que son los tickets del parte diario.
app.use('/api/documentos-vehiculo', documentoVehiculoRoutes);
app.use('/api/notificaciones', notificacionRoutes);
// (Drive va montado más arriba, antes del guardia global. Ver el porqué allí.)
app.use('/api/incidencias', incidenciaRoutes);
app.use('/api/cierres', cierreRoutes);
app.use('/api/dashboard', dashboardRoutes);



// Error handler (P-07: patron NexOS)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[ERROR]', err.stack);
    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({
        status: 'FAIL',
        error: 'server_error',
        message: isDev ? err.message : 'Error interno del servidor',
    });
});

/**
 * Apagado limpio — Fase 5 del roadmap de resiliencia.
 *
 * QUÉ ESTABA MAL, y es sutil: **había** un manejador de `SIGTERM`, así que
 * parecía resuelto. Pero hacía las cosas en el orden contrario.
 *
 * Desconectaba Prisma y salía **sin cerrar antes el servidor HTTP**. Es decir:
 * a las peticiones que se estaban atendiendo en ese momento se les arrancaba la
 * base de datos de debajo, a mitad de consulta, y un instante después moría el
 * proceso. En un producto donde una petición puede estar cerrando un parte
 * diario o registrando un gasto, eso es una escritura perdida — y nadie llega a
 * leer el error, porque el proceso se va justo detrás.
 *
 * Un apagado en el orden equivocado es peor que no tener apagado: no tenerlo se
 * ve, y tenerlo mal parece que está bien.
 *
 * El orden correcto:
 *   1. Cerrar el servidor — deja de aceptar conexiones nuevas y atiende las que
 *      ya están dentro.
 *   2. Desconectar Prisma — cuando ya no queda nadie usándolo.
 *
 * Con plazo máximo: un apagado que no termina de apagar deja el despliegue
 * colgado y acaba con alguien matando el proceso a lo bruto, que es justo lo
 * que esto evita.
 */
const PLAZO_APAGADO_MS = 15000;
let apagando = false;

async function apagarLimpio(senal: string): Promise<void> {
    if (apagando) return;
    apagando = true;
    console.log(`[apagado] ${senal} recibida. Drenando…`);

    const alarma = setTimeout(() => {
        console.error(`[apagado] no se terminó en ${PLAZO_APAGADO_MS} ms. Saliendo de todas formas.`);
        process.exit(1);
    }, PLAZO_APAGADO_MS);
    alarma.unref();

    try {
        await new Promise<void>((resolver) => servidor.close(() => resolver()));
        console.log('[apagado] servidor cerrado, sin peticiones en vuelo.');

        // Antes de soltar la base de datos: `purgarBorradoresAntiguos` borra
        // partes diarios dentro de una transacción, y arrancarla mientras se
        // cierra el pool es la forma de dejar un borrado a medias.
        scheduler?.detener();

        await prisma.$disconnect();
        console.log('[apagado] Prisma desconectado.');

        clearTimeout(alarma);
        process.exit(0);
    } catch (err: any) {
        console.error('[apagado] error durante el drenaje:', err?.message ?? err);
        clearTimeout(alarma);
        process.exit(1);
    }
}

process.on('SIGTERM', () => { void apagarLimpio('SIGTERM'); });
process.on('SIGINT', () => { void apagarLimpio('SIGINT'); });

// Protectores globales (R-SY-001: El backend nunca debe caer).
// 2026-07-25: antes NO se salia del proceso tras una excepcion no capturada,
// para "mantener el servicio activo". Verificado en el contenedor real de
// produccion: RestartPolicy=unless-stopped — Docker/Coolify reinicia el
// proceso automaticamente si termina, en segundos. Mantener vivo un proceso
// con estado potencialmente corrupto (conexiones a medio abrir, listeners
// duplicados, memoria en estado desconocido) es mas peligroso que dejar que
// el orquestador lo reinicie limpio. Esto SIGUE cumpliendo R-SY-001 en su
// intencion (el servicio no queda caido) sin arrastrar estado corrupto.
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message, err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

let scheduler: { detener: () => void } | null = null;

const servidor = app.listen(PORT, () => {
    console.log(`PilotOS Backend running on port ${PORT}`);
    scheduler = iniciarScheduler();
});

export { app, prisma };
