/**
 * Parte Diario routes — Motor del sistema PilotOS.
 * R-PD-001: Solo entra por app web. R-PD-017: Inmutable tras envio.
 * DT-007: Calculo separado en calculos_partes.
 * DT-011: Singleton. DT-012: Transacciones.
 *
 * Flujo asalariado (con fotos obligatorias):
 *   1. POST /api/partes con borrador:true → estado BORRADOR
 *   2. POST /api/upload + POST /api/fotos para cada ticket
 *   3. PATCH /api/partes/:id/confirmar → backend valida fotos por rol y pasa a ENVIADO
 *   - Reanudación: GET /api/partes/borrador/actual?vehiculo_id&fecha
 *   - Descarte: DELETE /api/partes/:id (solo si BORRADOR)
 *
 * Flujo patrón (fotos opcionales):
 *   - POST /api/partes sin flag → directo a ENVIADO (compat con frontend antiguo)
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { crearOActualizarCalculo } from '../services/calculo.service';
import { compararDocumentosConParte } from '../services/ocrComparacion.service';

const router = Router();

interface ParteDiarioInput {
    fecha_trabajada: string;
    vehiculo_id: string;
    conductor_id: string;
    km_inicio: number;
    km_fin: number;
    ingreso_bruto: number;
    ingreso_datafono: number;
    combustible?: number;
    varios?: number;
    concepto_varios?: string;
    borrador?: boolean;
}

function validarParte(data: ParteDiarioInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data.fecha_trabajada) errors.push('fecha_trabajada es obligatorio');
    if (!data.vehiculo_id) errors.push('vehiculo_id es obligatorio');
    if (!data.conductor_id) errors.push('conductor_id es obligatorio');
    if (data.km_inicio === undefined) errors.push('km_inicio es obligatorio');
    if (data.km_fin === undefined) errors.push('km_fin es obligatorio');
    if (data.ingreso_bruto === undefined) errors.push('ingreso_bruto es obligatorio');
    if (data.ingreso_datafono === undefined) errors.push('ingreso_datafono es obligatorio');
    if (data.km_fin !== undefined && data.km_inicio !== undefined && data.km_fin <= data.km_inicio) {
        errors.push('km_fin debe ser mayor que km_inicio (R-PD-013)');
    }
    if (data.ingreso_bruto !== undefined && data.ingreso_datafono !== undefined && data.ingreso_bruto < data.ingreso_datafono) {
        errors.push('ingreso_bruto debe ser >= ingreso_datafono (R-PD-014)');
    }
    if (data.varios && data.varios > 0 && !data.concepto_varios) {
        errors.push('concepto_varios es obligatorio si varios > 0');
    }
    return { valid: errors.length === 0, errors };
}

// POST /api/partes — Crear parte diario (BORRADOR o ENVIADO)
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const data: ParteDiarioInput = req.body;
        const validation = validarParte(data);
        if (!validation.valid) {
            res.status(400).json({ status: 'FAIL', error: 'validation_failed', detalles: validation.errors });
            return;
        }

        const fechaDate = new Date(data.fecha_trabajada);
        const esBorrador = data.borrador === true;
        const estadoFinal = esBorrador ? 'BORRADOR' : 'ENVIADO';

        // R-PD-016: Solo un parte por vehiculo y dia
        const existente = await prisma.parteDiario.findUnique({
            where: { vehiculo_id_fecha_trabajada: { vehiculo_id: data.vehiculo_id, fecha_trabajada: fechaDate } },
        });

        // Si existe un BORRADOR del mismo conductor para ese vehículo+fecha, lo actualizamos.
        // El asalariado puede entonces reintentar sin quedar bloqueado por unique constraint.
        if (existente) {
            if (existente.estado === 'BORRADOR' && existente.conductor_id === data.conductor_id) {
                const actualizado = await prisma.parteDiario.update({
                    where: { id: existente.id },
                    data: {
                        km_inicio: data.km_inicio,
                        km_fin: data.km_fin,
                        ingreso_bruto: data.ingreso_bruto,
                        ingreso_datafono: data.ingreso_datafono,
                        combustible: data.combustible ?? null,
                        varios: data.varios ?? null,
                        concepto_varios: data.concepto_varios ?? null,
                        estado: esBorrador ? 'BORRADOR' : 'ENVIADO',
                    },
                });
                if (!esBorrador) {
                    // promover de BORRADOR existente directamente (caso patrón)
                    await actualizarKmYLedger(actualizado.id, data, req.usuario?.cliente_id);
                }
                res.status(200).json({ status: 'OK', data: actualizado, evento: esBorrador ? 'E-PD-000' : 'E-PD-001' });
                return;
            }
            res.status(409).json({ status: 'FAIL', error: 'duplicate_parte', regla: 'R-PD-016' });
            return;
        }

        // Crear parte (BORRADOR no actualiza km ni crea evento todavía).
        if (esBorrador) {
            const parte = await prisma.parteDiario.create({
                data: {
                    fecha_trabajada: fechaDate,
                    vehiculo_id: data.vehiculo_id,
                    conductor_id: data.conductor_id,
                    km_inicio: data.km_inicio,
                    km_fin: data.km_fin,
                    ingreso_bruto: data.ingreso_bruto,
                    ingreso_datafono: data.ingreso_datafono,
                    combustible: data.combustible ?? null,
                    varios: data.varios ?? null,
                    concepto_varios: data.concepto_varios ?? null,
                    estado: 'BORRADOR',
                },
            });
            res.status(201).json({ status: 'OK', data: parte, evento: 'E-PD-000' });
            return;
        }

        // Flujo directo a ENVIADO (patrón o cliente legacy).
        const result = await prisma.$transaction(async (tx) => {
            const parte = await tx.parteDiario.create({
                data: {
                    fecha_trabajada: fechaDate,
                    vehiculo_id: data.vehiculo_id,
                    conductor_id: data.conductor_id,
                    km_inicio: data.km_inicio,
                    km_fin: data.km_fin,
                    ingreso_bruto: data.ingreso_bruto,
                    ingreso_datafono: data.ingreso_datafono,
                    combustible: data.combustible ?? null,
                    varios: data.varios ?? null,
                    concepto_varios: data.concepto_varios ?? null,
                    estado: estadoFinal,
                },
            });
            await tx.vehiculo.update({ where: { id: data.vehiculo_id }, data: { km_actuales: data.km_fin } });
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_ENVIADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-${parte.id}`,
                    datos: { parte_id: parte.id, conductor_id: data.conductor_id, vehiculo_id: data.vehiculo_id },
                },
            });
            return parte;
        });

        try {
            if (req.usuario?.cliente_id) {
                await crearOActualizarCalculo({ parte_diario_id: result.id, cliente_id: req.usuario.cliente_id });
            }
        } catch (calcErr: any) {
            console.warn('[PARTES] Calculo de reparto fallido (no bloquea parte):', calcErr.message);
        }

        res.status(201).json({ status: 'OK', data: result, evento: 'E-PD-001' });
    } catch (err: any) {
        console.error('[PARTES] Error creando parte:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

async function actualizarKmYLedger(parteId: string, data: ParteDiarioInput, cliente_id?: string) {
    await prisma.$transaction(async (tx) => {
        await tx.vehiculo.update({ where: { id: data.vehiculo_id }, data: { km_actuales: data.km_fin } });
        await tx.ledgerEvento.create({
            data: {
                tipo_evento: 'PARTE_ENVIADO',
                source: 'PILOTOS',
                dedupe_key: `parte-${parteId}`,
                datos: { parte_id: parteId, conductor_id: data.conductor_id, vehiculo_id: data.vehiculo_id },
            },
        });
    });
    if (cliente_id) {
        try {
            await crearOActualizarCalculo({ parte_diario_id: parteId, cliente_id });
        } catch (calcErr: any) {
            console.warn('[PARTES] Calculo de reparto fallido (no bloquea parte):', calcErr.message);
        }
    }
}

// GET /api/partes/borrador/actual?vehiculo_id=&fecha=YYYY-MM-DD
// Devuelve el BORRADOR del usuario para ese vehículo y fecha si existe (reanudación).
router.get('/borrador/actual', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { vehiculo_id, fecha } = req.query;
        if (!vehiculo_id || !fecha) {
            res.status(400).json({ status: 'FAIL', error: 'missing_params' });
            return;
        }
        const conductor_id = req.usuario?.conductor_id;
        if (!conductor_id) {
            res.status(403).json({ status: 'FAIL', error: 'no_conductor_context' });
            return;
        }
        const parte = await prisma.parteDiario.findUnique({
            where: { vehiculo_id_fecha_trabajada: { vehiculo_id: String(vehiculo_id), fecha_trabajada: new Date(String(fecha)) } },
            include: { documentos: { include: { documento: true } } },
        });
        if (!parte || parte.estado !== 'BORRADOR' || parte.conductor_id !== conductor_id) {
            res.json({ status: 'OK', data: null });
            return;
        }
        res.json({ status: 'OK', data: parte });
    } catch (err: any) {
        console.error('[PARTES] Error borrador/actual:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PATCH /api/partes/:id/confirmar — Asalariado confirma BORRADOR. Backend valida fotos.
router.patch('/:id/confirmar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const parte = await prisma.parteDiario.findUnique({
            where: { id: req.params.id },
            include: { documentos: { include: { documento: true } } },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        if (parte.conductor_id !== req.usuario?.conductor_id) {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }
        if (parte.estado !== 'BORRADOR') {
            res.status(409).json({ status: 'FAIL', error: 'invalid_state', estado_actual: parte.estado });
            return;
        }

        // Reglas de fotos por rol (no se modifica la regla de negocio):
        //   - Patrón (es_patron === true): puede confirmar sin fotos.
        //   - Asalariado: requiere TICKET_TAXIMETRO siempre.
        //                 Si combustible > 0, requiere al menos un TICKET_GASOIL/TICKET_COMBUSTIBLE.
        const esPatron = req.usuario?.es_patron === true;
        if (!esPatron) {
            const tieneTaxi = parte.documentos.some((e) => e.documento.tipo === 'TICKET_TAXIMETRO');
            if (!tieneTaxi) {
                res.status(400).json({ status: 'FAIL', error: 'falta_taximetro', message: 'Falta el ticket del taxímetro' });
                return;
            }
            const combustible = parte.combustible ? Number(parte.combustible) : 0;
            if (combustible > 0) {
                const tieneGasoil = parte.documentos.some((e) =>
                    e.documento.tipo === 'TICKET_GASOIL' || e.documento.tipo === 'TICKET_COMBUSTIBLE'
                );
                if (!tieneGasoil) {
                    res.status(400).json({ status: 'FAIL', error: 'falta_gasoil', message: 'Falta el ticket del combustible' });
                    return;
                }
            }
        }

        // Promover a ENVIADO + actualizar km + ledger
        const updated = await prisma.$transaction(async (tx) => {
            const p = await tx.parteDiario.update({
                where: { id: parte.id },
                data: { estado: 'ENVIADO' },
            });
            await tx.vehiculo.update({ where: { id: p.vehiculo_id }, data: { km_actuales: p.km_fin } });
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_ENVIADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-${p.id}`,
                    datos: { parte_id: p.id, conductor_id: p.conductor_id, vehiculo_id: p.vehiculo_id },
                },
            });
            return p;
        });

        try {
            if (req.usuario?.cliente_id) {
                await crearOActualizarCalculo({ parte_diario_id: updated.id, cliente_id: req.usuario.cliente_id });
            }
        } catch (calcErr: any) {
            console.warn('[PARTES] Calculo de reparto fallido (no bloquea parte):', calcErr.message);
        }

        // Comparación OCR vs declarado (no bloquea, solo registra anomalías si hay desviación).
        try {
            await compararDocumentosConParte(updated.id);
        } catch (e: any) {
            console.warn('[PARTES] Comparación OCR fallida (no bloquea parte):', e.message);
        }

        res.status(200).json({ status: 'OK', data: updated, evento: 'E-PD-001' });
    } catch (err: any) {
        console.error('[PARTES] Error confirmando parte:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// DELETE /api/partes/:id — Solo permitido si estado BORRADOR (descarte controlado).
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const parte = await prisma.parteDiario.findUnique({
            where: { id: req.params.id },
            include: { documentos: true },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        if (parte.estado !== 'BORRADOR') {
            res.status(409).json({ status: 'FAIL', error: 'invalid_state', regla: 'R-PD-017' });
            return;
        }
        if (parte.conductor_id !== req.usuario?.conductor_id && req.usuario?.role !== 'admin') {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }

        await prisma.$transaction(async (tx) => {
            // Eliminar enlaces (no eliminamos los Documento por si están referenciados en otra parte;
            // los hashes quedan disponibles para deduplicación posterior).
            await tx.documentoEnlace.deleteMany({
                where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: parte.id },
            });
            await tx.parteDiario.delete({ where: { id: parte.id } });
        });

        res.json({ status: 'OK' });
    } catch (err: any) {
        console.error('[PARTES] Error borrando borrador:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/partes — Listar partes (filtrado por tenant)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { vehiculo_id, conductor_id, desde, hasta, incluir_borrador } = req.query;
        const where: any = {};

        if (req.usuario?.cliente_id) {
            where.vehiculo = { cliente_id: req.usuario.cliente_id };
        }
        if (vehiculo_id) where.vehiculo_id = vehiculo_id;
        if (conductor_id) where.conductor_id = conductor_id;
        if (desde || hasta) {
            where.fecha_trabajada = {};
            if (desde) where.fecha_trabajada.gte = new Date(desde as string);
            if (hasta) where.fecha_trabajada.lte = new Date(hasta as string);
        }
        // Por defecto se excluyen los BORRADOR del listado general.
        if (incluir_borrador !== 'true') {
            where.estado = { in: ['ENVIADO', 'FOTO_SUSTITUIDA'] };
        }

        const partes = await prisma.parteDiario.findMany({
            where,
            include: {
                vehiculo: { select: { id: true, matricula: true, marca: true, modelo: true } },
                conductor: { include: { usuario: { select: { nombre: true } } } },
                calculo: true,
                documentos: { include: { documento: true } },
            },
            orderBy: { fecha_trabajada: 'desc' },
        });

        res.json({ status: 'OK', data: partes });
    } catch (err: any) {
        console.error('[PARTES] Error listando:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/partes/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const parte = await prisma.parteDiario.findUnique({
            where: { id: req.params.id },
            include: {
                vehiculo: true,
                conductor: { include: { usuario: { select: { nombre: true, telefono: true } } } },
                calculo: true,
                documentos: { include: { documento: true } },
                incidencias: true,
            },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        res.json({ status: 'OK', data: parte });
    } catch (err: any) {
        console.error('[PARTES] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PATCH /api/partes/:id/estado — Solo permite FOTO_SUSTITUIDA (R-PD-017)
router.patch('/:id/estado', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { estado } = req.body;
        if (estado !== 'FOTO_SUSTITUIDA') {
            res.status(400).json({ status: 'FAIL', error: 'invalid_state', regla: 'R-PD-017' });
            return;
        }
        const parte = await prisma.parteDiario.update({ where: { id: req.params.id }, data: { estado } });
        res.json({ status: 'OK', data: parte });
    } catch (err: any) {
        console.error('[PARTES] Error actualizando estado:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
