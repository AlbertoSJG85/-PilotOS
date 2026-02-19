import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/gastos - Crear gasto
router.post('/', async (req: Request, res: Response) => {
    try {
        const gasto = await prisma.gasto.create({
            data: {
                ...req.body,
                estado: 'REGISTRADO'
            }
        });
        res.status(201).json({ data: gasto });
    } catch (error) {
        console.error('Error creando gasto:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/gastos - Listar gastos
router.get('/', async (req: Request, res: Response) => {
    try {
        const { vehiculoId, tipo, desde, hasta } = req.query;
        const where: any = {};

        if (vehiculoId) where.vehiculoId = vehiculoId;
        if (tipo) where.tipo = tipo;
        if (desde || hasta) {
            where.fecha = {};
            if (desde) where.fecha.gte = new Date(desde as string);
            if (hasta) where.fecha.lte = new Date(hasta as string);
        }

        const gastos = await prisma.gasto.findMany({
            where,
            orderBy: { fecha: 'desc' }
        });

        // Calcular totales por tipo
        const totales = await prisma.gasto.groupBy({
            by: ['tipo'],
            _sum: { importe: true },
            where
        });

        res.json({ data: gastos, totales });

    } catch (error) {
        console.error('Error listando gastos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/gastos/resumen - Resumen de gastos por tipo y período
router.get('/resumen', async (req: Request, res: Response) => {
    try {
        const { desde, hasta, vehiculoId } = req.query;
        const where: any = {};

        if (vehiculoId) where.vehiculoId = vehiculoId;
        if (desde || hasta) {
            where.fecha = {};
            if (desde) where.fecha.gte = new Date(desde as string);
            if (hasta) where.fecha.lte = new Date(hasta as string);
        }

        // Total by type
        const porTipo = await prisma.gasto.groupBy({
            by: ['tipo'],
            _sum: { importe: true },
            _count: { id: true },
            where
        });

        // Grand total
        const total = await prisma.gasto.aggregate({
            _sum: { importe: true },
            _count: { id: true },
            where
        });

        // Monthly breakdown (last 6 months)
        const hace6Meses = new Date();
        hace6Meses.setMonth(hace6Meses.getMonth() - 6);

        const gastosMensuales = await prisma.gasto.findMany({
            where: { ...where, fecha: { gte: hace6Meses } },
            select: { fecha: true, importe: true, tipo: true },
            orderBy: { fecha: 'asc' }
        });

        // Group by month manually
        const porMes: Record<string, number> = {};
        for (const g of gastosMensuales) {
            const key = `${g.fecha.getFullYear()}-${String(g.fecha.getMonth() + 1).padStart(2, '0')}`;
            porMes[key] = (porMes[key] || 0) + g.importe;
        }

        res.json({
            porTipo,
            total: {
                importe: total._sum.importe || 0,
                cantidad: total._count.id || 0
            },
            porMes
        });

    } catch (error) {
        console.error('Error generando resumen de gastos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/gastos/fijos - Listar gastos fijos
router.get('/fijos', async (req: Request, res: Response) => {
    try {
        const gastosFijos = await prisma.gastoFijo.findMany({
            where: { activo: true },
            include: { vehiculo: true }
        });
        res.json({ data: gastosFijos });
    } catch (error) {
        console.error('Error listando gastos fijos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/gastos/fijos - Crear gasto fijo
router.post('/fijos', async (req: Request, res: Response) => {
    try {
        const gastoFijo = await prisma.gastoFijo.create({
            data: req.body
        });
        res.status(201).json({ data: gastoFijo });
    } catch (error) {
        console.error('Error creando gasto fijo:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// PATCH /api/gastos/fijos/:id - Actualizar gasto fijo
router.patch('/fijos/:id', async (req: Request, res: Response) => {
    try {
        const gastoFijo = await prisma.gastoFijo.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json({ data: gastoFijo });
    } catch (error) {
        console.error('Error actualizando gasto fijo:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
