import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { extraerTextoImagen, validarTicketTaximetro, validarTicketGasoil } from '../services/ocr.service';

const router = Router();
const prisma = new PrismaClient();

// Límite de intentos de reemplazo según regla R-FT-003
const MAX_INTENTOS_REEMPLAZO = 2;

// POST /api/fotos - Subir y validar foto
router.post('/', async (req: Request, res: Response) => {
    try {
        const { parteDiarioId, tipo, url } = req.body;

        // Validar parte existe
        const parte = await prisma.parteDiario.findUnique({
            where: { id: parteDiarioId },
            include: { conductor: true }
        });

        if (!parte) {
            return res.status(404).json({ error: 'Parte no encontrado' });
        }

        // R-FT-006: Verificar si hay tareas pendientes
        const tareaPendiente = await prisma.tareaPendiente.findFirst({
            where: {
                conductorId: parte.conductorId,
                resuelta: false
            }
        });

        if (tareaPendiente) {
            return res.status(403).json({
                error: 'Tienes tareas pendientes. Resuelve antes de continuar.',
                regla: 'R-FT-006',
                tareaId: tareaPendiente.id
            });
        }

        // Ejecutar OCR
        const ocrResult = await extraerTextoImagen(url);

        // Validar según tipo
        let validacion;
        if (tipo === 'TAXIMETRO') {
            validacion = validarTicketTaximetro(ocrResult.texto);
        } else {
            validacion = validarTicketGasoil(ocrResult.texto);
        }

        // Determinar estado de la foto
        let estado: string;
        if (!ocrResult.legible || !validacion.valido) {
            estado = 'ILEGIBLE';
        } else {
            estado = 'VALIDA';
        }

        // Crear registro de foto
        const foto = await prisma.fotoTicket.create({
            data: {
                parteDiarioId,
                tipo: tipo,
                url,
                estado,
                ocrTexto: ocrResult.texto,
                ocrConfianza: ocrResult.confianza,
                intentosReemplazo: 0
            }
        });

        // R-FT-001: Si es ilegible, crear tarea pendiente
        if (estado === 'ILEGIBLE') {
            await prisma.tareaPendiente.create({
                data: {
                    tipo: 'FOTO_ILEGIBLE',
                    entidadId: foto.id,
                    conductorId: parte.conductorId
                }
            });

            return res.status(201).json({
                data: foto,
                legible: false,
                mensaje: 'Foto ilegible. Sube otra foto para continuar.',
                regla: 'R-FT-001',
                evento: 'E-FT-001'
            });
        }

        res.status(201).json({
            data: foto,
            legible: true,
            validacion,
            evento: 'E-FT-002'
        });

    } catch (error) {
        console.error('Error procesando foto:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/fotos/:id/reemplazar - Reemplazar foto ilegible
router.post('/:id/reemplazar', async (req: Request, res: Response) => {
    try {
        const { url } = req.body;
        const fotoId = req.params.id;

        const fotoActual = await prisma.fotoTicket.findUnique({
            where: { id: fotoId },
            include: { parteDiario: true }
        });

        if (!fotoActual) {
            return res.status(404).json({ error: 'Foto no encontrada' });
        }

        // R-FT-003: Máximo 2 reemplazos
        if (fotoActual.intentosReemplazo >= MAX_INTENTOS_REEMPLAZO) {
            // R-FT-004: Bloquear foto
            await prisma.fotoTicket.update({
                where: { id: fotoId },
                data: { estado: 'BLOQUEADA' }
            });

            // R-FT-005: Crear incidencia manual obligatoria
            return res.status(403).json({
                error: 'Límite de reemplazos alcanzado. Foto bloqueada.',
                regla: 'R-FT-004',
                evento: 'E-FT-003',
                accion: 'Se debe crear incidencia manual para desbloquear'
            });
        }

        // Guardar historial
        await prisma.fotoHistorial.create({
            data: {
                fotoId,
                urlAnterior: fotoActual.url,
                motivo: `Reemplazo intento ${fotoActual.intentosReemplazo + 1}`
            }
        });

        // Ejecutar OCR en nueva imagen
        const ocrResult = await extraerTextoImagen(url);

        let validacion;
        if (fotoActual.tipo === 'TAXIMETRO') {
            validacion = validarTicketTaximetro(ocrResult.texto);
        } else {
            validacion = validarTicketGasoil(ocrResult.texto);
        }

        // Determinar nuevo estado
        let nuevoEstado: string;
        if (!ocrResult.legible || !validacion.valido) {
            nuevoEstado = 'ILEGIBLE';
        } else {
            nuevoEstado = 'REEMPLAZADA';
        }

        // Actualizar foto
        const fotoActualizada = await prisma.fotoTicket.update({
            where: { id: fotoId },
            data: {
                url,
                estado: nuevoEstado,
                ocrTexto: ocrResult.texto,
                ocrConfianza: ocrResult.confianza,
                intentosReemplazo: fotoActual.intentosReemplazo + 1
            }
        });

        // Si ahora es válida, resolver tarea pendiente
        if (nuevoEstado === 'REEMPLAZADA') {
            await prisma.tareaPendiente.updateMany({
                where: {
                    entidadId: fotoId,
                    tipo: 'FOTO_ILEGIBLE',
                    resuelta: false
                },
                data: {
                    resuelta: true,
                    resolvedAt: new Date()
                }
            });

            // Actualizar estado del parte
            await prisma.parteDiario.update({
                where: { id: fotoActual.parteDiarioId },
                data: { estado: 'FOTO_SUSTITUIDA' }
            });
        }

        res.json({
            data: fotoActualizada,
            legible: nuevoEstado !== 'ILEGIBLE',
            intentosRestantes: MAX_INTENTOS_REEMPLAZO - fotoActualizada.intentosReemplazo,
            evento: nuevoEstado === 'REEMPLAZADA' ? 'E-PD-007' : 'E-FT-001'
        });

    } catch (error) {
        console.error('Error reemplazando foto:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/fotos/:id/historial - Ver historial de reemplazos
router.get('/:id/historial', async (req: Request, res: Response) => {
    try {
        const historial = await prisma.fotoHistorial.findMany({
            where: { fotoId: req.params.id },
            orderBy: { createdAt: 'asc' }
        });

        res.json({ data: historial });

    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

export default router;
