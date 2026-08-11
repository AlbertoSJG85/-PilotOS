/**
 * Endpoints /internal/ para integracion con GlorIA.
 * Protegidos por x-internal-token (misma convencion que RentOS).
 *
 * Estos endpoints son el puente entre GlorIA/LucIA y PilotOS.
 * GlorIA los usa para identificar usuarios, obtener contexto operativo
 * y ejecutar acciones desde WhatsApp.
 */
import { Router, Request, Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { clienteTieneFeaturePro } from '../middleware/billing-access.middleware';
import { procesarYGuardarImagen } from '../services/storage.service';

const router = Router();

/**
 * GET /internal/usuario-por-telefono?phone=34600000001
 * Identifica un usuario PilotOS por su telefono.
 * Soporta dual-format: +34600000001 y 34600000001.
 */
router.get('/usuario-por-telefono', async (req: Request, res: Response) => {
    try {
        const phone = (req.query.phone as string || '').trim();
        if (!phone) {
            res.status(400).json({ status: 'FAIL', error: 'missing_phone' });
            return;
        }

        // Dual-format normalization (same as RentOS)
        const phoneVariants = [phone];
        if (phone.startsWith('+')) {
            phoneVariants.push(phone.substring(1)); // +34600... → 34600...
        } else {
            phoneVariants.push('+' + phone); // 34600... → +34600...
        }

        const user = await prisma.minosUser.findFirst({
            where: {
                telefono: { in: phoneVariants },
            },
        });

        if (!user) {
            res.json({ status: 'OK', found: false, user: null, context: null });
            return;
        }

        // Buscar contexto PilotOS: es patron o conductor?
        const conductor = await prisma.conductor.findFirst({
            where: {
                usuario_id: user.id,
                activo: true,
            },
            include: {
                cliente: true,
            },
        });

        const cliente = conductor
            ? conductor.cliente
            : await prisma.cliente.findFirst({
                where: { patron_id: user.id, activo: true },
            });

        res.json({
            status: 'OK',
            found: true,
            user: {
                id: user.id,
                nombre: user.nombre,
                telefono: user.telefono,
                role: user.role,
            },
            context: cliente
                ? {
                    producto: 'PILOTOS',
                    cliente_id: cliente.id,
                    tipo_actividad: cliente.tipo_actividad,
                    es_patron: conductor?.es_patron ?? (cliente.patron_id === user.id),
                    conductor_id: conductor?.id ?? null,
                }
                : null,
        });
    } catch (err: any) {
        console.error('[INTERNAL] usuario-por-telefono error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            status: 'FAIL',
            error: 'server_error',
            message: isDev ? err.message : 'Error interno del servidor',
        });
    }
});

/**
 * GET /internal/resumen?userId=123
 * Resumen operativo para alimentar el prompt de LucIA.
 * Devuelve: vehiculos, ultimo parte, mantenimientos proximos, anomalias, avisos.
 */
