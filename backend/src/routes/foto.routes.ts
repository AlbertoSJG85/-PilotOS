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
 * Estados del Documento:
 *   VALIDO              → OCR extrajo datos clave correctamente.
 *   PENDIENTE_REVISION  → OCR funcionó y extrajo texto, pero la validación
 *                          estructurada no detectó todos los campos (la foto
 *                          es legible para humanos; basta con revisar a ojo).
 *   ILEGIBLE            → Imagen corrupta, OCR falló por completo o no
 *                          devolvió texto utilizable. Requiere reemplazo.
 *   REEMPLAZADO         → La foto fue sustituida por otra válida.
 *   BLOQUEADO           → Se agotaron los intentos de reemplazo (R-FT-004).
 *
 * Seguridad: todos los endpoints validan tenencia (cliente_id).
 */
import { Router, Response } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { extraerTextoImagen, validarTicketTaximetro, validarTicketGasoil, analizarImagen } from '../services/ocr.service';
import { compararDocumentosConParte } from '../services/ocrComparacion.service';
import { aplicarRetencion } from '../services/retencionParte.service';
import crypto from 'crypto';

// Convierte una URL pública de uploads a ruta local del disco.
// Sharp y Tesseract necesitan rutas de fichero, no URLs HTTP.
// Limpia query string y fragmentos por si llegan (?v=1, #frag).
function urlToLocalPath(url: string): string {
    const sinQuery = url.split('?')[0].split('#')[0];
    const filename = sinQuery.split('/').pop() ?? '';
    return path.join(process.cwd(), 'uploads', filename);
}

/**
 * Re-ejecuta la comparación parte↔ticket si el parte ya está enviado.
 * El camino "patrón" crea el parte en ENVIADO antes de subir las fotos, así
 * que la comparación que vive en /confirmar (camino asalariado) nunca se
 * dispararía. Llamamos a esta función al final de cada operación que añade,
 * sustituye o re-procesa un documento. Es idempotente (anomalias previas se
 * borran al inicio de compararDocumentosConParte).
 *
 * Y aplica la retención (2026-08-12): si aparecen discrepancias el parte deja
 * de contar en los globales, y si al sustituir una foto desaparecen todas,
 * vuelve a contar solo. Tiene que estar aquí y no solo en /confirmar porque
 * el patrón sube las fotos DESPUÉS de crear el parte.
 */
async function recompararSiEnviado(parte_diario_id: string): Promise<number> {
    try {
        const p = await prisma.parteDiario.findUnique({
            where: { id: parte_diario_id },
            select: { estado: true },
        });
        if (!p) return 0;
        if (p.estado === 'BORRADOR') return 0;
        const r = await compararDocumentosConParte(parte_diario_id);
        await aplicarRetencion(parte_diario_id, r.total_discrepancias);
        return r.total_discrepancias;
    } catch (e: any) {
        console.warn('[FOTOS] Recomparación fallida:', e.message);
        return 0;
    }
}

const router = Router();

/**
 * Qué papel se está leyendo. El lector por visión lo usa para saber qué
 * esperar (C-068): sabiendo que es un ticket de taxímetro, entiende que
 * "Borrados" lleva detrás un contador que sube de uno en uno, y no lo lee
 * como si fuera un importe.
 */
const CONTEXTO_TICKET = 'ticket de taxímetro o de gasolinera, impreso en papel térmico';
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

/**
 * Decide el estado final del documento.
 *
 * Regla central de V1: ILEGIBLE depende SOLO del análisis visual de la imagen,
 * NUNCA de lo que devuelva Tesseract. Si la imagen se ve bien aunque el OCR
 * falle, el documento queda en PENDIENTE_REVISION para que el usuario revise
 * los datos manualmente — no se le exige resubir nada.
 *
 * Casos:
 *   - Imagen NO procesable visualmente (Sharp falla, dimensiones absurdas,
 *     foto monocromática/negra/blanca) → ILEGIBLE.
 *   - Imagen procesable + OCR útil + validación estructurada correcta → VALIDO.
 *   - Imagen procesable y todo lo demás (OCR vacío, OCR roto, validación
 *     incompleta) → PENDIENTE_REVISION.
 */
