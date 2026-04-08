import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true; // Allow all in development
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

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
app.use('/uploads', express.static(uploadsDir));

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

app.listen(PORT, () => {
    console.log(`PilotOS Backend running on port ${PORT}`);
    iniciarScheduler();
});

export { app, prisma };
