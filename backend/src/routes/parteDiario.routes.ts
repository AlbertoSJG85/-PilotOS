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
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatron, isSameTenant, AuthRequest } from '../middleware/auth.middleware';
import { crearOActualizarCalculo } from '../services/calculo.service';
import { compararDocumentosConParte } from '../services/ocrComparacion.service';
import { aplicarRetencion, ESTADO_RETENIDO, ESTADOS_ENVIADOS } from '../services/retencionParte.service';

const router = Router();

/**
 * Actualiza vehiculo.km_actuales SOLO si el km_fin del parte es mayor que el
 * km oficial actual. Fase 5 (2026-07-24): antes se sobrescribia siempre con
 * `km_actuales: data.km_fin`, sin comparar. Si hoy se registraba un parte
 * ATRASADO (de una fecha anterior, con km inferiores a los ya registrados
 * despues), el kilometraje oficial del vehiculo RETROCEDIA — lo que rompe
 * los avisos de mantenimiento por km y cualquier calculo que dependa de un
 * contador siempre creciente.
 *
 * Si el km del parte es menor o igual al oficial, no se toca km_actuales y
 * se registra una Anomalia (R-AN-001: se acumulan, nunca se resetean) para
 * que el patron pueda revisar el caso — puede ser un parte atrasado legitimo
 * o un error de tecleo.
 */
