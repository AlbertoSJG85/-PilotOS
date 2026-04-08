/**
 * Parte Diario routes — Motor del sistema PilotOS.
 * R-PD-001: Solo entra por app web. R-PD-017: Inmutable tras envio.
 * DT-007: Calculo separado en calculos_partes.
 * DT-011: Singleton. DT-012: Transacciones.
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { crearOActualizarCalculo } from '../services/calculo.service';

const router = Router();

interface ParteDiarioInput {
    fecha_trabajada: string;
    vehiculo_id: string;
    conductor_id: string;
    km_inicio: number;
    km_fin: number;
    ingreso_bruto: number;
    ingreso_datafono: number;
    combustible?: number;
    varios?: number;
    concepto_varios?: string;
}

function validarParte(data: ParteDiarioInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data.fecha_trabajada) errors.push('fecha_trabajada es obligatorio');
    if (!data.vehiculo_id) errors.push('vehiculo_id es obligatorio');
    if (!data.conductor_id) errors.push('conductor_id es obligatorio');
    if (data.km_inicio === undefined) errors.push('km_inicio es obligatorio');
    if (data.km_fin === undefined) errors.push('km_fin es obligatorio');
    if (data.ingreso_bruto === undefined) errors.push('ingreso_bruto es obligatorio');
    if (data.ingreso_datafono === undefined) errors.push('ingreso_datafono es obligatorio');
    if (data.km_fin !== undefined && data.km_inicio !== undefined && data.km_fin <= data.km_inicio) {
        errors.push('km_fin debe ser mayor que km_inicio (R-PD-013)');
    }
    if (data.ingreso_bruto !== undefined && data.ingreso_datafono !== undefined && data.ingreso_bruto < data.ingreso_datafono) {
        errors.push('ingreso_bruto debe ser >= ingreso_datafono (R-PD-014)');
    }
    if (data.varios && data.varios > 0 && !data.concepto_varios) {
        errors.push('concepto_varios es obligatorio si varios > 0');
    }
    return { valid: errors.length === 0, errors };
}

// POST /api/partes — Crear parte diario
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const data: ParteDiarioInput = req.body;
        const validation = validarParte(data);
        if (!validation.valid) {
            res.status(400).json({ status: 'FAIL', error: 'validation_failed', detalles: validation.errors });
            return;
        }

        const fechaDate = new Date(data.fecha_trabajada);

        // R-PD-016: Solo un parte por vehiculo y dia
        const existente = await prisma.parteDiario.findUnique({
            where: { vehiculo_id_fecha_trabajada: { vehiculo_id: data.vehiculo_id, fecha_trabajada: fechaDate } },
        });
        if (existente) {
            res.status(409).json({ status: 'FAIL', error: 'duplicate_parte', regla: 'R-PD-016' });
            return;
        }

        // R-FT-006: Verificar tareas pendientes (desactivado en fase de test — C-019)
        // El bloqueo se reactivará cuando haya UI de resolución de tareas pendientes.
        // Ver: docs/learning/correcciones.md C-019

        // Crear parte + actualizar km + calcular reparto en transaccion (DT-012)
        const result = await prisma.$transaction(async (tx) => {
            const parte = await tx.parteDiario.create({
                data: {
                    fecha_trabajada: fechaDate,
                    vehiculo_id: data.vehiculo_id,
                    conductor_id: data.conductor_id,
                    km_inicio: data.km_inicio,
                    km_fin: data.km_fin,
                    ingreso_bruto: data.ingreso_bruto,
                    ingreso_datafono: data.ingreso_datafono,
                    combustible: data.combustible ?? null,
                    varios: data.varios ?? null,
                    concepto_varios: data.concepto_varios ?? null,
                    estado: 'ENVIADO',
                },
            });

            // Actualizar km del vehiculo (km oficial = ultimo parte validado)
            await tx.vehiculo.update({
                where: { id: data.vehiculo_id },
                data: { km_actuales: data.km_fin },
            });

            // Registrar evento en ledger
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_ENVIADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-${parte.id}`,
                    datos: { parte_id: parte.id, conductor_id: data.conductor_id, vehiculo_id: data.vehiculo_id },
                },
            });

            return parte;
        });

        // Calcular reparto (fuera de la transaccion principal para no bloquear si falla config)
        try {
            if (req.usuario?.cliente_id) {
                await crearOActualizarCalculo({ parte_diario_id: result.id, cliente_id: req.usuario.cliente_id });
            }
        } catch (calcErr: any) {
            console.warn('[PARTES] Calculo de reparto fallido (no bloquea parte):', calcErr.message);
        }

        res.status(201).json({ status: 'OK', data: result, evento: 'E-PD-001' });
    } catch (err: any) {
        console.error('[PARTES] Error creando parte:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

// GET /api/partes — Listar partes (filtrado por tenant)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { vehiculo_id, conductor_id, desde, hasta } = req.query;
        const where: any = {};

        // Tenant filter: solo partes de vehiculos del cliente
        if (req.usuario?.cliente_id) {
            where.vehiculo = { cliente_id: req.usuario.cliente_id };
        }
        if (vehiculo_id) where.vehiculo_id = vehiculo_id;
        if (conductor_id) where.conductor_id = conductor_id;
        if (desde || hasta) {
            where.fecha_trabajada = {};
            if (desde) where.fecha_trabajada.gte = new Date(desde as string);
            if (hasta) where.fecha_trabajada.lte = new Date(hasta as string);
        }

        const partes = await prisma.parteDiario.findMany({
            where,
            include: {
                vehiculo: { select: { id: true, matricula: true, marca: true, modelo: true } },
                conductor: { include: { usuario: { select: { nombre: true } } } },
                calculo: true,
                documentos: { include: { documento: true } },
            },
            orderBy: { fecha_trabajada: 'desc' },
        });

        res.json({ status: 'OK', data: partes });
    } catch (err: any) {
        console.error('[PARTES] Error listando:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/partes/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const parte = await prisma.parteDiario.findUnique({
            where: { id: req.params.id },
            include: {
                vehiculo: true,
                conductor: { include: { usuario: { select: { nombre: true, telefono: true } } } },
                calculo: true,
                documentos: { include: { documento: true } },
                incidencias: true,
            },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        res.json({ status: 'OK', data: parte });
    } catch (err: any) {
        console.error('[PARTES] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PATCH /api/partes/:id/estado — Solo permite FOTO_SUSTITUIDA (R-PD-017)
router.patch('/:id/estado', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { estado } = req.body;
        if (estado !== 'FOTO_SUSTITUIDA') {
            res.status(400).json({ status: 'FAIL', error: 'invalid_state', regla: 'R-PD-017' });
            return;
        }
        const parte = await prisma.parteDiario.update({ where: { id: req.params.id }, data: { estado } });
        res.json({ status: 'OK', data: parte });
    } catch (err: any) {
        console.error('[PARTES] Error actualizando estado:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