function estadoOcrFinal(
    imagenProcesable: boolean,
    ocrTexto: string,
    ocrError: string | undefined,
    validacionValida: boolean,
): string {
    if (!imagenProcesable) return 'ILEGIBLE';
    const textoUtil = (ocrTexto ?? '').trim().length > 0;
    if (validacionValida && textoUtil && !ocrError) return 'VALIDO';
    return 'PENDIENTE_REVISION';
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
            // Si el documento existente quedó en ILEGIBLE (probablemente por la
            // lógica antigua que confundía OCR débil con imagen ilegible), lo
            // reprocesamos con la pipeline nueva antes de reutilizarlo. Esto
            // recupera automáticamente documentos legacy sin tocar la BD.
            let docFinal = existente;
            if (existente.estado === 'ILEGIBLE') {
                const localPathReproc = urlToLocalPath(existente.url);
                const analisisReproc = await analizarImagen(localPathReproc);
                const ocrReproc = analisisReproc.procesable
                    ? await extraerTextoImagen(localPathReproc, CONTEXTO_TICKET)
                    : { texto: '', confianza: 0, legible: false, error_ocr: analisisReproc.motivo as string };
                const validacionReproc = existente.tipo === 'TICKET_TAXIMETRO'
                    ? validarTicketTaximetro(ocrReproc.texto)
                    : validarTicketGasoil(ocrReproc.texto);
                const estadoReproc = estadoOcrFinal(analisisReproc.procesable, ocrReproc.texto, ocrReproc.error_ocr, validacionReproc.valido);
                const estado_ocr_reproc = ocrReproc.error_ocr ? 'ERROR' : (ocrReproc.texto.trim() ? 'PROCESADO' : 'PENDIENTE');

                if (estadoReproc !== 'ILEGIBLE') {
                    docFinal = await prisma.documento.update({
                        where: { id: existente.id },
                        data: {
                            estado: estadoReproc,
                            ocr_texto: ocrReproc.texto,
                            ocr_confianza: ocrReproc.confianza,
                            ocr_datos_extraidos: { ...validacionReproc, error_ocr: ocrReproc.error_ocr } as any,
                            ocr_error: ocrReproc.error_ocr ?? null,
                            estado_ocr: estado_ocr_reproc,
                        },
                        include: { enlaces: true } as any,
                    }) as any;
                    // Cerrar tareas pendientes "FOTO_ILEGIBLE" residuales
                    await prisma.tareaPendiente.updateMany({
                        where: { entidad_id: existente.id, tipo: 'FOTO_ILEGIBLE', resuelta: false },
                        data: { resuelta: true, resolved_at: new Date() },
                    });
                }
            }

            const yaVinculado = existente.enlaces.some(
                (e) => e.entidad_tipo === 'PARTE_DIARIO' && e.entidad_id === parte_diario_id
            );
            if (yaVinculado) {
                const discrepancias = await recompararSiEnviado(parte_diario_id);
                res.status(200).json({
                    status: 'OK',
                    data: docFinal,
                    legible: docFinal.estado !== 'ILEGIBLE' && docFinal.estado !== 'BLOQUEADO',
                    estado: docFinal.estado,
                    duplicado: true,
                    motivo: 'ya_vinculado',
                    discrepancias,
                });
                return;
            }
            await prisma.documentoEnlace.create({
                data: { documento_id: existente.id, entidad_tipo: 'PARTE_DIARIO', entidad_id: parte_diario_id },
            });
            const discrepancias = await recompararSiEnviado(parte_diario_id);
            res.status(200).json({
                status: 'OK',
                data: docFinal,
                legible: docFinal.estado !== 'ILEGIBLE' && docFinal.estado !== 'BLOQUEADO',
                estado: docFinal.estado,
                duplicado: true,
                motivo: 'reutilizado_otro_parte',
                discrepancias,
            });
            return;
        }

        // Documento nuevo: primero análisis visual, luego OCR. Sólo el análisis
        // visual puede declarar la imagen como ILEGIBLE. El OCR es opcional.
        const localPath = urlToLocalPath(url);
        const analisis = await analizarImagen(localPath);

        const ocrResult = analisis.procesable
            ? await extraerTextoImagen(localPath, CONTEXTO_TICKET)
            : { texto: '', confianza: 0, legible: false, error_ocr: analisis.motivo as string };

        const validacion = tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const estado = estadoOcrFinal(analisis.procesable, ocrResult.texto, ocrResult.error_ocr, validacion.valido);
        const estado_ocr = ocrResult.error_ocr ? 'ERROR' : (ocrResult.texto.trim() ? 'PROCESADO' : 'PENDIENTE');

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

            // Solo se abre tarea de "foto ilegible" cuando la imagen es realmente
            // inutilizable. PENDIENTE_REVISION no genera tarea: el usuario puede
            // verificar los datos a ojo durante la confirmación del parte.
            if (estado === 'ILEGIBLE') {
                await tx.tareaPendiente.create({
                    data: { tipo: 'FOTO_ILEGIBLE', entidad_tipo: 'DOCUMENTO', entidad_id: documento.id, conductor_id: parte.conductor_id },
                });
            }

            return documento;
        });

        const discrepancias = await recompararSiEnviado(parte_diario_id);
        res.status(201).json({
            status: 'OK',
            data: result,
            legible: estado !== 'ILEGIBLE',
            estado,
            duplicado: false,
            evento: estado === 'ILEGIBLE' ? 'E-FT-001' : 'E-FT-002',
            discrepancias,
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

        const localPath = urlToLocalPath(url);
        const analisis = await analizarImagen(localPath);
        const ocrResult = analisis.procesable
            ? await extraerTextoImagen(localPath, CONTEXTO_TICKET)
            : { texto: '', confianza: 0, legible: false, error_ocr: analisis.motivo as string };
        const validacion = docActual.tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        // En reemplazo: el flujo histórico marcaba la nueva foto como
        // REEMPLAZADO si se aceptaba. Mantenemos ese contrato cuando la
        // foto entrante es aprovechable (VALIDO o PENDIENTE_REVISION) y
        // dejamos ILEGIBLE solo cuando la imagen es realmente inservible.
        const estadoCalculado = estadoOcrFinal(analisis.procesable, ocrResult.texto, ocrResult.error_ocr, validacion.valido);
        const nuevoEstado = estadoCalculado === 'ILEGIBLE' ? 'ILEGIBLE' : 'REEMPLAZADO';
        const hashFinal = hash_sha256 && /^[0-9a-f]{64}$/i.test(hash_sha256) ? hash_sha256 : docActual.hash_sha256;
        const estado_ocr = ocrResult.error_ocr ? 'ERROR' : (ocrResult.texto.trim() ? 'PROCESADO' : 'PENDIENTE');

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

        // Recomparar si el parte vinculado ya está enviado (mismo motivo que en POST /api/fotos).
        const enlaceParte = await prisma.documentoEnlace.findFirst({
            where: { documento_id: docId, entidad_tipo: 'PARTE_DIARIO' },
            select: { entidad_id: true },
        });
        const discrepancias = enlaceParte ? await recompararSiEnviado(enlaceParte.entidad_id) : 0;

        res.json({
            status: 'OK',
            data: result,
            legible: nuevoEstado !== 'ILEGIBLE',
            estado: nuevoEstado,
            estado_ocr_calculado: estadoCalculado,
            intentos_restantes: MAX_INTENTOS_REEMPLAZO - result.intentos_reemplazo,
            evento: nuevoEstado === 'REEMPLAZADO' ? 'E-PD-007' : 'E-FT-001',
            discrepancias,
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

        const localPath = urlToLocalPath(doc.url);
        const analisis = await analizarImagen(localPath);
        const ocrResult = analisis.procesable
            ? await extraerTextoImagen(localPath, CONTEXTO_TICKET)
            : { texto: '', confianza: 0, legible: false, error_ocr: analisis.motivo as string };
        const validacion = doc.tipo === 'TICKET_TAXIMETRO'
            ? validarTicketTaximetro(ocrResult.texto)
            : validarTicketGasoil(ocrResult.texto);

        const nuevoEstado = estadoOcrFinal(analisis.procesable, ocrResult.texto, ocrResult.error_ocr, validacion.valido);
        const estado_ocr = ocrResult.error_ocr ? 'ERROR' : (ocrResult.texto.trim() ? 'PROCESADO' : 'PENDIENTE');

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

            // Si ahora la foto es aprovechable (VALIDO o PENDIENTE_REVISION),
            // cerramos la tarea de "foto ilegible" si existía.
            if (nuevoEstado !== 'ILEGIBLE') {
                await tx.tareaPendiente.updateMany({
                    where: { entidad_id: docId, tipo: 'FOTO_ILEGIBLE', resuelta: false },
                    data: { resuelta: true, resolved_at: new Date() },
                });
            }

            return u;
        });

        // Recomparar si el parte vinculado ya está enviado.
        const enlaceParte = await prisma.documentoEnlace.findFirst({
            where: { documento_id: docId, entidad_tipo: 'PARTE_DIARIO' },
            select: { entidad_id: true },
        });
        const discrepancias = enlaceParte ? await recompararSiEnviado(enlaceParte.entidad_id) : 0;

        res.json({
            status: 'OK',
            data: updated,
            legible: nuevoEstado !== 'ILEGIBLE',
            estado: nuevoEstado,
            evento: nuevoEstado === 'ILEGIBLE' ? 'E-FT-001' : 'E-FT-002',
            discrepancias,
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