export async function actualizarKmSiAvanza(
    tx: Prisma.TransactionClient,
    vehiculo_id: string,
    km_fin: number,
    parte_diario_id: string,
    conductor_id: string,
): Promise<void> {
    const vehiculo = await tx.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { km_actuales: true } });
    if (!vehiculo) return;

    if (km_fin > vehiculo.km_actuales) {
        await tx.vehiculo.update({ where: { id: vehiculo_id }, data: { km_actuales: km_fin } });
        return;
    }

    if (km_fin < vehiculo.km_actuales) {
        await tx.anomalia.create({
            data: {
                conductor_id,
                parte_diario_id,
                tipo: 'KM_RETROCESO',
                descripcion: `Parte ${parte_diario_id} registra km_fin=${km_fin}, inferior al km oficial actual del vehiculo (${vehiculo.km_actuales}). No se ha actualizado el kilometraje maestro.`,
            },
        });
    }
    // km_fin === km_actuales: sin cambio, sin anomalia (parte del mismo punto exacto).
}

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

        // Validar que vehiculo y conductor pertenecen al tenant del usuario
        if (req.usuario?.role !== 'admin') {
            const vehiculo = await prisma.vehiculo.findUnique({ where: { id: data.vehiculo_id }, select: { cliente_id: true } });
            if (!vehiculo || !isSameTenant(req, vehiculo.cliente_id)) {
                res.status(404).json({ status: 'FAIL', error: 'vehiculo_not_found' }); return;
            }
            const conductor = await prisma.conductor.findUnique({ where: { id: data.conductor_id }, select: { cliente_id: true } });
            if (!conductor || !isSameTenant(req, conductor.cliente_id)) {
                res.status(404).json({ status: 'FAIL', error: 'conductor_not_found' }); return;
            }
            // Asalariado solo puede crear partes con su propio conductor_id
            if (!req.usuario?.es_patron && req.usuario?.conductor_id !== data.conductor_id) {
                res.status(403).json({ status: 'FAIL', error: 'forbidden' }); return;
            }
        }

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
            res.status(409).json({
                status: 'FAIL',
                error: 'duplicate_parte',
                regla: 'R-PD-016',
                parte_id: existente.id,
                estado: existente.estado,
                fecha_trabajada: existente.fecha_trabajada,
                vehiculo_id: existente.vehiculo_id
            });
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
            await actualizarKmSiAvanza(tx, data.vehiculo_id, data.km_fin, parte.id, data.conductor_id);
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_ENVIADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-${parte.id}`,
                    datos: { parte_id: parte.id, conductor_id: data.conductor_id, vehiculo_id: data.vehiculo_id },
                },
            });

            // Fase 4 (2026-07-24): el calculo de reparto se ejecuta DENTRO de
            // la misma transaccion que crea el parte. Antes se llamaba fuera,
            // envuelto en un try/catch que solo avisaba por consola: un parte
            // podia quedar ENVIADO sin ningun CalculoParte asociado si fallaba
            // (p.ej. sin ConfiguracionEconomica vigente), y dashboards/cierres
            // lo trataban con el fallback "todo el bruto al patron". Ahora, si
            // el calculo falla, el parte tampoco se crea: se rechaza la
            // peticion con un error claro en vez de aceptar datos incompletos.
            if (req.usuario?.cliente_id) {
                await crearOActualizarCalculo({ parte_diario_id: parte.id, cliente_id: req.usuario.cliente_id }, tx);
            }

            return parte;
        });

        res.status(201).json({ status: 'OK', data: result, evento: 'E-PD-001' });
    } catch (err: any) {
        console.error('[PARTES] Error creando parte:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

async function actualizarKmYLedger(parteId: string, data: ParteDiarioInput, cliente_id?: string) {
    await prisma.$transaction(async (tx) => {
        await actualizarKmSiAvanza(tx, data.vehiculo_id, data.km_fin, parteId, data.conductor_id);
        await tx.ledgerEvento.create({
            data: {
                tipo_evento: 'PARTE_ENVIADO',
                source: 'PILOTOS',
                dedupe_key: `parte-${parteId}`,
                datos: { parte_id: parteId, conductor_id: data.conductor_id, vehiculo_id: data.vehiculo_id },
            },
        });
        // Fase 4 (2026-07-24): calculo dentro de la misma transaccion (ver
        // comentario equivalente en POST / mas arriba).
        if (cliente_id) {
            await crearOActualizarCalculo({ parte_diario_id: parteId, cliente_id }, tx);
        }
    });
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

        // Promover a ENVIADO + actualizar km + ledger + calculo (Fase 4,
        // 2026-07-24: el calculo ya no se dispara en segundo plano tras la
        // transaccion. Antes, si fallaba —p.ej. sin ConfiguracionEconomica—,
        // el parte quedaba ENVIADO sin CalculoParte, y el warning solo se veia
        // en logs; dashboards/cierres lo trataban con el fallback "todo el
        // bruto al patron" sin que nadie se enterara. Ahora forma parte de la
        // misma transaccion: si el calculo falla, la confirmacion tambien.
        const updated = await prisma.$transaction(async (tx) => {
            const p = await tx.parteDiario.update({
                where: { id: parte.id },
                data: { estado: 'ENVIADO' },
            });
            await actualizarKmSiAvanza(tx, p.vehiculo_id, p.km_fin, p.id, p.conductor_id);
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_ENVIADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-${p.id}`,
                    datos: { parte_id: p.id, conductor_id: p.conductor_id, vehiculo_id: p.vehiculo_id },
                },
            });
            if (req.usuario?.cliente_id) {
                await crearOActualizarCalculo({ parte_diario_id: p.id, cliente_id: req.usuario.cliente_id }, tx);
            }
            return p;
        });

        // Comparación parte↔ticket: queremos sus resultados en la respuesta para
        // que el frontend pueda avisar al usuario tras confirmar. Es solo lectura
        // + un puñado de UPDATEs, no es lento.
        let resumenComparacion = { total_discrepancias: 0 };
        let retenido = false;
        try {
            const r = await compararDocumentosConParte(updated.id);
            resumenComparacion = { total_discrepancias: r.total_discrepancias };
            // Con discrepancias, el parte NO entra en los globales hasta que
            // el dueño lo mire (2026-08-12). El asalariado se entera aquí
            // mismo: la respuesta se lo dice para poder avisarle en pantalla.
            retenido = (await aplicarRetencion(updated.id, r.total_discrepancias)) === 'RETENIDO';
        } catch (e: any) {
            console.warn('[PARTES] Comparación OCR fallida:', e.message);
        }

        res.status(200).json({
            status: 'OK',
            data: retenido ? { ...updated, estado: ESTADO_RETENIDO } : updated,
            discrepancias: resumenComparacion.total_discrepancias,
            retenido,
            evento: 'E-PD-001',
        });
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
            include: {
                documentos: true,
                vehiculo: { select: { cliente_id: true } },
            },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        if (parte.estado !== 'BORRADOR') {
            res.status(409).json({ status: 'FAIL', error: 'invalid_state', regla: 'R-PD-017' });
            return;
        }
        // Tenancy: conductor can only delete own draft; patron/admin can delete any in their tenant.
        const esCondutor = parte.conductor_id === req.usuario?.conductor_id;
        const esMismoCliente = req.usuario?.cliente_id && parte.vehiculo?.cliente_id === req.usuario.cliente_id;
        const esAdmin = req.usuario?.role === 'admin';
        if (!esCondutor && !esMismoCliente && !esAdmin) {
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

// ─────────────────────────────────────────────────────────
// Decisión del dueño sobre un parte retenido (2026-08-12)
//
// Un parte con discrepancias queda en PENDIENTE_VALIDACION y no cuenta en
// los globales. El dueño tiene exactamente dos salidas, y las dos son suyas:
// nadie más puede cerrar el caso, y menos el asalariado sobre sí mismo.
// ─────────────────────────────────────────────────────────

/** Carga un parte retenido comprobando tenencia. Devuelve null si no procede. */
async function cargarParteRetenido(req: AuthRequest, res: Response) {
    const parte = await prisma.parteDiario.findUnique({
        where: { id: req.params.id },
        include: { vehiculo: { select: { cliente_id: true, id: true } } },
    });
    if (!parte || !isSameTenant(req, parte.vehiculo.cliente_id)) {
        res.status(404).json({ status: 'FAIL', error: 'not_found' });
        return null;
    }
    if (parte.estado !== ESTADO_RETENIDO) {
        res.status(409).json({ status: 'FAIL', error: 'invalid_state', estado_actual: parte.estado });
        return null;
    }
    return parte;
}

// POST /api/partes/:id/validar — el dueño acepta el parte tal cual está.
// Ha hablado con el asalariado (o ha decidido que la diferencia es asumible)
// y el parte pasa a contar en los globales. Las anomalías se marcan revisadas
// pero NO se borran: son un hecho ocurrido (R-AN-002).
router.post('/:id/validar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const parte = await cargarParteRetenido(req, res);
        if (!parte) return;

        const actualizado = await prisma.$transaction(async (tx) => {
            const p = await tx.parteDiario.update({
                where: { id: parte.id },
                data: { estado: 'ENVIADO', validado_por: req.usuario!.id, validado_at: new Date() },
            });
            await tx.anomalia.updateMany({
                where: { parte_diario_id: parte.id, estado: 'ACTIVA' },
                data: { estado: 'RESUELTA', revisada_at: new Date(), revisada_por: req.usuario!.id },
            });
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_VALIDADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-validado-${parte.id}`,
                    datos: { parte_id: parte.id, validado_por: req.usuario!.id },
                },
            });
            return p;
        });

        res.json({ status: 'OK', data: actualizado });
    } catch (err: any) {
        console.error('[PARTES] Error validando parte:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// POST /api/partes/:id/rehacer — el dueño lo rechaza: el parte y sus tickets
// desaparecen para que el asalariado registre ese día otra vez desde cero.
//
// Se borra de verdad (no se archiva) porque el asalariado tiene que poder
// volver a crear el parte de esa fecha, y hay un unique (vehiculo, fecha).
// Lo que NO se borra:
//   - las anomalías, que son el histórico de lo que pasó (R-AN-002);
//   - el evento de ledger, que deja constancia con una copia de las cifras
//     que traía el parte rechazado.
// El kilometraje del vehículo se recalcula desde los partes que quedan: si
// el rechazado era el que lo había subido, el contador tiene que volver
// atrás o el parte nuevo arrancaría con unos km que nadie ha recorrido.
router.post('/:id/rehacer', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const parte = await cargarParteRetenido(req, res);
        if (!parte) return;
        const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.slice(0, 500) : null;

        await prisma.$transaction(async (tx) => {
            const enlaces = await tx.documentoEnlace.findMany({
                where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: parte.id },
                select: { documento_id: true },
            });
            const documentoIds = enlaces.map((e) => e.documento_id);

            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'PARTE_RECHAZADO',
                    source: 'PILOTOS',
                    dedupe_key: `parte-rechazado-${parte.id}`,
                    datos: {
                        parte_id: parte.id,
                        rechazado_por: req.usuario!.id,
                        motivo,
                        // Copia de lo que traía, porque la fila se va a borrar.
                        snapshot: {
                            fecha_trabajada: parte.fecha_trabajada.toISOString().slice(0, 10),
                            vehiculo_id: parte.vehiculo_id,
                            conductor_id: parte.conductor_id,
                            km_inicio: parte.km_inicio,
                            km_fin: parte.km_fin,
                            ingreso_bruto: String(parte.ingreso_bruto),
                            ingreso_datafono: String(parte.ingreso_datafono),
                            combustible: parte.combustible ? String(parte.combustible) : null,
                            documentos: documentoIds,
                        },
                    },
                },
            });

            await tx.anomalia.updateMany({
                where: { parte_diario_id: parte.id },
                data: { estado: 'RESUELTA', revisada_at: new Date(), revisada_por: req.usuario!.id },
            });

            await tx.calculoParte.deleteMany({ where: { parte_diario_id: parte.id } });
            await tx.documentoEnlace.deleteMany({ where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: parte.id } });
            if (documentoIds.length > 0) {
                await tx.documento.deleteMany({ where: { id: { in: documentoIds } } });
            }
            await tx.parteDiario.delete({ where: { id: parte.id } });

            // Kilometraje oficial: el máximo de los partes que sobreviven.
            const restantes = await tx.parteDiario.findMany({
                where: { vehiculo_id: parte.vehiculo_id, estado: { in: [...ESTADOS_ENVIADOS] } },
                select: { km_fin: true },
                orderBy: { km_fin: 'desc' },
                take: 1,
            });
            if (restantes.length > 0) {
                await tx.vehiculo.update({
                    where: { id: parte.vehiculo_id },
                    data: { km_actuales: restantes[0].km_fin },
                });
            }
        });

        res.json({ status: 'OK', rehecho: true, parte_id: parte.id });
    } catch (err: any) {
        console.error('[PARTES] Error rechazando parte:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/partes — Listar partes (filtrado por tenant)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { vehiculo_id, conductor_id, desde, hasta, incluir_borrador } = req.query;
        const where: any = {};

        // Fase 2 (seguridad): deny-by-default. Antes, un usuario sin cliente_id
        // (minos user sin contexto PilotOS) no recibia filtro alguno y veia
        // partes de TODOS los clientes.
        if (req.usuario?.role !== 'admin') {
            if (!req.usuario?.cliente_id) {
                res.status(403).json({ status: 'FAIL', error: 'no_client_context' });
                return;
            }
            where.vehiculo = { cliente_id: req.usuario.cliente_id };
        }
        if (vehiculo_id) where.vehiculo_id = vehiculo_id;
        if (conductor_id) where.conductor_id = conductor_id;
        if (desde || hasta) {
            where.fecha_trabajada = {};
            if (desde) where.fecha_trabajada.gte = new Date(desde as string);
            if (hasta) where.fecha_trabajada.lte = new Date(hasta as string);
        }
        // Por defecto se excluyen los BORRADOR del listado general. Los
        // retenidos SÍ se listan: no cuentan en los globales, pero el dueño y
        // el asalariado tienen que verlos — es justo lo que hay que atender.
        if (incluir_borrador !== 'true') {
            where.estado = { in: [...ESTADOS_ENVIADOS] };
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

        // Tenancy: admin can see all; others must belong to the same cliente.
        // Fase 2 (seguridad): la guarda original solo comprobaba la tenencia
        // cuando el usuario SI tenia cliente_id; si no lo tenia, el chequeo se
        // saltaba por completo y cualquier parte era visible (IDOR). Ahora, sin
        // cliente_id y sin ser admin, se deniega directamente.
        if (req.usuario?.role !== 'admin') {
            if (!req.usuario?.cliente_id || parte.vehiculo?.cliente_id !== req.usuario.cliente_id) {
                res.status(403).json({ status: 'FAIL', error: 'forbidden' });
                return;
            }
        }

        // Anomalias linked to this parte (fetched separately since the FK is a soft reference)
        const anomalias = await prisma.anomalia.findMany({
            where: { parte_diario_id: parte.id },
            orderBy: { created_at: 'desc' },
        });

        // Un asalariado ve QUE su parte no cuadra, pero no QUÉ (2026-08-12,
        // decisión de Alberto). Si supiera el hueco exacto —"el ticket dice
        // 148,60 € y declaraste 95 €"— tendría la medida justa de la historia
        // que le toca contar. El detalle es del dueño, que es quien va a
        // hablar con él.
        //
        // Se filtra AQUÍ y no solo en la pantalla: ocultarlo en el frontend
        // dejaría el dato viajando en la respuesta, a un inspector de vista.
        if (!req.usuario?.es_patron && req.usuario?.role !== 'admin') {
            const documentosSinDetalle = parte.documentos.map((enlace) => {
                const datos = enlace.documento.ocr_datos_extraidos as Record<string, unknown> | null;
                if (!datos || typeof datos !== 'object') return enlace;
                const { discrepancias, ...resto } = datos;
                return { ...enlace, documento: { ...enlace.documento, ocr_datos_extraidos: resto } };
            });
            res.json({ status: 'OK', data: { ...parte, documentos: documentosSinDetalle, anomalias: [] } });
            return;
        }

        res.json({ status: 'OK', data: { ...parte, anomalias } });
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
        const parteCheck = await prisma.parteDiario.findUnique({
            where: { id: req.params.id },
            include: { vehiculo: { select: { cliente_id: true } } },
        });
        if (!parteCheck || !isSameTenant(req, parteCheck.vehiculo?.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        const parte = await prisma.parteDiario.update({ where: { id: req.params.id }, data: { estado } });
        res.json({ status: 'OK', data: parte });
    } catch (err: any) {
        console.error('[PARTES] Error actualizando estado:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
