import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireAuth, requireRol } from '../middleware/auth.middleware';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/cierres
 * Lista los cierres de periodo del cliente.
 */
router.get('/', async (req, res, next) => {
    try {
        const cliente_id = (req as AuthRequest).usuario!.cliente_id;
        if (!cliente_id) return res.status(403).json({ status: 'FAIL', message: 'No tienes cliente asociado' });

        const cierres = await prisma.cierrePeriodo.findMany({
            where: { cliente_id },
            orderBy: { periodo_inicio: 'desc' },
        });

        res.json({
            status: 'SUCCESS',
            data: cierres,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/cierres
 * Genera un nuevo cierre de periodo para un rango de fechas.
 */
router.post('/', requireRol('admin', 'patron'), async (req, res, next) => {
    try {
        const cliente_id = (req as AuthRequest).usuario!.cliente_id;
        if (!cliente_id) return res.status(403).json({ status: 'FAIL', message: 'No tienes cliente asociado' });

        const { desde, hasta } = req.body;

        if (!desde || !hasta) {
            return res.status(400).json({ status: 'FAIL', message: 'Faltan parámetros: desde, hasta' });
        }

        const fechaInicio = new Date(desde);
        const fechaFin = new Date(hasta);

        // 1. Obtener partes diarios
        const partes = await prisma.parteDiario.findMany({
            where: {
                vehiculo: { cliente_id },
                fecha_trabajada: { gte: fechaInicio, lte: fechaFin },
                estado: 'VALIDADO' // Consideramos solo partes validados (o todos? PilotOS_Master dice último validado)
            },
            include: { calculo: true }
        });

        // 2. Gastos variables
        const gastos = await prisma.gasto.findMany({
            where: {
                cliente_id,
                fecha: { gte: fechaInicio, lte: fechaFin }
            }
        });

        // 3. Gastos fijos vigentes
        const gastosFijos = await prisma.gastoFijo.findMany({
            where: { cliente_id, activo: true }
        });

        // Calculos
        let totalBruto = new Decimal(0);
        let totalCombustible = new Decimal(0);
        let totalNeto = new Decimal(0);
        let totalConductor = new Decimal(0);
        let totalPatron = new Decimal(0);

        // PilotOS Cuota (se ignora para la suma general de variables si es deduccion nativa, pero se pide registrar en el modelo)
        // El cliente tiene una configuracion economica actual
        const config = await prisma.configuracionEconomica.findFirst({
            where: { cliente_id, activo: true, fecha_fin: null }
        });
        const cuotaPilotos = config ? config.cuota_pilotos : new Decimal(0);

        for (const p of partes) {
            totalBruto = totalBruto.plus(p.ingreso_bruto);
            if (p.combustible) totalCombustible = totalCombustible.plus(p.combustible);

            if (p.calculo) {
                totalNeto = totalNeto.plus(p.calculo.neto_diario);
                totalConductor = totalConductor.plus(p.calculo.parte_conductor);
                totalPatron = totalPatron.plus(p.calculo.parte_patron);
            } else {
                totalNeto = totalNeto.plus(p.ingreso_bruto);
                totalPatron = totalPatron.plus(p.ingreso_bruto);
            }
        }

        let totalGastosVariables = new Decimal(0);
        for (const g of gastos) {
            totalGastosVariables = totalGastosVariables.plus(g.importe);
        }

        let totalGastosFijos = new Decimal(0);
        for (const gf of gastosFijos) {
            // Simplificación MVP: Si es MENSUAL, lo sumo tal cual para el cierre. 
            // Si el rango es varios meses, esto requeriría cálculo proporcional.
            totalGastosFijos = totalGastosFijos.plus(gf.importe);
        }

        // 4. Crear el registro en BD
        const cierre = await prisma.cierrePeriodo.create({
            data: {
                cliente_id,
                periodo_inicio: fechaInicio,
                periodo_fin: fechaFin,
                total_bruto: totalBruto,
                total_combustible: totalCombustible,
                total_neto: totalNeto,
                total_gastos_fijos: totalGastosFijos,
                total_gastos_variables: totalGastosVariables,
                total_conductor: totalConductor,
                total_patron: totalPatron,
                cuota_pilotos: cuotaPilotos,
                num_partes: partes.length,
                estado: 'BORRADOR', // Empieza como borrador
            }
        });

        res.json({
            status: 'SUCCESS',
            data: cierre
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/cierres/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const cliente_id = (req as AuthRequest).usuario!.cliente_id;
        if (!cliente_id) return res.status(403).json({ status: 'FAIL', message: 'No tienes cliente asociado' });

        const cierre = await prisma.cierrePeriodo.findUnique({
            where: { id, cliente_id }
        });

        if (!cierre) {
            return res.status(404).json({ status: 'FAIL', message: 'Cierre no encontrado' });
        }

        res.json({ status: 'SUCCESS', data: cierre });
    } catch (error) {
        next(error);
    }
});

export default router;