router.get('/resumen', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string, 10);
        if (!userId || isNaN(userId)) {
            res.status(400).json({ status: 'FAIL', error: 'missing_userId' });
            return;
        }

        // Buscar cliente del usuario
        const conductor = await prisma.conductor.findFirst({
            where: { usuario_id: userId, activo: true },
            include: { cliente: true },
        });

        const cliente = conductor?.cliente
            ?? await prisma.cliente.findFirst({ where: { patron_id: userId, activo: true } });

        if (!cliente) {
            res.json({ status: 'OK', found: false, resumen: null });
            return;
        }

        // Vehiculos activos
        const vehiculos = await prisma.vehiculo.findMany({
            where: { cliente_id: cliente.id, activo: true },
            select: { id: true, matricula: true, marca: true, modelo: true, km_actuales: true },
        });

        // Ultimo parte diario
        const ultimoParte = await prisma.parteDiario.findFirst({
            where: { conductor: { cliente_id: cliente.id } },
            orderBy: { fecha_trabajada: 'desc' },
            include: { vehiculo: { select: { matricula: true } }, conductor: { include: { usuario: { select: { nombre: true } } } } },
        });

        // Mantenimientos proximos o vencidos
        const mantenimientosAlerta = await prisma.mantenimientoVehiculo.findMany({
            where: {
                vehiculo: { cliente_id: cliente.id },
                estado: { in: ['PENDIENTE', 'VENCIDO'] },
            },
            include: {
                catalogo: { select: { nombre: true, tipo: true } },
                vehiculo: { select: { matricula: true } },
            },
            take: 10,
        });

        // Anomalias recientes (ultimas 10)
        const anomalias = await prisma.anomalia.findMany({
            where: { conductor: { cliente_id: cliente.id } },
            orderBy: { created_at: 'desc' },
            take: 10,
            include: { conductor: { include: { usuario: { select: { nombre: true } } } } },
        });

        // Avisos no leidos
        const avisosNoLeidos = await prisma.aviso.count({
            where: { cliente_id: cliente.id, leido: false },
        });

        res.json({
            status: 'OK',
            found: true,
            resumen: {
                cliente: {
                    id: cliente.id,
                    nombre_comercial: cliente.nombre_comercial,
                    tipo_actividad: cliente.tipo_actividad,
                },
                vehiculos,
                ultimo_parte: ultimoParte
                    ? {
                        fecha: ultimoParte.fecha_trabajada,
                        vehiculo: ultimoParte.vehiculo.matricula,
                        conductor: ultimoParte.conductor.usuario.nombre,
                        ingreso_bruto: ultimoParte.ingreso_bruto,
                        km_fin: ultimoParte.km_fin,
                        estado: ultimoParte.estado,
                    }
                    : null,
                mantenimientos_alerta: mantenimientosAlerta.map((m) => ({
                    vehiculo: m.vehiculo.matricula,
                    mantenimiento: m.catalogo.nombre,
                    tipo: m.catalogo.tipo,
                    estado: m.estado,
                    proximo_km: m.proximo_km,
                    proxima_fecha: m.proxima_fecha,
                })),
                anomalias_recientes: anomalias.map((a) => ({
                    conductor: a.conductor.usuario.nombre,
                    tipo: a.tipo,
                    descripcion: a.descripcion,
                    fecha: a.created_at,
                })),
                avisos_no_leidos: avisosNoLeidos,
            },
        });
    } catch (err: any) {
        console.error('[INTERNAL] resumen error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            status: 'FAIL',
            error: 'server_error',
            message: isDev ? err.message : 'Error interno del servidor',
        });
    }
});

/**
 * POST /internal/registrar-gasto
 * Registra un gasto desde GlorIA (el usuario envia factura por WhatsApp).
 * Sigue R-GA-001 a R-GA-013.
 *
 * ── Idempotencia por huella del documento (Hermes, Gate 13.3) ──────────────
 *
 * Acepta un campo opcional `huella`: el hash del justificante del que sale el
 * gasto. Cuando viene, el mismo documento enviado dos veces NO crea dos gastos:
 * devuelve el que ya habia con `duplicado: true`.
 *
 * El cerrojo es la restriccion UNIQUE de `dedupe_key` en el ledger, no una
 * comprobacion previa. Una comprobacion previa deja una ventana entre el "no
 * existe" y el insert; la restriccion no la deja. Se consulta antes igualmente
 * para poder responder con el gasto original en vez de con un error.
 *
 * Sin `huella` el comportamiento es exactamente el de antes: GlorIA sigue
 * funcionando igual y no habia que cambiar nada de su lado.
 */
