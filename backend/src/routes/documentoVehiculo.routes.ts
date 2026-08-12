/**
 * Documentación del vehículo — ITV, facturas de taller, pólizas (2026-08-12).
 *
 * Esto NO son los tickets del parte diario (esos viven en foto.routes.ts).
 * Son los papeles del taxi: la ITV nueva, la factura de los neumáticos, el
 * seguro. Antes no tenían dónde entrar.
 *
 * ── LA REGLA, tal y como la fijó Alberto ────────────────────────────────
 * El OCR PROPONE. Una persona confirma. Y lo que decide si hace falta que lo
 * mire el dueño no es quién sube el documento, sino si esa persona
 * CONTRADICE a la imagen:
 *
 *   · Cualquiera de los dos sube y corrige.
 *   · Acepta lo que dice el documento  → se aplica directamente.
 *   · Lo corrige el dueño              → lo que dice el dueño vale, se aplica.
 *   · Lo corrige el asalariado         → se anota y va a revisión del dueño.
 *
 * Y una regla dura: el asalariado NO puede declarar un gasto sin una imagen o
 * PDF que lo respalde. Por eso aquí no hay forma de crear un gasto sin
 * documento: el gasto nace del documento, nunca al revés.
 *
 * Los dos juegos de datos se guardan siempre — `ocr_datos_extraidos` es lo
 * que leyó la máquina y no se toca nunca; `datos_confirmados` es lo que vale.
 * Si mañana un importe no cuadra, se ve de dónde salió y quién lo puso.
 */
import { Router, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatron, isSameTenant, AuthRequest } from '../middleware/auth.middleware';
import { TipoDocumentoVehiculo, analizarYRegistrarDocumento } from '../services/ocrDocumentoVehiculo.service';
import { aplicarDocumentoConfirmado, DatosDocumentoConfirmados } from '../services/aplicarDocumento.service';

const router = Router();

/** Tipos que gestiona esta ruta. Los tickets del parte NO entran aquí. */
const TIPOS_VEHICULO = [
    'CERTIFICADO_ITV',
    'FACTURA_TALLER',
    'POLIZA_SEGURO',
    'DOCUMENTO_VEHICULO_SIN_CLASIFICAR',
];

function urlToLocalPath(url: string): string {
    const sinQuery = url.split('?')[0].split('#')[0];
    const filename = sinQuery.split('/').pop() ?? '';
    return path.join(process.cwd(), 'uploads', filename);
}

/**
 * POST /api/documentos-vehiculo
 * Body: { url, vehiculo_id, tipo? }
 *
 * Registra el documento ya subido (POST /api/upload deja el fichero) y
 * devuelve la PROPUESTA del OCR para que la persona la confirme o la corrija.
 * No aplica nada todavía.
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { url, vehiculo_id, tipo } = req.body;
        if (!url || !vehiculo_id) {
            res.status(400).json({ status: 'FAIL', error: 'missing_fields', message: 'Falta la imagen o el vehículo' });
            return;
        }

        const vehiculo = await prisma.vehiculo.findUnique({ where: { id: vehiculo_id }, select: { cliente_id: true } });
        if (!vehiculo || !isSameTenant(req, vehiculo.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'vehiculo_not_found' });
            return;
        }

        // Hash para deduplicar (PilotOS_Master.md §5.4): la misma factura
        // subida dos veces no puede reiniciar dos veces el contador.
        const hash = crypto.createHash('sha256').update(url).digest('hex');
        const yaExiste = await prisma.documento.findFirst({
            where: { hash_sha256: hash, vehiculo_id, NOT: { aplicado_at: null } },
        });
        if (yaExiste) {
            res.status(409).json({
                status: 'FAIL', error: 'documento_duplicado',
                message: 'Este documento ya se subió y se aplicó antes.',
                documento_id: yaExiste.id,
            });
            return;
        }

        // Mismo análisis, entre por donde entre el documento: por la app o
        // por GlorIA (C-061). Ver analizarYRegistrarDocumento.
        const { documento: doc, propuesta } = await analizarYRegistrarDocumento({
            rutaLocal: urlToLocalPath(url),
            url,
            vehiculoId: vehiculo_id,
            hashSha256: hash,
            tipoForzado: TIPOS_VEHICULO.includes(tipo) ? (tipo as TipoDocumentoVehiculo) : undefined,
            subidoPorUsuarioId: req.usuario?.id ?? null,
        });

        res.status(201).json({ status: 'OK', data: doc, propuesta });
    } catch (err: any) {
        console.error('[DOC-VEHICULO] Error al registrar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/**
 * POST /api/documentos-vehiculo/:id/confirmar
 * Body: { datos: {...}, acepta_ocr: boolean }
 *
 * `acepta_ocr: true` significa "lo que dice el documento es correcto". Si es
 * false, `datos` trae lo que la persona dice que pone de verdad.
 */
