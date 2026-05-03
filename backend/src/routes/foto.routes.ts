/**
 * Documentos/Fotos routes — Modelo documental evolucionado (DT-008).
 * Usa Documento + DocumentoEnlace en lugar del legacy FotoTicket.
 * Mantiene reglas R-FT-* para fotos de tickets.
 *
 * Cambios fase 1+2:
 *   - El hash_sha256 viene del endpoint /api/upload (sha256 del fichero real).
 *   - Si ya existe un Documento con el mismo hash, se reutiliza y se crea solo el enlace.
 *   - Si ya está vinculado a este parte, se devuelve duplicado:true sin duplicar nada.
 *   - El frontend recibe `legible` y `duplicado` para informar al usuario.
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { extraerTextoImagen, validarTicketTaximetro, validarTicketGasoil } from '../services/ocr.service';
import crypto from 'crypto';

const router = Router();
const MAX_INTENTOS_REEMPLAZO = 2; // R-FT-003

// POST /api/fotos — Subir y validar documento/foto
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { parte_diario_id, tipo, url, hash_sha256 } = req.body;
        if (!parte_diario_id || !tipo || !url) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields' });
            return;
        }

        const parte = await prisma.parteDiario.findUnique({ where: { id: parte_diario_id } });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'parte_not_found' }); return; }

        // Hash: preferimos el del upload (sha256 del fichero real). Fallback: hash de la URL.
        const hashFinal = hash_sha256 && /^[0-9a-f]{64}$/i.test(hash_sha256)
            ? hash_sha256
            : crypto.createHash('sha256').update(String(url)).digest('hex');

        // Deduplicación: ¿ya existe un Documento con el mismo hash?
        const existente = await prisma.documento.findFirst({
            where: { hash_sha256: hashFinal },
            include: { enlaces: true },
        });

        if (existente) {
            const yaVinculado = existente.enlaces.some(
                (e) => e.entidad_tipo === 'PARTE_DIARIO' && e.entidad_id === parte_diario_id
            );
            if (yaVinculado) {
                res.status(200).json({
                    status: 'OK',
                    data: existente,
                    legible: existente.estado !== 'ILEGIBLE' && existente.estado !== 'BLOQUEADO',
                    duplicado: true,
                    motivo: 'ya_vinculado',
                });
                return;
            }
            // Existe pero no está vinculado a este parte → reutilizamos documento, creamos enlace.
            await prisma.documentoEnlace.create({
                data: { documento_id: existente.id, entidad_tipo: 'PARTE_DIARIO', entidad_id: parte_diario_id },
            });
            res.status(200).json({
                status: 'OK',
                data: existente,
                legible: existente.estado !== 'ILEGIBLE' && existente.estado !== 'BLOQUEADO',
                duplicado: true,
                motivo: 'reutilizado_otro_parte',
            });
            return;
        }

        // Documento nuevo: OCR + validación + crear documento + enlace.
        const ocrResult = await extraerTextoImagen(url);
        const validacion = tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const estado = (!ocrResult.legible || !validacion.valido) ? 'ILEGIBLE' : 'VALIDO';

        const result = await prisma.$transaction(async (tx) => {
            const documento = await tx.documento.create({
                data: {
                    tipo,
                    url,
                    hash_sha256: hashFinal,
                    estado,
                    ocr_texto: ocrResult.texto,
                    ocr_confianza: ocrResult.confianza,
                    ocr_datos_extraidos: validacion as any,
                    intentos_reemplazo: 0,
                    subido_por_usuario_id: req.usuario?.id,
                },
            });

            await tx.documentoEnlace.create({
                data: { documento_id: documento.id, entidad_tipo: 'PARTE_DIARIO', entidad_id: parte_diario_id },
            });

            if (estado === 'ILEGIBLE') {
                await tx.tareaPendiente.create({
                    data: { tipo: 'FOTO_ILEGIBLE', entidad_tipo: 'DOCUMENTO', entidad_id: documento.id, conductor_id: parte.conductor_id },
                });
            }

            return documento;
        });

        res.status(201).json({
            status: 'OK',
            data: result,
            legible: estado !== 'ILEGIBLE',
            duplicado: false,
            evento: estado === 'ILEGIBLE' ? 'E-FT-001' : 'E-FT-002',
        });
    } catch (err: any) {
        console.error('[FOTOS] Error:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// POST /api/fotos/:id/reemplazar — Reemplazar documento ilegible
router.post('/:id/reemplazar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { url, hash_sha256 } = req.body;
        const docId = req.params.id;

        const docActual = await prisma.documento.findUnique({ where: { id: docId } });
        if (!docActual) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }

        if (docActual.intentos_reemplazo >= MAX_INTENTOS_REEMPLAZO) {
            await prisma.documento.update({ where: { id: docId }, data: { estado: 'BLOQUEADO' } });
            res.status(403).json({ status: 'FAIL', error: 'max_replacements', regla: 'R-FT-004', evento: 'E-FT-004' });
            return;
        }

        const ocrResult = await extraerTextoImagen(url);
        const validacion = docActual.tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const nuevoEstado = (!ocrResult.legible || !validacion.valido) ? 'ILEGIBLE' : 'REEMPLAZADO';
        const hashFinal = hash_sha256 && /^[0-9a-f]{64}$/i.test(hash_sha256) ? hash_sha256 : docActual.hash_sha256;

        const result = await prisma.$transaction(async (tx) => {
            await tx.documentoHistorial.create({
                data: { documento_id: docId, url_anterior: docActual.url, motivo: `Reemplazo intento ${docActual.intentos_reemplazo + 1}` },
            });

            const updated = await tx.documento.update({
                where: { id: docId },
                data: {
                    url,
                    hash_sha256: hashFinal,
                    estado: nuevoEstado,
                    ocr_texto: ocrResult.texto,
                    ocr_confianza: ocrResult.confianza,
                    ocr_datos_extraidos: validacion as any,
                    intentos_reemplazo: docActual.intentos_reemplazo + 1,
                },
            });

            if (nuevoEstado === 'REEMPLAZADO') {
                await tx.tareaPendiente.updateMany({
                    where: { entidad_id: docId, tipo: 'FOTO_ILEGIBLE', resuelta: false },
                    data: { resuelta: true, resolved_at: new Date() },
                });
                const enlace = await tx.documentoEnlace.findFirst({
                    where: { documento_id: docId, entidad_tipo: 'PARTE_DIARIO' },
                });
                if (enlace) {
                    await tx.parteDiario.update({ where: { id: enlace.entidad_id }, data: { estado: 'FOTO_SUSTITUIDA' } });
                }
            }

            return updated;
        });

        res.json({
            status: 'OK',
            data: result,
            legible: nuevoEstado !== 'ILEGIBLE',
            intentos_restantes: MAX_INTENTOS_REEMPLAZO - result.intentos_reemplazo,
            evento: nuevoEstado === 'REEMPLAZADO' ? 'E-PD-007' : 'E-FT-001',
        });
    } catch (err: any) {
        console.error('[FOTOS] Error reemplazando:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// GET /api/fotos/:id/historial
router.get('/:id/historial', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const historial = await prisma.documentoHistorial.findMany({
            where: { documento_id: req.params.id },
            orderBy: { created_at: 'asc' },
        });
        res.json({ status: 'OK', data: historial });
    } catch (err: any) {
        console.error('[FOTOS] Error historial:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