router.post('/registrar-gasto', async (req: Request, res: Response) => {
    try {
        const { vehiculo_id, tipo, descripcion, importe, fecha, forma_pago, url_factura, huella } = req.body;

        // Con el token acotado de Hermes, el cliente NO lo elige quien llama: lo
        // fija el servidor. Si viniera del cuerpo, un Hermes comprometido —o un
        // fichero manipulado— podria escribir gastos en el PilotOS de cualquier
        // otro cliente. Es el mismo principio que el color de las tareas: no se
        // acepta de fuera algo que decide si la accion es segura.
        const clienteHermes = process.env.HERMES_CLIENTE_ID;
        if (req.internalScope === 'hermes' && !clienteHermes) {
            res.status(500).json({
                status: 'FAIL',
                error: 'server_config_error',
                message: 'HERMES_CLIENTE_ID no configurado: no se acepta el del cuerpo',
            });
            return;
        }
        const cliente_id = req.internalScope === 'hermes' ? clienteHermes : req.body.cliente_id;

        if (!cliente_id || !tipo || !descripcion || importe === undefined || !fecha) {
            res.status(400).json({
                status: 'FAIL',
                error: 'missing_fields',
                message: 'Campos obligatorios: cliente_id, tipo, descripcion, importe, fecha',
            });
            return;
        }

        const dedupeKey = huella ? `gasto-huella-${huella}` : null;

        // Si ya se registro este mismo documento, se devuelve aquel gasto.
        if (dedupeKey) {
            const previo = await prisma.ledgerEvento.findUnique({ where: { dedupe_key: dedupeKey } });
            const gastoIdPrevio = (previo?.datos as any)?.gasto_id;
            if (gastoIdPrevio) {
                const gastoPrevio = await prisma.gasto.findUnique({ where: { id: gastoIdPrevio } });
                if (gastoPrevio) {
                    res.json({ status: 'OK', gasto: gastoPrevio, duplicado: true });
                    return;
                }
            }
        }

        const gasto = await prisma.$transaction(async (tx) => {
            const nuevoGasto = await tx.gasto.create({
                data: {
                    cliente_id,
                    vehiculo_id: vehiculo_id || null,
                    tipo,
                    descripcion,
                    importe,
                    fecha: new Date(fecha),
                    forma_pago: forma_pago || null,
                    url_factura: url_factura || null,
                    estado: 'REGISTRADO',
                },
            });

            // Registrar evento en ledger. Con huella, la dedupe_key la lleva:
            // es lo que hace que el segundo intento no pueda entrar.
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'GASTO_REGISTRADO',
                    source: 'PILOTOS',
                    dedupe_key: dedupeKey ?? `gasto-${nuevoGasto.id}`,
                    datos: {
                        gasto_id: nuevoGasto.id,
                        tipo,
                        importe,
                        origen: huella ? 'HERMES' : 'GLORIA',
                        ...(huella ? { huella } : {}),
                    },
                },
            });

            return nuevoGasto;
        });

        res.json({ status: 'OK', gasto });
    } catch (err: any) {
        // Dos peticiones a la vez con la misma huella: la segunda choca contra
        // el UNIQUE y su transaccion entera se deshace, asi que no queda ningun
        // gasto huerfano. Se devuelve el que si entro.
        if (err?.code === 'P2002' && req.body?.huella) {
            const previo = await prisma.ledgerEvento.findUnique({
                where: { dedupe_key: `gasto-huella-${req.body.huella}` },
            });
            const gastoIdPrevio = (previo?.datos as any)?.gasto_id;
            const gastoPrevio = gastoIdPrevio
                ? await prisma.gasto.findUnique({ where: { id: gastoIdPrevio } })
                : null;
            if (gastoPrevio) {
                res.json({ status: 'OK', gasto: gastoPrevio, duplicado: true });
                return;
            }
        }
        console.error('[INTERNAL] registrar-gasto error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            status: 'FAIL',
            error: 'server_error',
            message: isDev ? err.message : 'Error interno del servidor',
        });
    }
});

/**
 * GET /internal/mantenimientos?vehiculoId=xxx
 * Estado de mantenimientos de un vehiculo.
 */
