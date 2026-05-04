import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/catalogo', async (_req: any, res: Response) => {
    try {
        const catalogo = await prisma.mantenimientoCatalogo.findMany({ where: { activo: true }, orderBy: { tipo: 'asc' } });
        res.json({ status: 'OK', data: catalogo });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

router.get('/vehiculo/:vehiculoId', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { soloActivos } = req.query;
        const where: any = { vehiculo_id: req.params.vehiculoId };
        if (soloActivos === 'true') {
            where.OR = [{ ultima_ejecucion_km: { not: null } }, { estado: { in: ['PENDIENTE', 'VENCIDO'] } }];
        }
        const mantenimientos = await prisma.mantenimientoVehiculo.findMany({ where, include: { catalogo: true }, orderBy: { estado: 'asc' } });
        res.json({ status: 'OK', data: mantenimientos });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

router.get('/vehiculo/:vehiculoId/proximos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const vehiculo = await prisma.vehiculo.findUnique({ where: { id: req.params.vehiculoId } });
        if (!vehiculo) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }

        const kmUmbral = vehiculo.km_actuales + 1000;
        const fechaUmbral = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const proximos = await prisma.mantenimientoVehiculo.findMany({
            where: { vehiculo_id: req.params.vehiculoId, activo: true, OR: [{ proximo_km: { lte: kmUmbral } }, { proxima_fecha: { lte: fechaUmbral } }], estado: { not: 'RESUELTO' } },
            include: { catalogo: true },
        });
        res.json({ status: 'OK', data: proximos, km_actuales: vehiculo.km_actuales });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

// POST /api/mantenimientos/:id/resolver — Resolver mantenimiento (DT-012: transaccion)
router.post('/:id/resolver', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { km_ejecucion, fecha_factura, url_factura, importe } = req.body;
        const mant = await prisma.mantenimientoVehiculo.findUnique({ where: { id: req.params.id }, include: { catalogo: true, vehiculo: true } });
        if (!mant) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }

        const km = km_ejecucion || mant.vehiculo.km_actuales;
        const frecKm = mant.frecuencia_km_personalizada || mant.frecuencia_aprendida || mant.catalogo.frecuencia_km;
        const frecMeses = mant.frecuencia_meses_personalizada || mant.catalogo.frecuencia_meses;

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.mantenimientoVehiculo.update({
                where: { id: req.params.id },
                data: {
                    ultima_ejecucion_km: km,
                    ultima_ejecucion_fecha: fecha_factura ? new Date(fecha_factura) : new Date(),
                    proximo_km: frecKm ? km + frecKm : null,
                    proxima_fecha: frecMeses ? new Date(Date.now() + frecMeses * 30 * 24 * 60 * 60 * 1000) : null,
                    estado: 'RESUELTO',
                },
            });

            // Seguimiento
            await tx.seguimientoMantenimiento.create({
                data: { mantenimiento_vehiculo_id: mant.id, accion: 'RESUELTO', detalle: mant.catalogo.nombre, km_en_momento: km },
            });

            // Gasto si hay factura
            if (url_factura && req.usuario?.cliente_id) {
                await tx.gasto.create({
                    data: { cliente_id: req.usuario.cliente_id, vehiculo_id: mant.vehiculo_id, tipo: 'MANTENIMIENTO', descripcion: mant.catalogo.nombre, importe: importe || 0, fecha: new Date(), url_factura },
                });
            }

            return updated;
        });

        res.json({ status: 'OK', data: result, evento: 'E-MT-003' });
    } catch (err: any) {
        console.error('[MANTENIMIENTO] Error resolviendo:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.post('/:id/aprender', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { frecuencia_aprendida } = req.body;
        const updated = await prisma.$transaction(async (tx) => {
            const m = await tx.mantenimientoVehiculo.update({ where: { id: req.params.id }, data: { frecuencia_aprendida } });
            await tx.seguimientoMantenimiento.create({
                data: { mantenimiento_vehiculo_id: req.params.id, accion: 'FRECUENCIA_ACTUALIZADA', detalle: `Nueva frecuencia: ${frecuencia_aprendida} km` },
            });
            return m;
        });
        res.json({ status: 'OK', data: updated, evento: 'E-MT-004' });
    } catch (err: any) { res.status(500).json({ status: 'FAIL', error: 'server_error' }); }
});