router.post('/:id/confirmar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { datos, acepta_ocr } = req.body as { datos?: DatosDocumentoConfirmados; acepta_ocr?: boolean };

        const doc = await prisma.documento.findUnique({
            where: { id: req.params.id },
            include: { vehiculo: { select: { cliente_id: true } } },
        });
        if (!doc || !doc.vehiculo || !isSameTenant(req, doc.vehiculo.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' });
            return;
        }
        if (doc.aplicado_at) {
            res.status(409).json({ status: 'FAIL', error: 'ya_aplicado' });
            return;
        }

        const propuesta = (doc.ocr_datos_extraidos ?? {}) as Record<string, unknown>;
        const confirmados: DatosDocumentoConfirmados = acepta_ocr
            ? {
                fecha: propuesta.fecha as string | undefined,
                valida_hasta: propuesta.valida_hasta as string | undefined,
                importe: propuesta.importe as number | undefined,
                matricula: propuesta.matricula as string | undefined,
                km_documento: propuesta.km_documento as number | undefined,
                mantenimientos: (propuesta.mantenimientos_detectados as string[] | undefined) ?? [],
            }
            : (datos ?? {});

        const esPatron = req.usuario?.es_patron === true || req.usuario?.role === 'admin';
        const contradiceAlDocumento = acepta_ocr !== true;

        // El asalariado que CONTRADICE al documento no aplica: se anota y lo
        // revisa el dueño. Si acepta lo que pone la imagen, se aplica igual
        // que si lo hubiera hecho el dueño — la imagen es la prueba.
        if (contradiceAlDocumento && !esPatron) {
            const actualizado = await prisma.documento.update({
                where: { id: doc.id },
                data: {
                    datos_confirmados: confirmados as any,
                    confirmado_por: req.usuario!.id,
                    confirmado_at: new Date(),
                    corregido: true,
                    estado: 'PENDIENTE_REVISION',
                },
            });
            res.json({
                status: 'OK',
                data: actualizado,
                pendiente_revision: true,
                message: 'Enviado al dueño para que lo revise.',
            });
            return;
        }

        await prisma.documento.update({
            where: { id: doc.id },
            data: {
                datos_confirmados: confirmados as any,
                confirmado_por: req.usuario!.id,
                confirmado_at: new Date(),
                corregido: contradiceAlDocumento,
            },
        });

        const resultado = await aplicarDocumentoConfirmado(
            doc.id, confirmados, req.usuario!.id, req.usuario!.cliente_id!,
        );

        res.json({ status: 'OK', aplicado: true, ...resultado });
    } catch (err: any) {
        console.error('[DOC-VEHICULO] Error al confirmar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: err.message });
    }
});

/**
 * POST /api/documentos-vehiculo/:id/revisar — solo el dueño.
 * Body: { datos?, aprobar: boolean }
 *
 * Cierra el caso de un documento que el asalariado corrigió. Si el dueño
 * aprueba, se aplica lo que dijo el asalariado; si no, se aplica lo que diga
 * el dueño (su palabra es la que vale).
 */
router.post('/:id/revisar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
    try {
        const { datos, aprobar } = req.body as { datos?: DatosDocumentoConfirmados; aprobar?: boolean };

        const doc = await prisma.documento.findUnique({
            where: { id: req.params.id },
            include: { vehiculo: { select: { cliente_id: true } } },
        });
        if (!doc || !doc.vehiculo || !isSameTenant(req, doc.vehiculo.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' });
            return;
        }
        if (doc.estado !== 'PENDIENTE_REVISION') {
            res.status(409).json({ status: 'FAIL', error: 'invalid_state', estado_actual: doc.estado });
            return;
        }

        const finales: DatosDocumentoConfirmados = aprobar
            ? ((doc.datos_confirmados ?? {}) as DatosDocumentoConfirmados)
            : (datos ?? {});

        await prisma.documento.update({
            where: { id: doc.id },
            data: {
                datos_confirmados: finales as any,
                revisado_por: req.usuario!.id,
                revisado_at: new Date(),
            },
        });

        const resultado = await aplicarDocumentoConfirmado(
            doc.id, finales, req.usuario!.id, req.usuario!.cliente_id!,
        );

        res.json({ status: 'OK', aplicado: true, ...resultado });
    } catch (err: any) {
        console.error('[DOC-VEHICULO] Error al revisar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

/**
 * GET /api/documentos-vehiculo?vehiculo_id=&estado=
 * La documentación del taxi. Nada de partes: esos ya están en su pantalla.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (req.usuario?.role !== 'admin' && !req.usuario?.cliente_id) {
            res.status(403).json({ status: 'FAIL', error: 'no_client_context' });
            return;
        }

        const where: any = { tipo: { in: TIPOS_VEHICULO } };
        if (req.usuario?.role !== 'admin') {
            where.vehiculo = { cliente_id: req.usuario!.cliente_id };
        }
        if (req.query.vehiculo_id) where.vehiculo_id = String(req.query.vehiculo_id);
        if (req.query.estado) where.estado = String(req.query.estado);

        const documentos = await prisma.documento.findMany({
            where,
            include: { vehiculo: { select: { matricula: true } } },
            orderBy: { created_at: 'desc' },
            take: 100,
        });

        res.json({ status: 'OK', data: documentos });
    } catch (err: any) {
        console.error('[DOC-VEHICULO] Error al listar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
