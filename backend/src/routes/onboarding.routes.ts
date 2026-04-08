/**
 * Onboarding routes — Registro inicial de clientes PilotOS.
 * DT-005: Crea Cliente separado de minos.Users.
 * DT-006: Crea ConfiguracionEconomica.
 * DT-012: Todo en transaccion.
 * C-023: Identidad basada en email + teléfono. minos.Users es compartida con NexOS.
 *        Gmail obligatorio. 3 casos de identidad: nuevo / NexOS sin PilotOS / ya en PilotOS.
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

function isGmail(email: string): boolean {
    return email.trim().toLowerCase().endsWith('@gmail.com');
}

// POST /api/onboarding — Guardar datos de onboarding (upsert por telefono)
router.post('/', async (req: Request, res: Response) => {
    try {
        const rawData = req.body;
        if (!rawData.telefono) {
            res.status(400).json({ status: 'FAIL', error: 'missing_telefono' });
            return;
        }

        // C-023: Gmail obligatorio desde el primer guardado
        if (!rawData.email_patron) {
            res.status(400).json({ status: 'FAIL', error: 'email_required', message: 'El Gmail es obligatorio.' });
            return;
        }
        if (!isGmail(rawData.email_patron)) {
            res.status(400).json({ status: 'FAIL', error: 'invalid_email', message: 'El email debe ser una cuenta Gmail (@gmail.com).' });
            return;
        }

        const data = {
            telefono: rawData.telefono,
            nombre_patron: rawData.nombre_patron || null,
            email_patron: rawData.email_patron,
            nif_cif: rawData.nif_cif || null,
            nombre_comercial: rawData.nombre_comercial || null,
            tipo_actividad: rawData.tipo_actividad || 'TAXI',
            asalariados: rawData.asalariados || [],
            gastos_fijos: rawData.gastos_fijos || [],
            matricula: rawData.matricula || null,
            marca_modelo: rawData.marca_modelo || null,
            fecha_matriculacion: rawData.fecha_matriculacion ? new Date(rawData.fecha_matriculacion) : null,
            tipo_combustible: rawData.tipo_combustible || null,
            tipo_transmision: rawData.tipo_transmision || null,
            km_actuales: rawData.km_actuales ? Number(rawData.km_actuales) : null,
            seguro_vigencia: rawData.seguro_vigencia ? new Date(rawData.seguro_vigencia) : null,
            preferencias_avisos: rawData.preferencias_avisos || null,
            completado: false,
        };

        const onboarding = await prisma.onboarding.upsert({
            where: { telefono: data.telefono },
            update: data,
            create: data,
        });

        res.status(201).json({ status: 'OK', data: onboarding });
    } catch (err: any) {
        console.error('[ONBOARDING] Error guardando:', err.message);
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: isDev ? err.message : 'Error interno' });
    }
});

// POST /api/onboarding/:telefono/completar — Crear todas las entidades
router.post('/:telefono/completar', async (req: Request, res: Response) => {
    try {
        const onboarding = await prisma.onboarding.findUnique({
            where: { telefono: req.params.telefono },
        });
        if (!onboarding) {
            res.status(404).json({ status: 'FAIL', error: 'onboarding_not_found' });
            return;
        }
        if (onboarding.completado) {
            res.status(400).json({ status: 'FAIL', error: 'already_completed', message: 'Este onboarding ya fue completado. Inicia sesión con tu teléfono.' });
            return;
        }

        // C-023: Gmail obligatorio para completar (nunca se debe llegar aquí sin él,
        // pero validamos de nuevo como capa de seguridad)
        if (!onboarding.email_patron) {
            res.status(400).json({ status: 'FAIL', error: 'email_required', message: 'El Gmail es obligatorio para completar el registro.' });
            return;
        }
        if (!isGmail(onboarding.email_patron)) {
            res.status(400).json({ status: 'FAIL', error: 'invalid_email', message: 'El email registrado no es un Gmail válido (@gmail.com).' });
            return;
        }

        const email = onboarding.email_patron.trim().toLowerCase();
        const telefono = onboarding.telefono;

        // ── C-023: Identidad por email (anchor principal en NexOS) ───────────────────
        // Email es @unique en minos.Users → única clave fiable de identidad.
        // El teléfono NO se usa para detectar conflictos: puede estar en formatos distintos
        // (+34615... vs 615...) y puede coincidir con usuarios distintos en otros productos.
        console.log(`[ONBOARDING] completar → email="${email}" telefono="${telefono}"`);

        const existingUser = await prisma.minosUser.findUnique({ where: { email } });

        console.log(`[ONBOARDING] minosUser por email: ${existingUser ? `id=${existingUser.id}` : 'NO ENCONTRADO'}`);

        // ── C-023: ¿Ya tiene presencia en PilotOS? ──────────────────────────────────
        // "Tiene PilotOS" = es patrón (tiene Cliente) O es conductor asalariado activo.
        if (existingUser) {
            const yaEsPatron = await prisma.cliente.findFirst({ where: { patron_id: existingUser.id } });
            const yaEsConductor = await prisma.conductor.findFirst({ where: { usuario_id: existingUser.id } });

            console.log(`[ONBOARDING] yaEsPatron=${!!yaEsPatron} yaEsConductor=${!!yaEsConductor}`);

            if (yaEsPatron || yaEsConductor) {
                res.status(409).json({
                    status: 'FAIL',
                    error: 'pilotos_account_exists',
                    message: 'Ya tienes una cuenta en PilotOS. Inicia sesión con tu número de teléfono.',
                });
                return;
            }
            console.log(`[ONBOARDING] Caso B: usuario NexOS existente sin PilotOS → reutilizando id=${existingUser.id}`);
        } else {
            console.log(`[ONBOARDING] Caso A: usuario nuevo total → se creará en minos.Users`);
        }

        // DT-012: Toda la creación en una sola transacción
        const result = await prisma.$transaction(async (tx) => {

            // 1. Crear o reutilizar usuario patrón en minos.Users
            // Caso A: no existe → crear. Caso B: existe en NexOS → usar sin modificar.
            let patronUser;
            if (existingUser) {
                // Caso B: reutilizar usuario NexOS existente. NO modificar sus datos
                // (podría tener nombre/email configurados por otro producto como RentOS)
                patronUser = existingUser;
            } else {
                // Caso A: usuario nuevo total en NexOS
                patronUser = await tx.minosUser.create({
                    data: {
                        email,
                        nombre: onboarding.nombre_patron || 'Propietario',
                        telefono,
                        password_hash: 'ONBOARDING_INITIAL_STEP',
                        role: 'user',
                        estado_pago: 'AL DIA',
                    },
                });
            }

            // 2. Crear Cliente (DT-005: tenant key de PilotOS)
            const cliente = await tx.cliente.create({
                data: {
                    patron_id: patronUser.id,
                    nombre_comercial: onboarding.nombre_comercial,
                    tipo_actividad: onboarding.tipo_actividad || 'TAXI',
                },
            });

            // 3. Crear Conductor para el propietario (es_patron: true)
            const conductorPatron = await tx.conductor.create({
                data: {
                    cliente_id: cliente.id,
                    usuario_id: patronUser.id,
                    es_patron: true,
                },
            });

            // 4. Crear asalariados desde JSON (Fase 3)
            // Los asalariados usan email sintético telefono@pilotos.app (no necesitan Google Drive propio)
            const asalariados = (onboarding.asalariados as any[]) || [];
            const conductoresAsalariados = [];

            for (const asala of asalariados) {
                if (!asala.telefono) continue;

                const asalaEmail = `${asala.telefono}@pilotos.app`;

                const asalariadoUser = await tx.minosUser.upsert({
                    where: { email: asalaEmail },
                    update: {
                        nombre: asala.nombre || undefined,
                        telefono: asala.telefono,
                    },
                    create: {
                        nombre: asala.nombre || 'Conductor',
                        telefono: asala.telefono,
                        email: asalaEmail,
                        password_hash: 'ONBOARDING_ASALARIADO_INITIAL',
                        role: 'user',
                        estado_pago: 'AL DIA',
                    },
                });

                const cond = await tx.conductor.create({
                    data: {
                        cliente_id: cliente.id,
                        usuario_id: asalariadoUser.id,
                        es_patron: false,
                    },
                });
                conductoresAsalariados.push(cond);

                // 4.1 Configuración Económica específica para este conductor
                await tx.configuracionEconomica.create({
                    data: {
                        cliente_id: cliente.id,
                        conductor_id: cond.id,
                        modelo_reparto: asala.modelo_reparto || 'PORCENTAJE',
                        porcentaje_conductor: asala.porcentaje_conductor ?? 50,
                        porcentaje_patron: 100 - (asala.porcentaje_conductor ?? 50),
                        cuota_pilotos: 0,
                        incluye_combustible_en_reparto: true,
                    },
                });
            }

            // 5. Crear vehículo
            const vehiculo = await tx.vehiculo.create({
                data: {
                    cliente_id: cliente.id,
                    matricula: onboarding.matricula || '',
                    marca: onboarding.marca_modelo?.split(' ')[0] || '',
                    modelo: onboarding.marca_modelo?.split(' ').slice(1).join(' ') || '',
                    fecha_matriculacion: onboarding.fecha_matriculacion || new Date(),
                    tipo_combustible: onboarding.tipo_combustible || 'DIESEL',
                    tipo_transmision: onboarding.tipo_transmision || 'MANUAL',
                    km_actuales: onboarding.km_actuales || 0,
                },
            });

            // 6. Asignar conductores al vehículo
            await tx.vehiculoConductor.create({
                data: { vehiculo_id: vehiculo.id, conductor_id: conductorPatron.id },
            });
            for (const cond of conductoresAsalariados) {
                await tx.vehiculoConductor.create({
                    data: { vehiculo_id: vehiculo.id, conductor_id: cond.id },
                });
            }

            // 7. ConfiguracionEconomica base para el Propietario
            await tx.configuracionEconomica.create({
                data: {
                    cliente_id: cliente.id,
                    conductor_id: conductorPatron.id,
                    modelo_reparto: 'PORCENTAJE',
                    porcentaje_conductor: 0,
                    porcentaje_patron: 100,
                    cuota_pilotos: 0,
                    incluye_combustible_en_reparto: true,
                },
            });

            // 8. Gastos fijos dinámicos (Fase 5)
            const gastosFijos = (onboarding.gastos_fijos as any[]) || [];
            for (const gf of gastosFijos) {
                await tx.gastoFijo.create({
                    data: {
                        cliente_id: cliente.id,
                        vehiculo_id: vehiculo.id,
                        tipo: gf.tipo || 'OTRO',
                        descripcion: gf.descripcion || 'Gasto onboarding',
                        importe: gf.importe || 0,
                        periodicidad: gf.periodicidad || 'MENSUAL',
                    },
                });
            }

            // 9. Inicializar mantenimientos del vehículo
            const catalogo = await tx.mantenimientoCatalogo.findMany();
            for (const item of catalogo) {
                await tx.mantenimientoVehiculo.create({
                    data: {
                        vehiculo_id: vehiculo.id,
                        catalogo_id: item.id,
                        proximo_km: item.frecuencia_km ? vehiculo.km_actuales + item.frecuencia_km : null,
                        proxima_fecha: item.frecuencia_meses
                            ? new Date(Date.now() + item.frecuencia_meses * 30 * 24 * 60 * 60 * 1000)
                            : null,
                    },
                });
            }

            // 10. Marcar onboarding completado
            await tx.onboarding.update({
                where: { telefono: req.params.telefono },
                data: { completado: true },
            });

            // 11. Registrar evento en ledger
            await tx.ledgerEvento.create({
                data: {
                    tipo_evento: 'ONBOARDING_COMPLETADO',
                    source: 'PILOTOS',
                    dedupe_key: `onboarding-${cliente.id}`,
                    datos: { cliente_id: cliente.id, patron_id: patronUser.id },
                },
            });

            return { patronUser, cliente, conductorPatron, conductoresAsalariados, vehiculo };
        });

        res.json({
            status: 'OK',
            data: {
                cliente_id: result.cliente.id,
                patron_id: result.patronUser.id,
                vehiculo_id: result.vehiculo.id,
                conductores_asalariados_count: result.conductoresAsalariados.length,
            },
        });

    } catch (err: any) {
        console.error('[ONBOARDING] Error completando:', err.message);

        // C-023: Unique constraint — dar mensaje legible (última línea de defensa)
        if (err.code === 'P2002') {
            const field = err.meta?.target?.join(', ') || 'campo desconocido';
            res.status(409).json({
                status: 'FAIL',
                error: 'duplicate_data',
                message: `Ya existe un registro con ese valor (${field}). Puede que ya tengas una cuenta. Inicia sesión con tu teléfono.`,
            });
            return;
        }

        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            status: 'FAIL',
            error: 'server_error',
            message: isDev ? err.message : 'Error al completar el onboarding. Inténtalo de nuevo.',
        });
    }
});

// GET /api/onboarding/:telefono
router.get('/:telefono', async (req: Request, res: Response) => {
    try {
        const onboarding = await prisma.onboarding.findUnique({ where: { telefono: req.params.telefono } });
        if (!onboarding) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }
        res.json({ status: 'OK', data: onboarding });
    } catch (err: any) {
        console.error('[ONBOARDING] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
