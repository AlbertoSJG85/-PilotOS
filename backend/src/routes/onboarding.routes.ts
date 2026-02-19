import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/onboarding - Guardar datos de onboarding
router.post('/', async (req: Request, res: Response) => {
    try {
        const rawData = req.body;

        // Sanitizar y convertir tipos de forma agresiva para evitar errores
        const data = {
            ...rawData,
            kmActuales: rawData.kmActuales ? Number(rawData.kmActuales) : 0,
            importeAutonomo: rawData.importeAutonomo ? Number(rawData.importeAutonomo) : null,
            importeEmisora: rawData.importeEmisora ? Number(rawData.importeEmisora) : null,
            // Si la fecha viene vacía o inválida, usamos undefined para que Prisma la ignore o null
            fechaMatriculacion: rawData.fechaMatriculacion ? new Date(rawData.fechaMatriculacion) : undefined,
            seguroVigencia: rawData.seguroVigencia ? new Date(rawData.seguroVigencia) : undefined,
            // Asegurar booleanos
            tieneAsalariado: Boolean(rawData.tieneAsalariado),
            tieneEmisora: Boolean(rawData.tieneEmisora),
            completado: false // Forzar false al principio
        };

        // Eliminar campos vacíos que puedan dar problemas si son unique
        if (data.emailPatron === '') data.emailPatron = null;
        if (data.matricula === '') data.matricula = null;
        if (data.telefono === '') throw new Error('El teléfono es obligatorio');

        // Upsert por teléfono
        const onboarding = await prisma.onboarding.upsert({
            where: { telefono: data.telefono },
            update: data,
            create: data
        });

        res.status(201).json({ data: onboarding });
    } catch (error) {
        console.error('Error guardando onboarding:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/onboarding/:telefono/completar - Completar onboarding y crear entidades
router.post('/:telefono/completar', async (req: Request, res: Response) => {
    console.log('🏁 Iniciando completado de onboarding para:', req.params.telefono);
    try {
        const onboarding = await prisma.onboarding.findUnique({
            where: { telefono: req.params.telefono }
        });

        if (!onboarding) {
            return res.status(404).json({ error: 'Onboarding no encontrado' });
        }

        if (onboarding.completado) {
            return res.status(400).json({ error: 'Onboarding ya completado' });
        }

        // Crear patrón
        console.log('👤 Creando patrón...');
        const patron = await prisma.usuario.create({
            data: {
                telefono: onboarding.telefono,
                email: onboarding.emailPatron,
                nombre: onboarding.nombrePatron || 'Patrón',
                rol: 'PATRON'
            }
        });

        // Crear asalariado si aplica
        let asalariado = null;
        if (onboarding.tieneAsalariado && onboarding.telefonoAsalariado) {
            asalariado = await prisma.usuario.create({
                data: {
                    telefono: onboarding.telefonoAsalariado,
                    nombre: onboarding.nombreAsalariado || 'Conductor',
                    rol: 'CONDUCTOR',
                    patronId: patron.id
                }
            });
        }

        // Crear vehículo
        console.log('🚗 Creando vehículo...');
        const vehiculo = await prisma.vehiculo.create({
            data: {
                matricula: onboarding.matricula || '',
                marca: onboarding.marcaModelo?.split(' ')[0] || '',
                modelo: onboarding.marcaModelo?.split(' ').slice(1).join(' ') || '',
                fechaMatriculacion: onboarding.fechaMatriculacion || new Date(),
                tipoCombustible: onboarding.tipoCombustible || 'DIESEL',
                tipoTransmision: onboarding.tipoTransmision || 'MANUAL',
                kmActuales: onboarding.kmActuales || 0
            }
        });

        // Asignar conductor(es) al vehículo
        await prisma.vehiculoConductor.create({
            data: {
                vehiculoId: vehiculo.id,
                conductorId: patron.id
            }
        });

        if (asalariado) {
            await prisma.vehiculoConductor.create({
                data: {
                    vehiculoId: vehiculo.id,
                    conductorId: asalariado.id
                }
            });
        }

        // Crear gastos fijos
        if (onboarding.importeAutonomo) {
            await prisma.gastoFijo.create({
                data: {
                    tipo: 'AUTONOMO',
                    descripcion: 'Cuota autónomo',
                    importe: onboarding.importeAutonomo,
                    periodicidad: 'MENSUAL'
                }
            });
        }

        if (onboarding.tieneEmisora && onboarding.importeEmisora) {
            await prisma.gastoFijo.create({
                data: {
                    vehiculoId: vehiculo.id,
                    tipo: 'EMISORA',
                    descripcion: 'Emisora taxi',
                    importe: onboarding.importeEmisora,
                    periodicidad: 'MENSUAL'
                }
            });
        }

        // Inicializar mantenimientos del vehículo
        const catalogoItems = await prisma.mantenimientoCatalogo.findMany();
        for (const item of catalogoItems) {
            await prisma.mantenimientoVehiculo.create({
                data: {
                    vehiculoId: vehiculo.id,
                    catalogoId: item.id,
                    proximoKm: item.frecuenciaKm ? vehiculo.kmActuales + item.frecuenciaKm : null,
                    proximaFecha: item.frecuenciaMeses
                        ? new Date(Date.now() + item.frecuenciaMeses * 30 * 24 * 60 * 60 * 1000)
                        : null
                }
            });
        }

        // Marcar onboarding como completado
        await prisma.onboarding.update({
            where: { telefono: req.params.telefono },
            data: { completado: true }
        });

        res.json({
            success: true,
            data: {
                patron,
                asalariado,
                vehiculo
            }
        });

    } catch (error) {
        console.error('Error FULL completando onboarding:', error); // LOG DETALLADO
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
        res.status(500).json({ error: 'Error interno: ' + (error as Error).message });
    }
});

// GET /api/onboarding/:telefono - Obtener estado de onboarding
router.get('/:telefono', async (req: Request, res: Response) => {
    try {
        const onboarding = await prisma.onboarding.findUnique({
            where: { telefono: req.params.telefono }
        });
        if (!onboarding) {
            return res.status(404).json({ error: 'Onboarding no encontrado' });
        }
        res.json({ data: onboarding });
    } catch (error) {
        console.error('Error obteniendo onboarding:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
