import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// VALIDACIONES SEGÚN REGLAS CANÓNICAS
// ============================================

interface ParteDiarioInput {
    fechaTrabajada: string;
    vehiculoId: string;
    conductorId: string;
    kmInicio: number;
    kmFin: number;
    ingresoTotal: number;
    ingresoDatafono: number;
    combustible?: number;
    fotoTaximetroUrl?: string; // Nuevo campo
    fotoGasoilUrl?: string;     // Nuevo campo
}

function validarParteDiario(data: ParteDiarioInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // R-PD-012: Campos obligatorios
    if (!data.fechaTrabajada) errors.push('fecha_trabajada es obligatorio');
    if (!data.vehiculoId) errors.push('vehículo es obligatorio');
    if (!data.conductorId) errors.push('conductor es obligatorio');
    if (data.kmInicio === undefined) errors.push('km_inicio es obligatorio');
    if (data.kmFin === undefined) errors.push('km_fin es obligatorio');
    if (data.ingresoTotal === undefined) errors.push('ingreso_total es obligatorio');
    if (data.ingresoDatafono === undefined) errors.push('ingreso_datáfono es obligatorio');

    // R-PD-013: km_fin > km_inicio
    if (data.kmFin <= data.kmInicio) {
        errors.push('km_fin debe ser estrictamente mayor que km_inicio');
    }

    // R-PD-014: ingreso_total >= ingreso_datáfono
    if (data.ingresoTotal < data.ingresoDatafono) {
        errors.push('ingreso_total debe ser mayor o igual que ingreso_datáfono');
    }

    return { valid: errors.length === 0, errors };
}

// ============================================
// ENDPOINTS
// ============================================

// POST /api/partes - Crear parte diario
router.post('/', async (req: Request, res: Response) => {
    try {
        const data: ParteDiarioInput = req.body;

        // Validar campos
        const validation = validarParteDiario(data);

        const {
            fechaTrabajada,
            vehiculoId,
            conductorId,
            kmInicio,
            kmFin,
            ingresoTotal,
            ingresoDatafono,
            combustible,
            fotoTaximetroUrl,
            fotoGasoilUrl
        } = data;
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Validación fallida',
                detalles: validation.errors,
                regla: 'R-PD-012'
            });
        }

        // R-PD-016: Solo un parte por vehículo y día
        const fechaDate = new Date(data.fechaTrabajada);
        const existente = await prisma.parteDiario.findUnique({
            where: {
                vehiculoId_fechaTrabajada: {
                    vehiculoId: data.vehiculoId,
                    fechaTrabajada: fechaDate
                }
            }
        });

        if (existente) {
            return res.status(409).json({
                error: 'Ya existe un parte para este vehículo y día',
                regla: 'R-PD-016'
            });
        }

        // Verificar si hay tareas pendientes (bloqueo por foto)
        const tareasPendientes = await prisma.tareaPendiente.findFirst({
            where: {
                conductorId: data.conductorId,
                resuelta: false
            }
        });

        if (tareasPendientes) {
            return res.status(403).json({
                error: 'No puedes subir un nuevo parte. Tienes tareas pendientes.',
                regla: 'R-FT-006',
                tareaId: tareasPendientes.id
            });
        }

        // Crear el parte
        const parte = await prisma.parteDiario.create({
            data: {
                fechaTrabajada: new Date(fechaTrabajada),
                vehiculoId,
                conductorId,
                kmInicio,
                kmFin,
                ingresoTotal,
                ingresoDatafono,
                combustible,
                estado: 'ENVIADO',
                fotos: {
                    create: [
                        {
                            tipo: 'TAXIMETRO',
                            url: fotoTaximetroUrl || '',
                            estado: 'VALIDA' // Se asume válida por defecto, OCR validará después
                        },
                        ...(fotoGasoilUrl && combustible ? [{
                            tipo: 'GASOIL',
                            url: fotoGasoilUrl,
                            estado: 'VALIDA'
                        }] : [])
                    ]
                }
            },
            include: {
                vehiculo: true,
                conductor: true
            }
        });

        // Actualizar km del vehículo
        await prisma.vehiculo.update({
            where: { id: data.vehiculoId },
            data: { kmActuales: data.kmFin }
        });

        res.status(201).json({
            success: true,
            data: parte,
            evento: 'E-PD-001' // Parte enviado
        });

    } catch (error) {
        console.error('Error creando parte:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/partes - Listar partes
router.get('/', async (req: Request, res: Response) => {
    try {
        const { vehiculoId, conductorId, desde, hasta } = req.query;

        const where: any = {};
        if (vehiculoId) where.vehiculoId = vehiculoId;
        if (conductorId) where.conductorId = conductorId;
        if (desde || hasta) {
            where.fechaTrabajada = {};
            if (desde) where.fechaTrabajada.gte = new Date(desde as string);
            if (hasta) where.fechaTrabajada.lte = new Date(hasta as string);
        }

        const partes = await prisma.parteDiario.findMany({
            where,
            include: {
                vehiculo: true,
                conductor: true,
                fotos: true
            },
            orderBy: { fechaTrabajada: 'desc' }
        });

        res.json({ data: partes });

    } catch (error) {
        console.error('Error listando partes:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/partes/:id - Obtener un parte
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const parte = await prisma.parteDiario.findUnique({
            where: { id: req.params.id },
            include: {
                vehiculo: true,
                conductor: true,
                fotos: true,
                incidencias: true
            }
        });

        if (!parte) {
            return res.status(404).json({ error: 'Parte no encontrado' });
        }

        res.json({ data: parte });

    } catch (error) {
        console.error('Error obteniendo parte:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// R-PD-017: El parte NO se puede editar una vez enviado
// Solo permitimos actualizar el estado o fotos
router.patch('/:id/estado', async (req: Request, res: Response) => {
    try {
        const { estado } = req.body;

        // Solo permitir cambio a FOTO_SUSTITUIDA
        if (estado !== 'FOTO_SUSTITUIDA') {
            return res.status(400).json({
                error: 'Solo se permite cambiar estado a FOTO_SUSTITUIDA',
                regla: 'R-PD-017'
            });
        }

        const parte = await prisma.parteDiario.update({
            where: { id: req.params.id },
            data: { estado }
        });

        res.json({ data: parte });

    } catch (error) {
        console.error('Error actualizando estado:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