// PUT /api/mantenimientos/:id — Editar configuración de mantenimiento (Solo Patrón)
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.es_patron && req.usuario?.role !== 'admin') {
            res.status(403).json({ status: 'FAIL', error: 'forbidden', message: 'Solo el patron puede editar mantenimientos' });
            return;
        }

        const {
            activo,
            frecuencia_km_personalizada,
            frecuencia_meses_personalizada,
            proximo_km,
            proxima_fecha,
            ultima_ejecucion_km,
            ultima_ejecucion_fecha
        } = req.body;

        const updated = await prisma.$transaction(async (tx) => {
            const current = await tx.mantenimientoVehiculo.findUnique({ 
                where: { id: req.params.id },
                include: { catalogo: true }
            });
            if (!current) throw new Error('not_found');

            let newProximoKm = proximo_km !== undefined ? proximo_km : undefined;
            let newProximaFecha = proxima_fecha !== undefined ? (proxima_fecha ? new Date(proxima_fecha) : null) : undefined;

            // Recalcular Km si cambia frecuencia o última ejecución y NO se manda próximo km explícito
            if (proximo_km === undefined && (frecuencia_km_personalizada !== undefined || ultima_ejecucion_km !== undefined)) {
                const uKm = ultima_ejecucion_km !== undefined ? ultima_ejecucion_km : current.ultima_ejecucion_km;
                const fKm = frecuencia_km_personalizada !== undefined ? frecuencia_km_personalizada : 
                           (current.frecuencia_km_personalizada || current.frecuencia_aprendida || current.catalogo.frecuencia_km);
                
                if (uKm != null && fKm != null) {
                    newProximoKm = uKm + fKm;
                }
            }

            // Recalcular Fecha si cambia frecuencia o última ejecución y NO se manda próxima fecha explícita
            if (proxima_fecha === undefined && (frecuencia_meses_personalizada !== undefined || ultima_ejecucion_fecha !== undefined)) {
                const uFecha = ultima_ejecucion_fecha !== undefined ? (ultima_ejecucion_fecha ? new Date(ultima_ejecucion_fecha) : null) : current.ultima_ejecucion_fecha;
                const fMeses = frecuencia_meses_personalizada !== undefined ? frecuencia_meses_personalizada : 
                              (current.frecuencia_meses_personalizada || current.catalogo.frecuencia_meses);
                
                if (uFecha != null && fMeses != null) {
                    const d = new Date(uFecha);
                    d.setMonth(d.getMonth() + fMeses);
                    newProximaFecha = d;
                }
            }

            const m = await tx.mantenimientoVehiculo.update({
                where: { id: req.params.id },
                data: {
                    activo: activo !== undefined ? activo : undefined,
                    frecuencia_km_personalizada: frecuencia_km_personalizada !== undefined ? frecuencia_km_personalizada : undefined,
                    frecuencia_meses_personalizada: frecuencia_meses_personalizada !== undefined ? frecuencia_meses_personalizada : undefined,
                    proximo_km: newProximoKm,
                    proxima_fecha: newProximaFecha,
                    ultima_ejecucion_km: ultima_ejecucion_km !== undefined ? ultima_ejecucion_km : undefined,
                    ultima_ejecucion_fecha: ultima_ejecucion_fecha ? new Date(ultima_ejecucion_fecha) : undefined,
                }
            });

            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'MANTENIMIENTO_ACTUALIZADO',
                    source: 'PILOTOS',
                    dedupe_key: `mant-update-${m.id}-${Date.now()}`,
                    datos: {
                        mantenimiento_id: m.id,
                        cambios: req.body,
                        usuario_id: req.usuario?.id
                    }
                }
            });

            return m;
        });

        res.json({ status: 'OK', data: updated });
    } catch (err: any) {
        if (err.message === 'not_found') return res.status(404).json({ status: 'FAIL', error: 'not_found' });
        console.error('[MANTENIMIENTO] Error actualizando:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
