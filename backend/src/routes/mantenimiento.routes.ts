import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/mantenimientos/catalogo - Listar catálogo
router.get('/catalogo', async (req: Request, res: Response) => {
    try {
        const catalogo = await prisma.mantenimientoCatalogo.findMany({
            where: { activo: true },
            orderBy: { tipo: 'asc' }
        });
        res.json({ data: catalogo });
    } catch (error) {
        console.error('Error listando catálogo:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/mantenimientos/vehiculo/:vehiculoId - Mantenimientos de un vehículo
router.get('/vehiculo/:vehiculoId', async (req: Request, res: Response) => {
    try {
        const { soloActivos } = req.query;

        const mantenimientos = await prisma.mantenimientoVehiculo.findMany({
            where: {
                vehiculoId: req.params.vehiculoId,
                // R-MT-005: Si nunca se usa, no aparece (solo mostrar usados o pendientes)
                ...(soloActivos === 'true' ? {
                    OR: [
                        { ultimaEjecucionKm: { not: null } },
                        { estado: { in: ['PENDIENTE', 'VENCIDO'] } }
                    ]
                } : {})
            },
            include: { catalogo: true },
            orderBy: { estado: 'asc' }
        });

        res.json({ data: mantenimientos });

    } catch (error) {
        console.error('Error listando mantenimientos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/mantenimientos/vehiculo/:vehiculoId/proximos - Próximos mantenimientos
router.get('/vehiculo/:vehiculoId/proximos', async (req: Request, res: Response) => {
    try {
        const vehiculo = await prisma.vehiculo.findUnique({
            where: { id: req.params.vehiculoId }
        });

        if (!vehiculo) {
            return res.status(404).json({ error: 'Vehículo no encontrado' });
        }

        // Mantenimientos próximos (umbral: 1000 km o 30 días)
        const kmUmbral = vehiculo.kmActuales + 1000;
        const fechaUmbral = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const proximos = await prisma.mantenimientoVehiculo.findMany({
            where: {
                vehiculoId: req.params.vehiculoId,
                OR: [
                    { proximoKm: { lte: kmUmbral } },
                    { proximaFecha: { lte: fechaUmbral } }
                ],
                estado: { not: 'RESUELTO' }
            },
            include: { catalogo: true }
        });

        res.json({
            data: proximos,
            kmActuales: vehiculo.kmActuales,
            fechaActual: new Date()
        });

    } catch (error) {
        console.error('Error obteniendo próximos mantenimientos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/mantenimientos/:id/resolver - Resolver mantenimiento (por factura)
router.post('/:id/resolver', async (req: Request, res: Response) => {
    try {
        const { kmEjecucion, fechaFactura, urlFactura } = req.body;

        const mantenimiento = await prisma.mantenimientoVehiculo.findUnique({
            where: { id: req.params.id },
            include: { catalogo: true, vehiculo: true }
        });

        if (!mantenimiento) {
            return res.status(404).json({ error: 'Mantenimiento no encontrado' });
        }

        // Calcular próximo km/fecha basado en frecuencia
        const km = kmEjecucion || mantenimiento.vehiculo.kmActuales;
        const frecuenciaKm = mantenimiento.frecuenciaAprendida || mantenimiento.catalogo.frecuenciaKm;
        const frecuenciaMeses = mantenimiento.catalogo.frecuenciaMeses;

        const actualizado = await prisma.mantenimientoVehiculo.update({
            where: { id: req.params.id },
            data: {
                ultimaEjecucionKm: km,
                ultimaEjecucionFecha: fechaFactura ? new Date(fechaFactura) : new Date(),
                proximoKm: frecuenciaKm ? km + frecuenciaKm : null,
                proximaFecha: frecuenciaMeses
                    ? new Date(Date.now() + frecuenciaMeses * 30 * 24 * 60 * 60 * 1000)
                    : null,
                estado: 'RESUELTO'
            },
            include: { catalogo: true }
        });

        // Registrar gasto si hay factura
        if (urlFactura) {
            await prisma.gasto.create({
                data: {
                    vehiculoId: mantenimiento.vehiculoId,
                    tipo: 'MANTENIMIENTO',
                    descripcion: mantenimiento.catalogo.nombre,
                    importe: req.body.importe || 0,
                    fecha: new Date(),
                    urlFactura
                }
            });
        }

        res.json({
            data: actualizado,
            evento: 'E-MT-003' // Mantenimiento resuelto
        });

    } catch (error) {
        console.error('Error resolviendo mantenimiento:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/mantenimientos/:id/aprender - Actualizar frecuencia aprendida
// R-MT-003: El sistema puede aprender la frecuencia real por vehículo
router.post('/:id/aprender', async (req: Request, res: Response) => {
    try {
        const { frecuenciaAprendida } = req.body;

        const actualizado = await prisma.mantenimientoVehiculo.update({
            where: { id: req.params.id },
            data: { frecuenciaAprendida }
        });

        res.json({
            data: actualizado,
            evento: 'E-MT-004' // Frecuencia actualizada
        });

    } catch (error) {
        console.error('Error actualizando frecuencia:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
