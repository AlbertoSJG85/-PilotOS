import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// POST /api/gastos
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        const { vehiculo_id, tipo, descripcion, importe, fecha, forma_pago, url_factura } = req.body;
        if (!tipo || !descripcion || importe === undefined || !fecha) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields' });
            return;
        }

        const gasto = await prisma.$transaction(async (tx) => {
            const g = await tx.gasto.create({
                data: { cliente_id: req.usuario!.cliente_id!, vehiculo_id: vehiculo_id || null, tipo, descripcion, importe, fecha: new Date(fecha), forma_pago: forma_pago || null, url_factura: url_factura || null, estado: 'REGISTRADO' },
            });
            await tx.ledgerEvento.create({
                data: { tipo_evento: 'GASTO_REGISTRADO', source: 'PILOTOS', dedupe_key: `gasto-${g.id}`, datos: { gasto_id: g.id, tipo, importe, origen: 'FRONTEND' } },
            });
            return g;
        });

        res.status(201).json({ status: 'OK', data: gasto });
    } catch (err: any) {
        console.error('[GASTOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/gastos
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { vehiculo_id, tipo, desde, hasta } = req.query;
        const where: any = {};
        if (req.usuario?.cliente_id) where.cliente_id = req.usuario.cliente_id;
        if (vehiculo_id) where.vehiculo_id = vehiculo_id;
        if (tipo) where.tipo = tipo;
        if (desde || hasta) {
            where.fecha = {};
            if (desde) where.fecha.gte = new Date(desde as string);
            if (hasta) where.fecha.lte = new Date(hasta as string);
        }

        const gastos = await prisma.gasto.findMany({ where, orderBy: { fecha: 'desc' } });
        const totales = await prisma.gasto.groupBy({ by: ['tipo'], _sum: { importe: true }, where });

        res.json({ status: 'OK', data: gastos, totales });
    } catch (err: any) {
        console.error('[GASTOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/gastos/resumen
router.get('/resumen', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = {};
        if (req.usuario?.cliente_id) where.cliente_id = req.usuario.cliente_id;

        const porTipo = await prisma.gasto.groupBy({ by: ['tipo'], _sum: { importe: true }, _count: { id: true }, where });
        const total = await prisma.gasto.aggregate({ _sum: { importe: true }, _count: { id: true }, where });

        res.json({ status: 'OK', porTipo, total: { importe: total._sum.importe || 0, cantidad: total._count.id || 0 } });
    } catch (err: any) {
        console.error('[GASTOS] Error resumen:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/gastos/fijos
router.get('/fijos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = { activo: true };
        if (req.usuario?.cliente_id) where.cliente_id = req.usuario.cliente_id;
        const gastosFijos = await prisma.gastoFijo.findMany({ where, include: { vehiculo: { select: { matricula: true } } } });
        res.json({ status: 'OK', data: gastosFijos });
    } catch (err: any) {
        console.error('[GASTOS] Error fijos:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// POST /api/gastos/fijos
router.post('/fijos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        const { vehiculo_id, tipo, descripcion, importe, periodicidad } = req.body;
        const gf = await prisma.gastoFijo.create({
            data: { cliente_id: req.usuario.cliente_id, vehiculo_id: vehiculo_id || null, tipo, descripcion, importe, periodicidad },
        });
        res.status(201).json({ status: 'OK', data: gf });
    } catch (err: any) {
        console.error('[GASTOS] Error creando fijo:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