router.get('/mantenimientos', async (req: Request, res: Response) => {
    try {
        const vehiculoId = req.query.vehiculoId as string;
        if (!vehiculoId) {
            res.status(400).json({ status: 'FAIL', error: 'missing_vehiculoId' });
            return;
        }

        const vehiculo = await prisma.vehiculo.findUnique({
            where: { id: vehiculoId },
            select: { cliente: { select: { patron_id: true } } },
        });
        if (!vehiculo) {
            res.status(404).json({ status: 'FAIL', error: 'vehicle_not_found' });
            return;
        }
        if (!(await clienteTieneFeaturePro(vehiculo.cliente.patron_id, 'pilotos_proactividad'))) {
            res.status(403).json({ status: 'FAIL', error: 'upgrade_required', feature: 'pilotos_proactividad' });
            return;
        }

        const mantenimientos = await prisma.mantenimientoVehiculo.findMany({
            where: { vehiculo_id: vehiculoId },
            include: {
                catalogo: { select: { nombre: true, tipo: true, frecuencia_km: true, frecuencia_meses: true } },
            },
            orderBy: { estado: 'asc' }, // VENCIDO primero
        });

        res.json({
            status: 'OK',
            mantenimientos: mantenimientos.map((m) => ({
                id: m.id,
                nombre: m.catalogo.nombre,
                tipo: m.catalogo.tipo,
                estado: m.estado,
                proximo_km: m.proximo_km,
                proxima_fecha: m.proxima_fecha,
                ultima_ejecucion_km: m.ultima_ejecucion_km,
                ultima_ejecucion_fecha: m.ultima_ejecucion_fecha,
            })),
        });
    } catch (err: any) {
        console.error('[INTERNAL] mantenimientos error:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            status: 'FAIL',
            error: 'server_error',
            message: isDev ? err.message : 'Error interno del servidor',
        });
    }
});

/**
 * GET /internal/kb/producto
 * Knowledge base del producto para alimentar el prompt de LucIA.
 * GlorIA carga esto al detectar planeta PILOTOS.
 */
router.get('/kb/producto', async (_req: Request, res: Response) => {
    res.json({
        status: 'OK',
        producto: 'PilotOS',
        version: '1.0.0',
        descripcion: 'Sistema de control operativo, economico y documental para taxistas',
        identidad_visible: 'GlorIA',
        subagente: 'LucIA',
        capacidades: [
            'Consultar resumen operativo del taxista',
            'Registrar gastos (facturas, recibos) con clasificacion automatica',
            'Consultar estado de mantenimientos y vencimientos',
            'Registrar incidencias sobre partes diarios (solo patron)',
            'Consultar anomalias de conductores',
            'Informar sobre estado general del negocio',
        ],
        restricciones: [
            'El parte diario SOLO se crea desde la app web, nunca por WhatsApp',
            'Solo el patron puede autorizar incidencias y cambios de configuracion',
            'Los gastos siempre requieren confirmacion de forma de pago',
            'Las anomalias se acumulan y NUNCA se resetean',
        ],
        flujos_principales: {
            gasto: 'Usuario envia factura → GlorIA clasifica → pregunta forma de pago → registra',
            consulta: 'Usuario pregunta → GlorIA consulta /internal/resumen → responde con datos reales',
            mantenimiento: 'Usuario pregunta → GlorIA consulta /internal/mantenimientos → informa estado',
            incidencia: 'Patron solicita → GlorIA crea incidencia con justificacion → queda auditada',
        },
    });
});

/**
 * POST /internal/documentos-vehiculo
 *
 * 2026-08-11 — terreno para "el propietario manda una foto por WhatsApp y el
 * sistema la encaja sola" (petición de Alberto). Esto es SOLO el tramo de
 * recepción y guardado: decide dónde vive el fichero y dueño (vehículo).
 * NO clasifica el documento ni extrae datos — eso está deliberadamente sin
 * construir hasta tener una foto real de referencia (ver docs/learning,
 * mismo motivo que obligó a rehacer el parser del ticket de taxímetro:
 * las reglas de OCR escritas a ciegas fallan contra el documento real).
 *
 * Solo el token `total` (GlorIA) puede llamarlo — no está en RUTAS_HERMES
 * ni RUTAS_LUCIA, así que un token acotado recibe 403 automáticamente.
 *
 * Body: { vehiculo_id: string, imagen_base64: string, subido_por_telefono?: string }
 * imagen_base64: SIN el prefijo "data:image/...;base64," — solo el payload.
 */
