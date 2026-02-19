import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/usuarios - Listar usuarios
router.get('/', async (req: Request, res: Response) => {
    try {
        const { rol } = req.query;
        const where: any = { activo: true };
        if (rol) where.rol = rol;

        const usuarios = await prisma.usuario.findMany({
            where,
            include: {
                vehiculosAsignados: { include: { vehiculo: true } }
            }
        });
        res.json({ data: usuarios });
    } catch (error) {
        console.error('Error listando usuarios:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/usuarios/:id - Obtener usuario
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: req.params.id },
            include: {
                vehiculosAsignados: { include: { vehiculo: true } },
                conductores: true,
                anomalias: { orderBy: { createdAt: 'desc' } }
            }
        });
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json({ data: usuario });
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/usuarios/telefono/:telefono - Buscar por teléfono
router.get('/telefono/:telefono', async (req: Request, res: Response) => {
    try {
        const usuario = await prisma.usuario.findUnique({
            where: { telefono: req.params.telefono }
        });
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json({ data: usuario });
    } catch (error) {
        console.error('Error buscando usuario:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/usuarios - Crear usuario
router.post('/', async (req: Request, res: Response) => {
    try {
        const usuario = await prisma.usuario.create({
            data: req.body
        });
        res.status(201).json({ data: usuario });
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
