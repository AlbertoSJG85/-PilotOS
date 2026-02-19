import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Routes
import parteDiarioRoutes from './routes/parteDiario.routes';
import vehiculoRoutes from './routes/vehiculo.routes';
import usuarioRoutes from './routes/usuario.routes';
import onboardingRoutes from './routes/onboarding.routes';
import anomaliaRoutes from './routes/anomalia.routes';
import gastoRoutes from './routes/gasto.routes';
import mantenimientoRoutes from './routes/mantenimiento.routes';
import fotoRoutes from './routes/foto.routes';
import webhookRoutes from './routes/webhook.routes';
import uploadRoutes from './routes/upload.routes';
import path from 'path';
import authRoutes from './routes/auth.routes';
import incidenciaRoutes from './routes/incidencia.routes';

// Services
import { iniciarScheduler } from './services/scheduler.service';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'PilotOS Backend' });
});

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/mantenimientos', mantenimientoRoutes);
app.use('/api/fotos', fotoRoutes);
app.use('/api/webhook', webhookRoutes);

// Uploads (Ruta y Servicio Estático)
app.use('/api/upload', uploadRoutes); // Endpoint de subida
// Servir estáticos de /uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Protected routes
app.use('/api/partes', parteDiarioRoutes);
app.use('/api/vehiculos', vehiculoRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/anomalias', anomaliaRoutes);
app.use('/api/gastos', gastoRoutes);
app.use('/api/mantenimientos', mantenimientoRoutes);
app.use('/api/fotos', fotoRoutes);
app.use('/api/incidencias', incidenciaRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 PilotOS Backend running on port ${PORT}`);
    // Start scheduled tasks
    iniciarScheduler();
});

export { app, prisma };
