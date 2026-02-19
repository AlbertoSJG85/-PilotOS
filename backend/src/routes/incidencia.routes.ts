import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, requireAuth, requireRol } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// POST /api/incidencias - Crear incidencia (conductor)
router.post('/', requireAuth as any, async (req: AuthRequest, res: Response) => {
    try {
        const { parteDiarioId, queOcurrio, decisionTomada, justificacion } = req.body;

        // Validate required fields
        const errors: string[] = [];
        if (!parteDiarioId) errors.push('parteDiarioId es obligatorio');
        if (!queOcurrio) errors.push('queOcurrio es obligatorio');
        if (!decisionTomada) errors.push('decisionTomada es obligatorio');
        if (!justificacion) errors.push('justificacion es obligatorio');

        if (errors.length > 0) {
            return res.status(400).json({ error: 'Validación fallida', detalles: errors });
        }

        // Validate the parte exists
        const parte = await prisma.parteDiario.findUnique({
            where: { id: parteDiarioId },
            include: { conductor: true }
        });

        if (!parte) {
            return res.status(404).json({ error: 'Parte diario no encontrado' });
        }

        // Find the patron (autorizador)
        const conductor = await prisma.usuario.findUnique({
            where: { id: parte.conductorId },
            include: { patron: true }
        });

        if (!conductor?.patronId) {
            return res.status(400).json({ error: 'El conductor no tiene un patrón asignado' });
        }

        const incidencia = await prisma.incidencia.create({
            data: {
                parteDiarioId,
                queOcurrio,
                decisionTomada,
                justificacion,
                autorizadorId: conductor.patronId,
                estado: 'CREADA',
            },
            include: {
                parteDiario: true,
                autorizador: { select: { id: true, nombre: true } }
            }
        });

        res.status(201).json({
            data: incidencia,
            evento: 'E-IN-001' // Incidencia creada
        });

    } catch (error) {
        console.error('Error creando incidencia:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/incidencias - Listar incidencias
router.get('/', requireAuth as any, async (req: AuthRequest, res: Response) => {
    try {
        const { estado, parteDiarioId } = req.query;
        const where: any = {};

        // Patron sees all their incidencias, conductor sees their own
        if (req.usuario!.rol === 'PATRON') {
            where.autorizadorId = req.usuario!.id;
        } else {
            where.parteDiario = { conductorId: req.usuario!.id };
        }

        if (estado) where.estado = estado;
        if (parteDiarioId) where.parteDiarioId = parteDiarioId;

        const incidencias = await prisma.incidencia.findMany({
            where,
            include: {
                parteDiario: {
                    include: {
                        conductor: { select: { id: true, nombre: true } },
                        vehiculo: { select: { id: true, matricula: true } }
                    }
                },
                autorizador: { select: { id: true, nombre: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ data: incidencias });

    } catch (error) {
        console.error('Error listando incidencias:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/incidencias/:id - Obtener incidencia
router.get('/:id', requireAuth as any, async (req: AuthRequest, res: Response) => {
    try {
        const incidencia = await prisma.incidencia.findUnique({
            where: { id: req.params.id },
            include: {
                parteDiario: {
                    include: {
                        conductor: { select: { id: true, nombre: true, telefono: true } },
                        vehiculo: true,
                        fotos: true
                    }
                },
                autorizador: { select: { id: true, nombre: true } }
            }
        });

        if (!incidencia) {
            return res.status(404).json({ error: 'Incidencia no encontrada' });
        }

        res.json({ data: incidencia });

    } catch (error) {
        console.error('Error obteniendo incidencia:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// PATCH /api/incidencias/:id/cerrar - Cerrar incidencia (solo patrón)
router.patch('/:id/cerrar',
    requireAuth as any,
    requireRol('PATRON') as any,
    async (req: AuthRequest, res: Response) => {
        try {
            const incidencia = await prisma.incidencia.findUnique({
                where: { id: req.params.id }
            });

            if (!incidencia) {
                return res.status(404).json({ error: 'Incidencia no encontrada' });
            }

            // Only the assigned patron can close it
            if (incidencia.autorizadorId !== req.usuario!.id) {
                return res.status(403).json({
                    error: 'Solo el patrón asignado puede cerrar esta incidencia'
                });
            }

            if (incidencia.estado === 'CERRADA') {
                return res.status(400).json({ error: 'La incidencia ya está cerrada' });
            }

            const actualizada = await prisma.incidencia.update({
                where: { id: req.params.id },
                data: {
                    estado: 'CERRADA',
                    closedAt: new Date()
                },
                include: {
                    parteDiario: {
                        include: { conductor: { select: { nombre: true } } }
                    }
                }
            });

            res.json({
                data: actualizada,
                evento: 'E-IN-002' // Incidencia cerrada
            });

        } catch (error) {
            console.error('Error cerrando incidencia:', error);
            res.status(500).json({ error: 'Error interno' });
        }
    }
);

export default router;