router.post('/documentos-vehiculo', express.json({ limit: '15mb' }), async (req: Request, res: Response) => {
    try {
        const { vehiculo_id, imagen_base64, subido_por_telefono } = req.body as {
            vehiculo_id?: string; imagen_base64?: string; subido_por_telefono?: string;
        };
        if (!vehiculo_id || !imagen_base64) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields', required: ['vehiculo_id', 'imagen_base64'] });
            return;
        }

        const vehiculo = await prisma.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { id: true } });
        if (!vehiculo) {
            res.status(404).json({ status: 'FAIL', error: 'vehiculo_not_found' });
            return;
        }

        let buffer: Buffer;
        try {
            buffer = Buffer.from(imagen_base64, 'base64');
            if (buffer.length === 0) throw new Error('buffer_vacio');
        } catch {
            res.status(400).json({ status: 'FAIL', error: 'imagen_invalida' });
            return;
        }

        let procesado;
        try {
            procesado = await procesarYGuardarImagen(buffer);
        } catch (err: any) {
            console.error('[INTERNAL] Error procesando imagen (documentos-vehiculo):', err.message);
            res.status(415).json({ status: 'FAIL', error: 'invalid_image', message: 'No se pudo procesar la imagen.' });
            return;
        }

        const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
        const url = publicBase
            ? `${publicBase}/uploads/${procesado.filename}`
            : `${req.protocol}://${req.get('host')}/uploads/${procesado.filename}`;
        const hash_sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

        const documento = await prisma.documento.create({
            data: {
                tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR',
                url,
                hash_sha256,
                estado: 'RECIBIDO',
                estado_ocr: 'PENDIENTE',
                vehiculo_id: vehiculo.id,
            },
        });

        console.log(`[INTERNAL] Documento sin clasificar recibido para vehiculo ${vehiculo.id}${subido_por_telefono ? ` (via ${subido_por_telefono})` : ''}: ${documento.id}`);

        res.status(201).json({ status: 'OK', data: { documento_id: documento.id, url } });
    } catch (err: any) {
        console.error('[INTERNAL] Error en /documentos-vehiculo:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/**
 * GET /internal/avisos/entregas?dias=7
 *
 * "¿Se enviaron de verdad?" — la pregunta que antes no se podía responder.
 * Desde que PilotOS envía directo a Meta (sin la cola de n8n), `Aviso.enviado`
 * significa que Meta aceptó el mensaje, no que quedara encolado. Los fallos
 * traen el motivo real en `error_envio`, así que este resumen es accionable:
 * si algo sale aquí, es un problema de verdad.
 */
router.get('/avisos/entregas', async (req: Request, res: Response) => {
    try {
        const dias = Math.min(parseInt(req.query.dias as string, 10) || 7, 60);
        const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

        const avisos = await prisma.aviso.findMany({
            where: { created_at: { gt: desde }, canal: 'whatsapp' },
            orderBy: { created_at: 'desc' },
            take: 200,
        });
        const fallidos = avisos.filter((a) => !a.enviado);

        res.json({
            status: 'OK',
            ventana_dias: dias,
            total: avisos.length,
            enviados: avisos.length - fallidos.length,
            fallidos: fallidos.length,
            problemas: fallidos.map((a) => ({
                id: a.id,
                tipo: a.tipo,
                titulo: a.titulo,
                intentos: a.intentos,
                error: a.error_envio,
                creado: a.created_at,
            })),
        });
    } catch (err: any) {
        console.error('[INTERNAL] Error en /avisos/entregas:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
