/**
 * Documentos/Fotos routes — Modelo documental (DT-008).
 * Usa Documento + DocumentoEnlace en lugar del legacy FotoTicket.
 *
 * Reglas R-FT-*:
 *   R-FT-001: Foto ilegible → TareaPendiente.
 *   R-FT-003: Máximo MAX_INTENTOS_REEMPLAZO sustituciones físicas.
 *   R-FT-004: Tras agotar intentos → BLOQUEADO + Anomalía.
 *   R-FT-007: reintentar-ocr no consume intentos de reemplazo.
 *
 * Seguridad: todos los endpoints validan tenencia (cliente_id).
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { extraerTextoImagen, validarTicketTaximetro, validarTicketGasoil } from '../services/ocr.service';
import crypto from 'crypto';

const router = Router();
const MAX_INTENTOS_REEMPLAZO = 2; // R-FT-003

// ─────────────────────────────────────────────────────────
// Helper de tenencia: dado un docId, devuelve el cliente_id del parte vinculado
// ─────────────────────────────────────────────────────────

async function getDocClienteId(docId: string): Promise<string | null> {
    const enlace = await prisma.documentoEnlace.findFirst({
        where: { documento_id: docId },
        include: {
            parteDiario: {
                include: { vehiculo: { select: { cliente_id: true } } },
            },
        },
    });
    return enlace?.parteDiario?.vehiculo?.cliente_id ?? null;
}

function verificarTenencia(
    docClienteId: string | null,
    usuario: AuthRequest['usuario'],
): boolean {
    if (!usuario) return false;
    if (usuario.role === 'admin') return true;
    if (!docClienteId || !usuario.cliente_id) return false;
    return docClienteId === usuario.cliente_id;
}

function estadoOcrFinal(ocrLegible: boolean, validacionValida: boolean): string {
    return (!ocrLegible || !validacionValida) ? 'ILEGIBLE' : 'VALIDO';
}

// ─────────────────────────────────────────────────────────
// POST /api/fotos — Subir y validar documento/foto
// ─────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { parte_diario_id, tipo, url, hash_sha256 } = req.body;
        if (!parte_diario_id || !tipo || !url) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields' });
            return;
        }

        const parte = await prisma.parteDiario.findUnique({
            where: { id: parte_diario_id },
            include: { vehiculo: { select: { cliente_id: true } } },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'parte_not_found' }); return; }

        // Tenancy check
        if (!verificarTenencia(parte.vehiculo?.cliente_id ?? null, req.usuario)) {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }

        const hashFinal = hash_sha256 && /^[0-9a-f]{64}$/i.test(hash_sha256)
            ? hash_sha256
            : crypto.createHash('sha256').update(String(url)).digest('hex');

        // Deduplicación por hash
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

        // Documento nuevo: OCR
        const ocrResult = await extraerTextoImagen(url);
        const validacion = tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const estado = estadoOcrFinal(ocrResult.legible, validacion.valido);
        const estado_ocr = ocrResult.error_ocr ? 'ERROR' : 'PROCESADO';

        const result = await prisma.$transaction(async (tx) => {
            const documento = await tx.documento.create({
                data: {
                    tipo,
                    url,
                    hash_sha256: hashFinal,
                    estado,
                    ocr_texto: ocrResult.texto,
                    ocr_confianza: ocrResult.confianza,
                    ocr_datos_extraidos: { ...validacion, error_ocr: ocrResult.error_ocr } as any,
                    ocr_error: ocrResult.error_ocr ?? null,
                    estado_ocr,
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

// ─────────────────────────────────────────────────────────
// POST /api/fotos/:id/reemplazar — Sustituir foto ilegible (R-FT-003)
// ─────────────────────────────────────────────────────────
router.post('/:id/reemplazar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { url, hash_sha256 } = req.body;
        const docId = req.params.id;

        const docActual = await prisma.documento.findUnique({ where: { id: docId } });
        if (!docActual) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }

        // Tenancy
        const docClienteId = await getDocClienteId(docId);
        if (!verificarTenencia(docClienteId, req.usuario)) {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }

        if (docActual.intentos_reemplazo >= MAX_INTENTOS_REEMPLAZO) {
            await prisma.documento.update({ where: { id: docId }, data: { estado: 'BLOQUEADO' } });
            res.status(403).json({ status: 'FAIL', error: 'max_replacements', regla: 'R-FT-004', evento: 'E-FT-004' });
            return;
        }

        const ocrResult = await extraerTextoImagen(url);
        const validacion = docActual.tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const nuevoEstado = estadoOcrFinal(ocrResult.legible, validacion.valido) === 'ILEGIBLE'
            ? 'ILEGIBLE'
            : 'REEMPLAZADO';
        const hashFinal = hash_sha256 && /^[0-9a-f]{64}$/i.test(hash_sha256) ? hash_sha256 : docActual.hash_sha256;
        const estado_ocr = ocrResult.error_ocr ? 'ERROR' : 'PROCESADO';

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
                    ocr_error: ocrResult.error_ocr ?? null,
                    estado_ocr,
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

// ─────────────────────────────────────────────────────────
// POST /api/fotos/:id/reintentar-ocr — Re-procesar OCR sin sustituir fichero (R-FT-007)
// ─────────────────────────────────────────────────────────
router.post('/:id/reintentar-ocr', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const docId = req.params.id;
        const doc = await prisma.documento.findUnique({ where: { id: docId } });
        if (!doc) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }

        // Tenancy
        const docClienteId = await getDocClienteId(docId);
        if (!verificarTenencia(docClienteId, req.usuario)) {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }

        const ocrResult = await extraerTextoImagen(doc.url);
        const validacion = doc.tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const nuevoEstado = estadoOcrFinal(ocrResult.legible, validacion.valido);
        const estado_ocr = ocrResult.error_ocr ? 'ERROR' : 'PROCESADO';

        const updated = await prisma.$transaction(async (tx) => {
            const u = await tx.documento.update({
                where: { id: docId },
                data: {
                    estado: nuevoEstado,
                    ocr_texto: ocrResult.texto,
                    ocr_confianza: ocrResult.confianza,
                    ocr_datos_extraidos: validacion as any,
                    ocr_error: ocrResult.error_ocr ?? null,
                    estado_ocr,
                },
            });

            // Si ahora es legible, resolver la TareaPendiente
            if (nuevoEstado === 'VALIDO') {
                await tx.tareaPendiente.updateMany({
                    where: { entidad_id: docId, tipo: 'FOTO_ILEGIBLE', resuelta: false },
                    data: { resuelta: true, resolved_at: new Date() },
                });
            }

            return u;
        });

        res.json({
            status: 'OK',
            data: updated,
            legible: nuevoEstado === 'VALIDO',
            evento: nuevoEstado === 'VALIDO' ? 'E-FT-002' : 'E-FT-001',
        });
    } catch (err: any) {
        console.error('[FOTOS] Error reintentando OCR:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/fotos/:id — Desvincular documento de un parte (solo BORRADOR)
// ─────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const docId = req.params.id;
        const { parte_id } = req.body;
        if (!parte_id) {
            res.status(400).json({ status: 'FAIL', error: 'missing_parte_id' });
            return;
        }

        const doc = await prisma.documento.findUnique({ where: { id: docId } });
        if (!doc) { res.status(404).json({ status: 'FAIL', error: 'not_found' }); return; }

        const parte = await prisma.parteDiario.findUnique({
            where: { id: parte_id },
            include: { vehiculo: { select: { cliente_id: true } } },
        });
        if (!parte) { res.status(404).json({ status: 'FAIL', error: 'parte_not_found' }); return; }

        // Solo se puede desvincular si el parte está en BORRADOR (R-PD-017)
        if (parte.estado !== 'BORRADOR') {
            res.status(409).json({ status: 'FAIL', error: 'parte_not_borrador', regla: 'R-PD-017' });
            return;
        }

        // Tenancy
        if (!verificarTenencia(parte.vehiculo?.cliente_id ?? null, req.usuario)) {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }

        const enlace = await prisma.documentoEnlace.findFirst({
            where: { documento_id: docId, entidad_tipo: 'PARTE_DIARIO', entidad_id: parte_id },
        });
        if (!enlace) {
            res.status(404).json({ status: 'FAIL', error: 'enlace_not_found' });
            return;
        }

        await prisma.documentoEnlace.delete({ where: { id: enlace.id } });

        // Si no quedan más enlaces, marcar como huérfano (no se elimina el fichero ni el registro)
        const restantes = await prisma.documentoEnlace.count({ where: { documento_id: docId } });
        if (restantes === 0) {
            console.log(`[FOTOS] Documento ${docId} sin enlaces tras desvinculación`);
        }

        res.json({ status: 'OK' });
    } catch (err: any) {
        console.error('[FOTOS] Error desvinculando:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/fotos/:id/historial
// ─────────────────────────────────────────────────────────
router.get('/:id/historial', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const docId = req.params.id;

        // Tenancy
        const docClienteId = await getDocClienteId(docId);
        if (!verificarTenencia(docClienteId, req.usuario)) {
            res.status(403).json({ status: 'FAIL', error: 'forbidden' });
            return;
        }

        const historial = await prisma.documentoHistorial.findMany({
            where: { documento_id: docId },
            orderBy: { created_at: 'asc' },
        });
        res.json({ status: 'OK', data: historial });
    } catch (err: any) {
        console.error('[FOTOS] Error historial:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
