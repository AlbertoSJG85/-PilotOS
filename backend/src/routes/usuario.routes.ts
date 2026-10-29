import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { normalizarTelefono, variantesTelefono, esTelefonoValido } from '../lib/telefono';
import { requireAuth, requireClienteContext, requirePatron, isSameTenant, revocarSesiones, AuthRequest } from '../middleware/auth.middleware';
import { PLACEHOLDER_PASSWORD_HASHES } from '../lib/password';
import { enviarBienvenidaAsalariado } from '../services/bienvenida.service';
import { sincronizarCantidadAsalariados } from '../services/billing-sync.service';
import { clienteTieneFeaturePro } from '../middleware/billing-access.middleware';

const router = Router();

// GET /api/usuarios — Listar conductores del cliente
router.get('/', requireAuth, requireClienteContext, async (req: AuthRequest, res: Response) => {
    try {
        // Los quitados no se borran (conservan su historial de partes), pero
        // tampoco molestan: solo salen si se piden, para poder reactivarlos.
        const incluirInactivos = req.query.incluir_inactivos === '1';
        const where: any = incluirInactivos ? {} : { activo: true };
        if (req.usuario?.role !== 'admin') where.cliente_id = req.usuario!.cliente_id;

        const verDetalle = req.usuario?.es_patron === true || req.usuario?.role === 'admin';
        const conductores = await prisma.conductor.findMany({
            where,
            include: {
                usuario: { select: { id: true, nombre: true, telefono: true, role: true, email: true, password_hash: true } },
                vehiculosAsignados: { where: { activo: true }, include: { vehiculo: { select: { id: true, matricula: true } } } },
                configuraciones: { where: { activo: true, fecha_fin: null }, orderBy: { fecha_inicio: 'desc' }, take: 1 },
            },
        });

        // El hash nunca sale; solo se dice si la cuenta ya se activó. El email
        // y el reparto son cosas del patrón: un compañero no las ve.
        const data = conductores.map(({ usuario, configuraciones, ...c }) => {
            const { password_hash, email, ...usuarioPublico } = usuario;
            return {
                ...c,
                usuario: verDetalle ? { ...usuarioPublico, email } : usuarioPublico,
                cuenta_activada: !(PLACEHOLDER_PASSWORD_HASHES as readonly string[]).includes(password_hash),
                ...(verDetalle ? { configuracion: configuraciones[0] ?? null } : {}),
            };
        });
        res.json({ status: 'OK', data });
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
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MODELOS_REPARTO = ['PORCENTAJE', 'FIJO_DIARIO'];

/**
 * El reparto de un asalariado: porcentaje (0-100) o euros al día. La columna
 * es Decimal(5,2): por encima de 999,99 la base de datos revienta con un 500,
 * así que se corta aquí con un mensaje que el patrón entienda.
 */
export function validarReparto(modelo: unknown, valor: unknown): string | null {
    if (typeof modelo !== 'string' || !MODELOS_REPARTO.includes(modelo)) {
        return 'La condición económica debe ser reparto (%) o fijo diario (€).';
    }
    const n = Number(valor);
    if (valor === null || valor === '' || !Number.isFinite(n) || n < 0) {
        return 'Indica cuánto cobra el conductor (un número positivo).';
    }
    if (modelo === 'PORCENTAJE' && n > 100) return 'El porcentaje del conductor no puede pasar de 100.';
    if (modelo === 'FIJO_DIARIO' && n > 999.99) return 'El fijo diario no puede pasar de 999,99 €.';
    return null;
}

/** Parte del patrón según el modelo: en fijo diario no interviene (ver calculo.service). */
function porcentajePatron(modelo: string, valor: number): number {
    return modelo === 'PORCENTAJE' ? 100 - valor : 0;
}

// POST /api/usuarios — Crear conductor (Fase 3 RBAC: solo el patron puede dar de alta conductores)
router.post('/', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) { res.status(400).json({ status: 'FAIL', error: 'no_client_context' }); return; }
        
        const { nombre, telefono, email, vehiculo_id, porcentaje_conductor, modelo_reparto } = req.body;
        if (!telefono) { res.status(400).json({ status: 'FAIL', error: 'missing_telefono' }); return; }

        // Mismo listón que el onboarding. Sin email de verdad el conductor no
        // podría activar su cuenta nunca: el código de activación va a su correo.
        if (typeof nombre !== 'string' || !nombre.trim()) {
            res.status(400).json({ status: 'FAIL', error: 'missing_nombre', message: 'El nombre del conductor es obligatorio.' });
            return;
        }
        if (typeof email !== 'string' || !EMAIL_VALIDO.test(email.trim())) {
            res.status(400).json({
                status: 'FAIL', error: 'email_invalido',
                message: 'Necesitamos el email del conductor: ahí recibirá el código para activar su cuenta.',
            });
            return;
        }
        if (!esTelefonoValido(telefono)) {
            res.status(400).json({
                status: 'FAIL', error: 'invalid_telefono',
                message: 'El teléfono no es válido. Escríbelo con el 34 delante y sin espacios, por ejemplo 34600123456.',
            });
            return;
        }
        const telefonoNorm = normalizarTelefono(telefono);
        const modeloElegido = modelo_reparto || 'PORCENTAJE';
        const valorElegido = porcentaje_conductor ?? 50;
        const errReparto = validarReparto(modeloElegido, valorElegido);
        if (errReparto) {
            res.status(400).json({ status: 'FAIL', error: 'reparto_invalido', message: errReparto });
            return;
        }

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
        // Vehículo: el que se pida (de ESTE cliente) o, si el cliente solo tiene
        // uno, ese — igual que hace el onboarding. Sin esta comprobación se
        // podía enganchar al conductor al coche de otro cliente por su id.
        let vehiculoAsignar: string | null = null;
        if (vehiculo_id) {
            const v = await prisma.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { cliente_id: true } });
            if (!v || !isSameTenant(req, v.cliente_id)) {
                res.status(404).json({ status: 'FAIL', error: 'vehiculo_not_found' });
                return;
            }
            vehiculoAsignar = vehiculo_id;
        } else {
            const vehiculos = await prisma.vehiculo.findMany({ where: { cliente_id, activo: true }, select: { id: true } });
            if (vehiculos.length === 1) vehiculoAsignar = vehiculos[0].id;
        }

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
                if (existente.telefono && normalizarTelefono(existente.telefono) !== telefonoNorm) {
                    throw new ConflictoAlta(
                        'telefono_no_coincide',
                        'Ese email ya pertenece a una cuenta con otro teléfono. Comprueba los datos con la persona antes de darla de alta.',
                    );
                }
            }

            // El login es por teléfono: dos cuentas con el mismo número se
            // pisarían al entrar. Si ya lo usa OTRA cuenta, no se crea.
            if (!existente) {
                const telefonoUsado = await tx.minosUser.findFirst({
                    where: { telefono: { in: variantesTelefono(telefonoNorm) } },
                    select: { id: true },
                });
                if (telefonoUsado) {
                    throw new ConflictoAlta(
                        'telefono_en_uso',
                        'Ese teléfono ya pertenece a otra cuenta. Comprueba el número con la persona.',
                    );
                }
            }

            const user = existente ?? await tx.minosUser.create({
                data: {
                    nombre: nombre || 'Conductor',
                    telefono: telefonoNorm,
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
                    modelo_reparto: modeloElegido,
                    porcentaje_conductor: Number(valorElegido),
                    porcentaje_patron: porcentajePatron(modeloElegido, Number(valorElegido)),
                    cuota_pilotos: 0,
                    incluye_combustible_en_reparto: true,
                },
            });

            // 4. Asignar vehículo si viene
            if (vehiculoAsignar) {
                await tx.vehiculoConductor.create({
                    data: { vehiculo_id: vehiculoAsignar, conductor_id: cond.id, activo: true }
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
            select: {
                cliente_id: true, activo: true, es_patron: true, usuario_id: true,
                usuario: { select: { nombre: true, telefono: true, password_hash: true } },
            },
        });
        if (!existing || !isSameTenant(req, existing.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' }); return;
        }
        const { nombre, telefono, activo, cuota_ss_mensual, modelo_reparto, porcentaje_conductor } = req.body;

        // Nombre y teléfono son de la persona, no del patrón (PIL-02: la fila de
        // identidad es compartida y el login es por teléfono). Solo se pueden
        // corregir mientras la cuenta no se ha activado — un error al teclear
        // el alta — y nunca a un número que ya usa otra cuenta.
        const cambiaNombre = typeof nombre === 'string' && nombre.trim() !== '' && nombre.trim() !== existing.usuario.nombre;
        const cambiaTelefono = typeof telefono === 'string' && telefono.trim() !== ''
            && normalizarTelefono(telefono) !== normalizarTelefono(existing.usuario.telefono);
        if (cambiaTelefono && !esTelefonoValido(telefono)) {
            res.status(400).json({
                status: 'FAIL', error: 'invalid_telefono',
                message: 'El teléfono no es válido. Escríbelo con el 34 delante y sin espacios, por ejemplo 34600123456.',
            });
            return;
        }
        if (cambiaNombre || cambiaTelefono) {
            const cuentaActivada = !(PLACEHOLDER_PASSWORD_HASHES as readonly string[]).includes(existing.usuario.password_hash);
            if (cuentaActivada) {
                res.status(409).json({
                    status: 'FAIL', error: 'cuenta_activada',
                    message: 'Esta persona ya activó su cuenta: su nombre y su teléfono son suyos y no se pueden cambiar desde aquí.',
                });
                return;
            }
            if (cambiaTelefono) {
                const enUso = await prisma.minosUser.findFirst({
                    where: { telefono: { in: variantesTelefono(telefono) }, NOT: { id: existing.usuario_id } },
                    select: { id: true },
                });
                if (enUso) {
                    res.status(409).json({ status: 'FAIL', error: 'telefono_en_uso', message: 'Ese teléfono ya pertenece a otra cuenta.' });
                    return;
                }
            }
        }

        // Condición económica. Se VERSIONA: la fila vigente se cierra y se abre
        // otra, así los partes ya calculados conservan el reparto con el que se
        // hicieron y los nuevos usan el actual.
        let repartoNuevo: { modelo: string; valor: number; previa: any } | null = null;
        if (modelo_reparto !== undefined || porcentaje_conductor !== undefined) {
            if (existing.es_patron) {
                res.status(400).json({ status: 'FAIL', error: 'reparto_solo_asalariados' });
                return;
            }
            const previa = await prisma.configuracionEconomica.findFirst({
                where: { cliente_id: existing.cliente_id, conductor_id: req.params.id, activo: true, fecha_fin: null },
                orderBy: { fecha_inicio: 'desc' },
            });
            const modelo = modelo_reparto ?? previa?.modelo_reparto ?? 'PORCENTAJE';
            const valor = porcentaje_conductor ?? (previa ? Number(previa.porcentaje_conductor) : 50);
            const errReparto = validarReparto(modelo, valor);
            if (errReparto) {
                res.status(400).json({ status: 'FAIL', error: 'reparto_invalido', message: errReparto });
                return;
            }
            const igual = previa && previa.modelo_reparto === modelo && Number(previa.porcentaje_conductor) === Number(valor);
            if (!igual) repartoNuevo = { modelo, valor: Number(valor), previa };
        }

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
                ...(activo !== undefined && { activo }),
                ...(cuotaSS !== undefined && { cuota_ss_mensual: cuotaSS }),
            },
            include: { usuario: true }
        });

        if (repartoNuevo) {
            const { modelo, valor, previa } = repartoNuevo;
            await prisma.$transaction(async (tx) => {
                if (previa) {
                    await tx.configuracionEconomica.update({ where: { id: previa.id }, data: { fecha_fin: new Date() } });
                }
                await tx.configuracionEconomica.create({
                    data: {
                        cliente_id: existing.cliente_id,
                        conductor_id: conductor.id,
                        modelo_reparto: modelo,
                        porcentaje_conductor: valor,
                        porcentaje_patron: porcentajePatron(modelo, valor),
                        cuota_pilotos: previa?.cuota_pilotos ?? 0,
                        incluye_combustible_en_reparto: previa?.incluye_combustible_en_reparto ?? true,
                        notas: previa?.notas ?? null,
                    },
                });
            });
        }

        if (cambiaNombre || cambiaTelefono) {
            await prisma.minosUser.update({
                where: { id: conductor.usuario_id },
                data: {
                    ...(cambiaNombre && { nombre: nombre.trim() }),
                    ...(cambiaTelefono && { telefono: normalizarTelefono(telefono) })
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
