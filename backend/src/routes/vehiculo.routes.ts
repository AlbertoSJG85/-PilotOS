import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/vehiculos - Listar vehículos
router.get('/', async (req: Request, res: Response) => {
    try {
        const vehiculos = await prisma.vehiculo.findMany({
            where: { activo: true },
            include: {
                conductores: {
                    include: { conductor: true }
                }
            }
        });
        res.json({ data: vehiculos });
    } catch (error) {
        console.error('Error listando vehículos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/vehiculos/:id - Obtener vehículo
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const vehiculo = await prisma.vehiculo.findUnique({
            where: { id: req.params.id },
            include: {
                conductores: { include: { conductor: true } },
                mantenimientos: { include: { catalogo: true } }
            }
        });
        if (!vehiculo) {
            return res.status(404).json({ error: 'Vehículo no encontrado' });
        }
        res.json({ data: vehiculo });
    } catch (error) {
        console.error('Error obteniendo vehículo:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/vehiculos - Crear vehículo
router.post('/', async (req: Request, res: Response) => {
    try {
        const vehiculo = await prisma.vehiculo.create({
            data: req.body
        });
        res.status(201).json({ data: vehiculo });
    } catch (error) {
        console.error('Error creando vehículo:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// PATCH /api/vehiculos/:id - Actualizar vehículo
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const vehiculo = await prisma.vehiculo.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json({ data: vehiculo });
    } catch (error) {
        console.error('Error actualizando vehículo:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
