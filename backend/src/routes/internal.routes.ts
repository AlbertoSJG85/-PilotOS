/**
 * Endpoints /internal/ para integracion con GlorIA.
 * Protegidos por x-internal-token (misma convencion que RentOS).
 *
 * Estos endpoints son el puente entre GlorIA/LucIA y PilotOS.
 * GlorIA los usa para identificar usuarios, obtener contexto operativo
 * y ejecutar acciones desde WhatsApp.
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

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
 */
router.post('/registrar-gasto', async (req: Request, res: Response) => {
    try {
        const { cliente_id, vehiculo_id, tipo, descripcion, importe, fecha, forma_pago, url_factura } = req.body;

        if (!cliente_id || !tipo || !descripcion || importe === undefined || !fecha) {
            res.status(400).json({
                status: 'FAIL',
                error: 'missing_fields',
                message: 'Campos obligatorios: cliente_id, tipo, descripcion, importe, fecha',
            });
            return;
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

            // Registrar evento en ledger
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'GASTO_REGISTRADO',
                    source: 'PILOTOS',
                    dedupe_key: `gasto-${nuevoGasto.id}`,
                    datos: {
                        gasto_id: nuevoGasto.id,
                        tipo,
                        importe,
                        origen: 'GLORIA',
                    },
                },
            });

            return nuevoGasto;
        });

        res.json({ status: 'OK', gasto });
    } catch (err: any) {
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

export default router;
