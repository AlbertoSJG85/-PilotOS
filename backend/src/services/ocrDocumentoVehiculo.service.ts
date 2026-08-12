/**
 * OCR de documentación del vehículo — ITV y facturas de taller (2026-08-12).
 *
 * QUÉ RESUELVE. Hasta hoy el OCR solo entendía tickets de taxímetro y de
 * gasolinera. Cuando el taxi pasa la ITV o cambia neumáticos, ese papel no
 * tenía dónde entrar: había que acordarse de ir a mano a mantenimientos, poner
 * la fecha nueva y apuntar el gasto por otro lado. Aquí se lee el documento
 * para PROPONER esas dos cosas.
 *
 * ── LO QUE ESTE MÓDULO NO HACE, Y ES DELIBERADO ──────────────────────────
 * No decide nada. Devuelve una propuesta que una persona tiene que confirmar
 * (ver documentoVehiculo.routes.ts). El 2026-08-11 el motor de anomalías se
 * creyó un "2937" que en el ticket ponía 297 y acabó acusando a un conductor
 * (C-056). Una fecha de ITV mal leída es peor: no molesta a nadie, apaga un
 * aviso, y te enteras el día que te para la Guardia Civil.
 *
 * ── HONESTIDAD SOBRE LA CALIDAD DE LA LECTURA ────────────────────────────
 * Los patrones de abajo están escritos contra el formato HABITUAL de una
 * tarjeta ITV y de una factura española, no contra documentos reales pasados
 * por Tesseract. Por C-043/C-054/C-055 sabemos exactamente lo que vale eso:
 * poco. La primera ITV y la primera factura reales que suba Alberto van a
 * romper cosas, y ahí es cuando este parser se ajusta con su texto literal
 * como fixture. Mientras tanto, el paso de confirmación es lo que sostiene el
 * dato: si el OCR no encuentra un campo, la persona lo escribe y ya está.
 */
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { analizarImagen, extraerTextoImagen, validarTicketGasoil } from './ocr.service';

export type TipoDocumentoVehiculo = 'CERTIFICADO_ITV' | 'FACTURA_TALLER' | 'POLIZA_SEGURO' | 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR';

export interface PropuestaDocumento {
    tipo: TipoDocumentoVehiculo;
    /** Fecha del documento (emisión de la factura, inspección de la ITV). DD/MM/YYYY. */
    fecha?: string;
    /** Para la ITV: hasta cuándo es válida. DD/MM/YYYY. */
    valida_hasta?: string;
    /** Importe total a pagar. Solo facturas. */
    importe?: number;
    matricula?: string;
    /** Nombres del catálogo de mantenimiento que el documento parece resolver. */
    mantenimientos_detectados: string[];
    /** Km que aparecen en el documento. NO tocan el kilometraje oficial (ver más abajo). */
    km_documento?: number;
    /** Campos que el OCR no ha podido leer y la persona tendrá que rellenar. */
    faltantes: string[];
}

// ─────────────────────────────────────────────────────────
// Clasificación
// ─────────────────────────────────────────────────────────

/**
 * Decide qué es el documento por las palabras que aparecen. Si no lo tiene
 * claro, devuelve SIN_CLASIFICAR y que lo diga la persona: adivinar mal el
 * tipo es peor que preguntar.
 */
export function clasificarDocumento(texto: string): TipoDocumentoVehiculo {
    const t = texto.toLowerCase();

    const esItv = /inspecci[oó]n\s+t[eé]cnica|\bi\.?t\.?v\.?\b|estaci[oó]n\s+itv|ficha\s+t[eé]cnica/.test(t);
    if (esItv) return 'CERTIFICADO_ITV';

    const esSeguro = /p[oó]liza|compa[ñn][ií]a\s+de\s+seguros|seguro\s+del?\s+veh[ií]culo|cobertura/.test(t);
    if (esSeguro) return 'POLIZA_SEGURO';

    const esFactura = /factura|taller|mano\s+de\s+obra|base\s+imponible|neum[aá]tic|reparaci[oó]n/.test(t);
    if (esFactura) return 'FACTURA_TALLER';

    return 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR';
}

// ─────────────────────────────────────────────────────────
// Piezas sueltas
// ─────────────────────────────────────────────────────────

/** Matrícula española moderna (1234ABC) o antigua (M-1234-AB), con o sin separadores. */
export function extraerMatricula(texto: string): string | undefined {
    const moderna = texto.match(/\b(\d{4})\s*[-\s]?\s*([BCDFGHJKLMNPRSTVWXYZ]{3})\b/i);
    if (moderna) return `${moderna[1]}${moderna[2].toUpperCase()}`;
    const antigua = texto.match(/\b([A-Z]{1,2})\s*[-\s]\s*(\d{4})\s*[-\s]\s*([A-Z]{1,2})\b/);
    if (antigua) return `${antigua[1]}-${antigua[2]}-${antigua[3]}`.toUpperCase();
    return undefined;
}

