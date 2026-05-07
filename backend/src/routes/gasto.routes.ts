import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, isSameTenant, AuthRequest } from '../middleware/auth.middleware';

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

        if (vehiculo_id) {
            const v = await prisma.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { cliente_id: true } });
            if (!v || !isSameTenant(req, v.cliente_id)) {
                res.status(404).json({ status: 'FAIL', error: 'vehiculo_not_found' }); return;
            }
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

        if (vehiculo_id) {
            const v = await prisma.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { cliente_id: true } });
            if (!v || !isSameTenant(req, v.cliente_id)) {
                res.status(404).json({ status: 'FAIL', error: 'vehiculo_not_found' }); return;
            }
        }

        const gf = await prisma.gastoFijo.create({
            data: { cliente_id: req.usuario.cliente_id, vehiculo_id: vehiculo_id || null, tipo, descripcion, importe, periodicidad },
        });
        res.status(201).json({ status: 'OK', data: gf });
    } catch (err: any) {
        console.error('[GASTOS] Error creando fijo:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PUT /api/gastos/fijos/:id — Editar gasto fijo (Solo Patrón)
router.put('/fijos/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.es_patron && req.usuario?.role !== 'admin') {
            res.status(403).json({ status: 'FAIL', error: 'forbidden', message: 'Solo el patron puede editar gastos fijos' });
            return;
        }

        const { tipo, descripcion, importe, periodicidad, activo } = req.body;

        const updated = await prisma.$transaction(async (tx) => {
            const current = await tx.gastoFijo.findUnique({ where: { id: req.params.id } });
            if (!current) throw new Error('not_found');
            if (!isSameTenant(req, current.cliente_id)) throw new Error('forbidden');

            const gf = await tx.gastoFijo.update({
                where: { id: req.params.id },
                data: {
                    tipo: tipo || undefined,
                    descripcion: descripcion || undefined,
                    importe: importe !== undefined ? importe : undefined,
                    periodicidad: periodicidad || undefined,
                    activo: activo !== undefined ? activo : undefined,
                }
            });

            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'GASTO_FIJO_ACTUALIZADO',
                    source: 'PILOTOS',
                    dedupe_key: `gf-update-${gf.id}-${Date.now()}`,
                    datos: {
                        gasto_fijo_id: gf.id,
                        cambios: req.body,
                        usuario_id: req.usuario?.id
                    }
                }
            });

            return gf;
        });

        res.json({ status: 'OK', data: updated });
    } catch (err: any) {
        if (err.message === 'not_found') return res.status(404).json({ status: 'FAIL', error: 'not_found' });
        if (err.message === 'forbidden') return res.status(403).json({ status: 'FAIL', error: 'forbidden' });
        console.error('[GASTOS] Error actualizando fijo:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
