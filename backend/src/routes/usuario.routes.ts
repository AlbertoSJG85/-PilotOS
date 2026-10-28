import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireClienteContext, requirePatron, isSameTenant, revocarSesiones, AuthRequest } from '../middleware/auth.middleware';
import { PLACEHOLDER_PASSWORD_HASHES } from '../lib/password';
import { enviarBienvenidaAsalariado } from '../services/bienvenida.service';
import { sincronizarCantidadAsalariados } from '../services/billing-sync.service';
import { clienteTieneFeaturePro } from '../middleware/billing-access.middleware';

const router = Router();

// GET /api/usuarios — Listar conductores del cliente
router.get('/', requireAuth, requireClienteContext, async (req: AuthRequest, res: Response) => {
    try {
        const where: any = { activo: true };
        if (req.usuario?.role !== 'admin') where.cliente_id = req.usuario!.cliente_id;

        const conductores = await prisma.conductor.findMany({
            where,
            include: {
                usuario: { select: { id: true, nombre: true, telefono: true, role: true } },
                vehiculosAsignados: { where: { activo: true }, include: { vehiculo: { select: { id: true, matricula: true } } } },
            },
        });
        res.json({ status: 'OK', data: conductores });
    } catch (err: any) {
        console.error('[USUARIOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/usuarios/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const conductor = await prisma.conductor.findUnique({
            where: { id: req.params.id },
            include: {
                usuario: { select: { id: true, nombre: true, telefono: true, email: true, role: true } },
                vehiculosAsignados: { include: { vehiculo: true } },
                anomalias: { orderBy: { created_at: 'desc' }, take: 20 },
            },
        });
        if (!conductor || !isSameTenant(req, conductor.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        res.json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/**
 * Un alta que no se puede completar por el estado del ecosistema, no por un
 * fallo del servidor. Se distingue para poder devolver 409 con un motivo que
 * el patron entienda, en vez de un 500 mudo.
 */
class ConflictoAlta extends Error {
    constructor(public readonly codigo: string, mensaje: string) {
        super(mensaje);
        this.name = 'ConflictoAlta';
    }
}
// POST /api/usuarios — Crear conductor (Fase 3 RBAC: solo el patron puede dar de alta conductores)
router.post('/', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        
        const { nombre, telefono, email, vehiculo_id, porcentaje_conductor, modelo_reparto } = req.body;
        if (!telefono) { res.status(400).json({ status: 'FAIL', error: 'missing_telefono' }); return; }

        const cliente_id = req.usuario.cliente_id;
        if (req.usuario.role !== 'admin'
            && !(await clienteTieneFeaturePro(req.usuario.id, 'pilotos_asalariados'))) {
            res.status(409).json({
                status: 'FAIL', error: 'pro_required_for_employees',
                message: 'Para añadir asalariados, el cliente debe estar en PilotOS Pro.',
            });
            return;
        }
        const asalaEmail = (email || `${telefono}@pilotos.app`).trim().toLowerCase();

        // PIL-02 — dar de alta a un asalariado no puede tocar la cuenta de otro.
        //
        // Antes esto era un `upsert` por email, y `minos."Users"` es la tabla de
        // identidad COMPARTIDA de todo el ecosistema. Es decir: un patrón que
        // escribía el email de un usuario ya existente —de RentOS, de IngresOS,
        // de otro taxi— le **sobrescribía el teléfono** con el suyo y lo
        // enganchaba como conductor de su flota. La víctima perdía el acceso
        // (su login es por teléfono) sin haber hecho nada ni enterarse.
        //
        // Ahora se comprueba antes. Solo se crea gente nueva; a alguien que ya
        // existe se le puede incorporar, pero **nunca modificando sus datos**, y
        // solo si no es ya conductor de otro cliente.
        let usuarioAlta: { nombre: string | null; email: string | null; telefono: string | null } | null = null;
        const conductor = await prisma.$transaction(async (tx) => {
            // 1. MinosUser
            const existente = await tx.minosUser.findUnique({ where: { email: asalaEmail } });

            if (existente) {
                const yaEsConductor = await tx.conductor.findFirst({
                    where: { usuario_id: existente.id, activo: true },
                });

                if (yaEsConductor && yaEsConductor.cliente_id !== cliente_id) {
                    throw new ConflictoAlta(
                        'conductor_de_otro_cliente',
                        'Esa persona ya conduce para otra empresa. Pídele que se dé de baja allí antes de añadirla aquí.',
                    );
                }
                if (yaEsConductor) {
                    throw new ConflictoAlta(
                        'ya_es_conductor',
                        'Esa persona ya está dada de alta en tu flota.',
                    );
                }
                // Existe en el ecosistema pero no conduce para nadie: se le
                // engancha tal cual. Ni nombre ni teléfono se tocan — son suyos,
                // no del patrón que le da de alta.
                if (existente.telefono && existente.telefono !== telefono) {
                    throw new ConflictoAlta(
                        'telefono_no_coincide',
                        'Ese email ya pertenece a una cuenta con otro teléfono. Comprueba los datos con la persona antes de darla de alta.',
                    );
                }
            }

            const user = existente ?? await tx.minosUser.create({
                data: {
                    nombre: nombre || 'Conductor',
                    telefono,
                    email: asalaEmail,
                    password_hash: PLACEHOLDER_PASSWORD_HASHES[0], // 'CONDUCTOR_NUEVO'
                    role: 'user',
                    estado_pago: 'AL DIA',
                },
            });

            usuarioAlta = user;

            // 2. Conductor
            const cond = await tx.conductor.create({
                data: {
                    cliente_id,
                    usuario_id: user.id,
                    es_patron: false,
                    activo: true
                },
            });

            // 3. Configuración Económica (opcional/por defecto)
            await tx.configuracionEconomica.create({
                data: {
                    cliente_id,
                    conductor_id: cond.id,
                    modelo_reparto: modelo_reparto || 'PORCENTAJE',
                    porcentaje_conductor: porcentaje_conductor ?? 50,
                    porcentaje_patron: 100 - (porcentaje_conductor ?? 50),
                    cuota_pilotos: 0,
                    incluye_combustible_en_reparto: true,
                },
            });

            // 4. Asignar vehículo si viene
            if (vehiculo_id) {
                await tx.vehiculoConductor.create({
                    data: { vehiculo_id, conductor_id: cond.id, activo: true }
                });
            }

            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'ASALARIADO_CREADO',
                    source: 'PILOTOS',
                    dedupe_key: `asalariado-creado-${cond.id}`,
                    datos: { cliente_id, conductor_id: cond.id, usuario_id: user.id },
                },
            });

            return cond;
        });

        res.status(201).json({ status: 'OK', data: conductor });
        // Bienvenida al asalariado, fuera de la transacción: no puede deshacer el alta.
        if (usuarioAlta) {
            enviarBienvenidaAsalariado(usuarioAlta, req.usuario?.nombre || '')
                .catch((error) => console.warn('[BIENVENIDA] fallida (no bloquea):', error?.message));
        }
        sincronizarCantidadAsalariados(cliente_id, `asalariado-creado-${conductor.id}`)
            .catch((error) => console.warn('[nexos-pay] sync asalariados fallida:', error?.message));
    } catch (err: any) {
        if (err instanceof ConflictoAlta) {
            res.status(409).json({ status: 'FAIL', error: err.codigo, message: err.message });
            return;
        }
        console.error('[USUARIOS] Error al crear:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// PATCH /api/usuarios/:id — Editar/Desactivar (Fase 3 RBAC: solo patron)
/**
 * PATCH /api/usuarios/ss-modo — donde se descuenta la Seguridad Social.
 * Es una eleccion del patron para TODOS sus asalariados a la vez (F4), no
 * una casilla por persona: por eso vive en el cliente y no en el conductor.
 */
router.patch('/ss-modo', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const { modo } = req.body;
        if (modo !== 'parte' && modo !== 'cierre') {
            res.status(400).json({ status: 'FAIL', error: 'modo_invalido', message: "Solo vale 'parte' o 'cierre'" });
            return;
        }
        if (!req.usuario?.cliente_id) { res.status(403).json({ status: 'FAIL', error: 'no_client_context' }); return; }

        await prisma.cliente.update({ where: { id: req.usuario.cliente_id }, data: { ss_modo_descuento: modo } });
        res.json({ status: 'OK', modo });
    } catch (err: any) {
        console.error('[USUARIOS] Error al cambiar el modo de SS:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.patch('/:id', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.conductor.findUnique({
            where: { id: req.params.id },
            select: { cliente_id: true, activo: true, es_patron: true },
        });
        if (!existing || !isSameTenant(req, existing.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        const { nombre, telefono, activo, cuota_ss_mensual } = req.body;

        // Cuota de Seguridad Social del asalariado (F4, 2026-08-11). null o
        // vacio = no se le aplica descuento. Se valida el numero aqui porque
        // un texto colado se convertiria en NaN y acabaria restando "nada"
        // sin que nadie se entere.
        let cuotaSS: number | null | undefined;
        if (cuota_ss_mensual !== undefined) {
            if (cuota_ss_mensual === null || cuota_ss_mensual === '') {
                cuotaSS = null;
            } else {
                const n = Number(cuota_ss_mensual);
                if (!Number.isFinite(n) || n < 0) {
                    res.status(400).json({ status: 'FAIL', error: 'cuota_ss_invalida', message: 'La cuota de Seguridad Social debe ser un numero positivo' });
                    return;
                }
                cuotaSS = n;
            }
        }
        if (activo !== undefined && typeof activo !== 'boolean') {
            res.status(400).json({ status: 'FAIL', error: 'invalid_activo' }); return;
        }
        if (!existing.es_patron && activo === true && existing.activo === false
            && req.usuario?.role !== 'admin'
            && !(await clienteTieneFeaturePro(req.usuario!.id, 'pilotos_asalariados'))) {
            res.status(409).json({
                status: 'FAIL', error: 'pro_required_for_employees',
                message: 'Para reactivar asalariados, el cliente debe estar en PilotOS Pro.',
            });
            return;
        }

        const conductor = await prisma.conductor.update({
            where: { id: req.params.id },
            data: {
                ...(activo !== undefined && { activo })
            },
            include: { usuario: true }
        });

        if (nombre || telefono) {
            await prisma.minosUser.update({
                where: { id: conductor.usuario_id },
                data: {
                    ...(nombre && { nombre }),
                    ...(telefono && { telefono })
                }
            });
        }

        // PIL-03 — desactivar a un conductor le corta la sesión de inmediato.
        //
        // Este es el caso del despido. Antes, marcar a alguien como inactivo le
        // quitaba de las listas pero **su token seguía valiendo hasta un mes**:
        // podía seguir consultando y escribiendo con la app que ya tenía
        // abierta. Desactivar tiene que significar "fuera ahora", no "fuera
        // cuando le caduque el token".
        if (activo === false && existing.activo === true) {
            await revocarSesiones(conductor.usuario_id);
        }

        if (!existing.es_patron && activo !== undefined && activo !== existing.activo) {
            const eventoId = `asalariado-${activo ? 'reactivado' : 'desactivado'}-${conductor.id}-${conductor.updated_at.toISOString()}`;
            await prisma.ledgerEvento.upsert({
                where: { dedupe_key: eventoId },
                create: {
                    tipo_evento: activo ? 'ASALARIADO_REACTIVADO' : 'ASALARIADO_DESACTIVADO',
                    source: 'PILOTOS', dedupe_key: eventoId,
                    datos: { cliente_id: existing.cliente_id, conductor_id: conductor.id, activo },
                },
                update: {},
            });
            sincronizarCantidadAsalariados(existing.cliente_id, eventoId)
                .catch((error) => console.warn('[nexos-pay] sync asalariados fallida:', error?.message));
        }
        res.json({ status: 'OK', data: conductor });
    } catch (err: any) {
        console.error('[USUARIOS] Error al editar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