/** Todas las fechas del texto, en orden de aparición, normalizadas a DD/MM/YYYY. */
export function extraerFechas(texto: string): string[] {
    const fechas: string[] = [];
    const re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
        const dia = m[1].padStart(2, '0');
        const mes = m[2].padStart(2, '0');
        const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
        if (Number(mes) >= 1 && Number(mes) <= 12 && Number(dia) >= 1 && Number(dia) <= 31) {
            fechas.push(`${dia}/${mes}/${anio}`);
        }
    }
    return fechas;
}

function aDate(fecha: string): Date | null {
    const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/**
 * Fecha de validez de la ITV. Se busca primero por etiqueta ("próxima
 * inspección", "válida hasta", "caduca"); si no aparece ninguna, se coge la
 * fecha MÁS TARDÍA del documento posterior a hoy, que en una tarjeta ITV es
 * justamente la de caducidad. Es una heurística y por eso el campo llega a la
 * pantalla como propuesta, no como hecho.
 */
export function extraerValidaHasta(texto: string): string | undefined {
    const etiquetas = [
        /(?:pr[oó]xima\s+(?:inspecci[oó]n|revisi[oó]n)|v[aá]lida?\s+hasta|caduca(?:\s+el)?|hasta\s+el|vencimiento)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    ];
    for (const re of etiquetas) {
        const m = texto.match(re);
        if (m) {
            const f = extraerFechas(m[1])[0];
            if (f) return f;
        }
    }

    const hoy = new Date();
    const futuras = extraerFechas(texto)
        .map((f) => ({ f, d: aDate(f) }))
        .filter((x): x is { f: string; d: Date } => x.d !== null && x.d.getTime() > hoy.getTime())
        .sort((a, b) => b.d.getTime() - a.d.getTime());
    return futuras[0]?.f;
}

/**
 * Kilómetros que aparecen en el documento.
 *
 * OJO, y está en el documento maestro (§5.3): esto NO actualiza el
 * kilometraje oficial del vehículo, que sale del último parte diario. Una
 * factura puede ser de hace tres días y llegar hoy; si moviera el contador,
 * lo movería hacia atrás. Se guarda solo como dato del documento.
 */
export function extraerKm(texto: string): number | undefined {
    const m = texto.match(/(?:kms?|kil[oó]metros?|km\.?)\s*[:\-]?\s*([\d.,]{3,12})/i)
        ?? texto.match(/([\d.]{4,12})\s*(?:kms?|kil[oó]metros?)\b/i);
    if (!m) return undefined;
    const n = Number(m[1].replace(/[.\s]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/**
 * Palabras del documento → nombres del catálogo de mantenimiento.
 * Los nombres son EXACTAMENTE los de prisma/seed.ts: si alguien los cambia
 * ahí y no aquí, esto deja de encajar en silencio. Es el precio de mapear por
 * nombre; el catálogo no tiene códigos estables todavía.
 */
const MAPA_MANTENIMIENTOS: Array<{ patron: RegExp; catalogo: string }> = [
    { patron: /neum[aá]tic|rueda|cubierta|michelin|bridgestone|continental|pirelli/i, catalogo: 'Neumaticos' },
    { patron: /pastilla[s]?\s+de\s+freno|pastillas/i, catalogo: 'Pastillas de freno' },
    { patron: /disco[s]?\s+de\s+freno/i, catalogo: 'Discos de freno' },
    { patron: /l[ií]quido\s+de\s+frenos/i, catalogo: 'Liquido de frenos' },
    { patron: /aceite\s+(?:motor|y\s+filtro)|cambio\s+de\s+aceite|lubricante/i, catalogo: 'Cambio de aceite y filtro' },
    { patron: /filtro\s+de\s+aire/i, catalogo: 'Filtro de aire' },
    { patron: /filtro\s+(?:de\s+)?habit[aá]culo|filtro\s+(?:de\s+)?polen/i, catalogo: 'Filtro de habitaculo / polen' },
    { patron: /correa\s+de\s+distribuci[oó]n|kit\s+de\s+distribuci[oó]n/i, catalogo: 'Correa de distribucion' },
    { patron: /refrigerante|anticongelante/i, catalogo: 'Liquido refrigerante' },
    { patron: /amortiguador/i, catalogo: 'Amortiguadores' },
    { patron: /bater[ií]a/i, catalogo: 'Bateria 12V' },
    { patron: /embrague/i, catalogo: 'Embrague' },
    { patron: /inspecci[oó]n\s+t[eé]cnica|\bitv\b/i, catalogo: 'ITV del vehiculo' },
    { patron: /p[oó]liza|seguro/i, catalogo: 'Seguro del vehiculo' },
];

export function detectarMantenimientos(texto: string): string[] {
    const encontrados = new Set<string>();
    for (const { patron, catalogo } of MAPA_MANTENIMIENTOS) {
        if (patron.test(texto)) encontrados.add(catalogo);
    }
    return [...encontrados];
}

// ─────────────────────────────────────────────────────────
// Propuesta completa
// ─────────────────────────────────────────────────────────

/**
 * Lee el documento y devuelve lo que propone. Nunca lanza: un documento
 * ilegible devuelve una propuesta vacía con todo en `faltantes`, que es
 * exactamente lo que la pantalla necesita para pedirle los datos a la persona.
 */
export function analizarDocumentoVehiculo(
    texto: string,
    tipoForzado?: TipoDocumentoVehiculo,
): PropuestaDocumento {
    const tipo = tipoForzado ?? clasificarDocumento(texto);
    const fechas = extraerFechas(texto);
    const matricula = extraerMatricula(texto);
    const km_documento = extraerKm(texto);
    const mantenimientos_detectados = detectarMantenimientos(texto);

    const propuesta: PropuestaDocumento = {
        tipo,
        matricula,
        km_documento,
        mantenimientos_detectados,
        faltantes: [],
    };

    if (tipo === 'CERTIFICADO_ITV') {
        // La inspección es la fecha más antigua del documento; la validez, la
        // que mira al futuro.
        propuesta.fecha = fechas[0];
        propuesta.valida_hasta = extraerValidaHasta(texto);
        if (!propuesta.valida_hasta) propuesta.faltantes.push('valida_hasta');
        if (!propuesta.fecha) propuesta.faltantes.push('fecha');
        // Una ITV siempre resuelve el mantenimiento "ITV del vehiculo",
        // aparezca o no la palabra suelta en el texto.
        if (!mantenimientos_detectados.includes('ITV del vehiculo')) {
            propuesta.mantenimientos_detectados.push('ITV del vehiculo');
        }
        return propuesta;
    }

    // Facturas (taller y póliza): interesa la fecha y el importe a pagar.
    // El importe se saca con el mismo lector que ya acierta en las facturas de
    // gasolinera, que aprendió por las malas a NO coger el descuento (C-055).
    const gasoil = validarTicketGasoil(texto);
    propuesta.fecha = gasoil.fecha ?? fechas[0];
    propuesta.importe = gasoil.importe;

    if (!propuesta.fecha) propuesta.faltantes.push('fecha');
    if (propuesta.importe === undefined) propuesta.faltantes.push('importe');
    if (tipo === 'POLIZA_SEGURO') {
        propuesta.valida_hasta = extraerValidaHasta(texto);
        if (!propuesta.valida_hasta) propuesta.faltantes.push('valida_hasta');
    }
    if (mantenimientos_detectados.length === 0) {
        propuesta.faltantes.push('mantenimientos');
    }

    return propuesta;
}

// ─────────────────────────────────────────────────────────
// Registro completo: imagen → análisis → Documento en PENDIENTE_CONFIRMACION
// ─────────────────────────────────────────────────────────

/**
 * Analiza una imagen y crea el `Documento` con su propuesta lista para
 * confirmar (2026-08-12, C-061).
 *
 * ÚNICO punto que hace el análisis completo. Antes existían dos caminos para
 * subir documentación del vehículo:
 *
 *   1. La app (`POST /api/documentos-vehiculo`) — corría el OCR y creaba el
 *      documento en `PENDIENTE_CONFIRMACION`.
 *   2. GlorIA (`POST /internal/documentos-vehiculo`) — guardaba la imagen y
 *      dejaba el documento en `RECIBIDO` / `PENDIENTE`, y ahí se quedaba.
 *      Nada volvía a tocarlo: ni un cron, ni un job, nada. Una factura
 *      enviada por WhatsApp desaparecía en la práctica — el dueño nunca
 *      llegaba a ver que había algo que confirmar.
 *
 * Con esta función, los dos caminos hacen exactamente lo mismo: leer la
 * imagen, sacar la propuesta, y dejar el documento donde el dueño (o el
 * asalariado) lo puede confirmar. Que el documento haya llegado por WhatsApp
 * o por la app no puede cambiar si se procesa.
 */
export interface ResultadoRegistro {
    documento: { id: string; tipo: string; estado: string };
    propuesta: PropuestaDocumento;
}

export async function analizarYRegistrarDocumento(datos: {
    rutaLocal: string;
    url: string;
    vehiculoId: string;
    hashSha256: string;
    tipoForzado?: TipoDocumentoVehiculo;
    subidoPorUsuarioId?: number | null;
}): Promise<ResultadoRegistro> {
    const analisis = await analizarImagen(datos.rutaLocal);
    const ocr = analisis.procesable
        ? await extraerTextoImagen(datos.rutaLocal)
        : { texto: '', confianza: 0, legible: false };

    const propuesta = analizarDocumentoVehiculo(ocr.texto, datos.tipoForzado);

    const documento = await prisma.documento.create({
        data: {
            tipo: propuesta.tipo,
            url: datos.url,
            hash_sha256: datos.hashSha256,
            estado: 'PENDIENTE_CONFIRMACION',
            estado_ocr: analisis.procesable ? 'COMPLETADO' : 'ILEGIBLE',
            ocr_texto: ocr.texto || null,
            ocr_confianza: ocr.confianza ?? null,
            ocr_datos_extraidos: propuesta as any,
            vehiculo_id: datos.vehiculoId,
            subido_por_usuario_id: datos.subidoPorUsuarioId ?? null,
        },
    });

    return { documento, propuesta };
}

/**
 * Registra el documento SIN analizarlo todavía (2026-08-12, C-063).
 *
 * POR QUÉ EXISTE. `analizarYRegistrarDocumento` hace el OCR dentro de la
 * misma llamada, y eso tarda unos 15-20 segundos con una foto de móvil. Para
 * la app está bien —la persona está delante esperando a ver la propuesta—,
 * pero para quien nos manda el documento por HTTP no: GlorIA espera 20
 * segundos y corta. El documento se creaba igual, pero el que llamaba se
 * llevaba un timeout y no se enteraba de nada.
 *
 * Así que para ese camino el trabajo se parte en dos: esto crea la fila al
 * momento (una foto ya guardada, un INSERT) para poder contestar enseguida,
 * y `analizarDocumentoRegistrado` hace lo lento después.
 */
export async function registrarDocumentoPendiente(datos: {
    url: string;
    vehiculoId: string;
    hashSha256: string;
    subidoPorUsuarioId?: number | null;
}): Promise<{ id: string }> {
    return prisma.documento.create({
        data: {
            tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR',
            url: datos.url,
            hash_sha256: datos.hashSha256,
            // Estado de paso. No aparece en "esperan tu confirmación" (que
            // filtra por PENDIENTE_CONFIRMACION) hasta que el análisis
            // termina, que es lo correcto: todavía no hay nada que confirmar.
            estado: 'ANALIZANDO',
            estado_ocr: 'PENDIENTE',
            vehiculo_id: datos.vehiculoId,
            subido_por_usuario_id: datos.subidoPorUsuarioId ?? null,
        },
        select: { id: true },
    });
}

/**
 * Termina el trabajo de `registrarDocumentoPendiente`: lee la imagen y deja
 * el documento listo para confirmar.
 *
 * Nunca lanza — se llama sin esperar respuesta. Si el OCR falla, el documento
 * queda marcado con el error en vez de desaparecer: es preferible que el dueño
 * vea "no se pudo leer" y lo rellene a mano, a que la factura se pierda.
 */
export async function analizarDocumentoRegistrado(
    documentoId: string,
    rutaLocal: string,
    tipoForzado?: TipoDocumentoVehiculo,
): Promise<void> {
    try {
        const analisis = await analizarImagen(rutaLocal);
        const ocr = analisis.procesable
            ? await extraerTextoImagen(rutaLocal)
            : { texto: '', confianza: 0, legible: false };

        const propuesta = analizarDocumentoVehiculo(ocr.texto, tipoForzado);

        await prisma.documento.update({
            where: { id: documentoId },
            data: {
                tipo: propuesta.tipo,
                estado: 'PENDIENTE_CONFIRMACION',
                estado_ocr: analisis.procesable ? 'COMPLETADO' : 'ILEGIBLE',
                ocr_texto: ocr.texto || null,
                ocr_confianza: ocr.confianza ?? null,
                ocr_datos_extraidos: propuesta as any,
            },
        });
        console.log(`[DOC-VEHICULO] Analizado ${documentoId}: ${propuesta.tipo}`);
    } catch (err: any) {
        console.error(`[DOC-VEHICULO] Fallo analizando ${documentoId}:`, err?.message);
        // El documento se queda, pero visible y con el motivo. Que se pueda
        // confirmar a mano es mejor que perderlo.
        await prisma.documento
            .update({
                where: { id: documentoId },
                data: {
                    estado: 'PENDIENTE_CONFIRMACION',
                    estado_ocr: 'ERROR',
                    ocr_error: String(err?.message ?? err).slice(0, 500),
                },
            })
            .catch(() => undefined);
    }
}

/** SHA-256 de un buffer, para deduplicar documentos que llegan como bytes crudos (GlorIA). */
export function hashDeBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
