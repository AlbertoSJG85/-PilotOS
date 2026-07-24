import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';

// DT-011: PrismaClient singleton
import { prisma } from './lib/prisma';

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
import incidenciaRoutes from './routes/incidencia.routes';
import cierreRoutes from './routes/cierre.routes';
import dashboardRoutes from './routes/dashboard.routes';

// Routes — Internal API (GlorIA integration)
import internalRoutes from './routes/internal.routes';
import { requireInternalToken } from './middleware/internal-token.middleware';

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

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'PilotOS Backend', version: '1.0.0' });
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

/**
 * Fase 2 (seguridad, 2026-07-24): resuelve el cliente_id propietario de un
 * fichero de /uploads a partir de su nombre, siguiendo Documento -> enlace ->
 * ParteDiario -> vehiculo. Antes de esta fase, /uploads solo comprobaba que
 * el JWT fuera valido: cualquier usuario autenticado de CUALQUIER cliente
 * podia leer fotos/tickets de otro cliente si conocia (o adivinaba) el
 * nombre del fichero.
 */
async function resolverClienteIdDeArchivo(filename: string): Promise<string | null> {
    if (!filename) return null;
    const documento = await prisma.documento.findFirst({
        where: { url: { endsWith: filename } },
        include: {
            enlaces: {
                include: { parteDiario: { include: { vehiculo: { select: { cliente_id: true } } } } },
            },
        },
    });
    if (!documento) return null;
    for (const enlace of documento.enlaces) {
        const clienteId = enlace.parteDiario?.vehiculo?.cliente_id;
        if (clienteId) return clienteId;
    }
    return null;
}

app.use('/uploads', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const cookieHeader = req.headers.cookie || '';
    const tokenFromCookie = cookieHeader.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('pilotos_token='))
        ?.slice('pilotos_token='.length);
    const authHeader = req.headers.authorization;
    const tokenFromBearer = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const token = tokenFromBearer || tokenFromCookie;
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
app.use('/api/partes', parteDiarioRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/anomalias', anomaliaRoutes);
app.use('/api/gastos', gastoRoutes);
app.use('/api/mantenimientos', mantenimientoRoutes);
app.use('/api/fotos', fotoRoutes);
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

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});

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

app.listen(PORT, () => {
    console.log(`PilotOS Backend running on port ${PORT}`);
    iniciarScheduler();
});

export { app, prisma };
