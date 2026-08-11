import Tesseract from 'tesseract.js';
import sharp from 'sharp';

const UMBRAL_CONFIANZA = 60;

// Umbrales para considerar que una imagen es "visualmente procesable".
// Una foto de móvil real de un ticket está siempre muy por encima de estos límites.
// Lo que rechazamos aquí es: archivos corruptos, capturas vacías, fotos casi
// completamente negras o blancas, miniaturas absurdas. NO rechazamos en función
// del OCR — eso lo decide el flujo posterior.
const MIN_LADO_PX = 200;        // ningún ticket realista mide menos que esto
const MIN_STDEV_LUMINANCIA = 8; // por debajo de esto la imagen es prácticamente uniforme

export interface OCRResult {
    texto: string;
    confianza: number;
    legible: boolean;
    error_ocr?: string;
}

export type MotivoImagenNoProcesable =
    | 'imagen_corrupta'
    | 'demasiado_pequena'
    | 'sin_contenido_visual';

export interface ImagenAnalisis {
    procesable: boolean;
    motivo?: MotivoImagenNoProcesable;
    width?: number;
    height?: number;
    luminancia_media?: number;
    luminancia_stdev?: number;
}

/**
 * Decide si una imagen es VISUALMENTE procesable, independientemente del OCR.
 *
 * Esta es la única función que puede marcar un documento como ILEGIBLE.
 * Si Sharp no abre el archivo, las dimensiones son ridículas o la imagen
 * es prácticamente monocromática (foto negra, blanca, totalmente borrosa),
 * la imagen NO es procesable.
 *
 * Una foto real de un ticket de móvil pasa siempre este filtro. Aunque el
 * OCR posterior falle por completo, la decisión de ILEGIBLE NO depende de él.
 */
export async function analizarImagen(imagenPath: string): Promise<ImagenAnalisis> {
    try {
        const img = sharp(imagenPath, { failOn: 'none' });
        const meta = await img.metadata();

        if (!meta.width || !meta.height) {
            return { procesable: false, motivo: 'imagen_corrupta' };
        }
        if (meta.width < MIN_LADO_PX || meta.height < MIN_LADO_PX) {
            return {
                procesable: false,
                motivo: 'demasiado_pequena',
                width: meta.width,
                height: meta.height,
            };
        }

        // Convertir a luminancia y medir desviación estándar.
        // Una imagen con contenido real (texto sobre papel, ticket) tiene
        // stdev típica entre 30 y 80. Por debajo de 8 es casi uniforme:
        // foto negra, foto blanca, foto completamente desenfocada en un color.
        let stdev = 999;
        let mean = 0;
        try {
            const stats = await sharp(imagenPath, { failOn: 'none' }).greyscale().stats();
            const ch = stats.channels?.[0];
            if (ch) {
                stdev = ch.stdev;
                mean = ch.mean;
            }
        } catch (err: any) {
            // Si Sharp puede leer metadatos pero no stats, mejor no descartar
            // la imagen: confiamos en metadata y dejamos pasar como procesable.
            console.warn('[IMG] No se pudieron calcular stats:', err.message);
        }

        if (stdev < MIN_STDEV_LUMINANCIA) {
            return {
                procesable: false,
                motivo: 'sin_contenido_visual',
                width: meta.width,
                height: meta.height,
                luminancia_media: mean,
                luminancia_stdev: stdev,
            };
        }

        return {
            procesable: true,
            width: meta.width,
            height: meta.height,
            luminancia_media: mean,
            luminancia_stdev: stdev,
        };
    } catch (err: any) {
        console.warn('[IMG] Imagen no abrible por Sharp:', err?.message);
        return { procesable: false, motivo: 'imagen_corrupta' };
    }
}

/**
 * Ejecuta Tesseract.js sobre la imagen. SIEMPRE devuelve un resultado:
 * si Tesseract falla por completo (timeout, idioma no disponible, etc.)
 * devuelve texto vacío con `error_ocr` marcado. La decisión de qué hacer
 * con ese fallo es responsabilidad del caller — esta función NO declara
 * que la imagen es "ilegible". Eso lo decide analizarImagen().
 */
export async function extraerTextoImagen(imagenPath: string): Promise<OCRResult> {
    try {
        const { data } = await Tesseract.recognize(imagenPath, 'spa', {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR progreso: ${Math.round(m.progress * 100)}%`);
                }
            },
        });

        const confianza = data.confidence;
        return { texto: data.text, confianza, legible: confianza >= UMBRAL_CONFIANZA };
    } catch (error: any) {
        console.error('[OCR] Error en Tesseract (no implica imagen ilegible):', error.message);
        return { texto: '', confianza: 0, legible: false, error_ocr: 'tesseract_error' };
    }
}

// ─────────────────────────────────────────────────────────
// Helpers de extracción
// ─────────────────────────────────────────────────────────

function extractNum(text: string, patterns: RegExp[]): number | null {
    for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) {
            const v = parseFloat(m[1].replace(',', '.'));
            if (!isNaN(v)) return v;
        }
    }
    return null;
}

function extractNumCurrency(text: string, patterns: RegExp[]): number | null {
    const v = extractNum(text, patterns);
    return v !== null && v > 0 ? v : null;
}

/**
 * Normaliza distancias: si el valor es > 2000, asume metros y convierte a km.
 * Cubre taxímetros que reportan en metros (valor típico de un turno: 150–500 km).
 *
 * IMPORTANTE (2026-08-11, hallazgo N6 con ticket real): esta heurística SOLO
 * es válida para valores del TURNO (parcial) — nadie hace 2000+ km en un día.
 * Un acumulado histórico del taxímetro supera los 2000 km con total normalidad
 * (183.108 km de vida útil, por ejemplo) y NO debe dividirse por 1000. Llamar
 * con `permitirConversionMetros: false` para los campos acum_*.
 */
function extractNumDistance(text: string, patterns: RegExp[], permitirConversionMetros = true): number | null {
    const v = extractNum(text, patterns);
    if (v === null) return null;
    if (!permitirConversionMetros) return v;
    return v > 2000 ? Math.round((v / 1000) * 10) / 10 : v;
}

function extractDate(text: string): string | null {
    const m = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
    if (!m) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
}

function extractTime(text: string): string | null {
    const m = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function extractLicencia(text: string): string | null {
    const m = text.match(/licen(?:cia)?\.?\s*[:=]?\s*([A-Z0-9\/\-]+)/i);
    return m ? m[1].trim() : null;
}

// ─────────────────────────────────────────────────────────
// Datos extraídos del taxímetro (estructurados)
// ─────────────────────────────────────────────────────────

export interface DatosTaximetro {
    fecha?: string;
    hora?: string;
    licencia?: string;

    // Acumulados — contador histórico del taxímetro
    acum_num_servicios?: number;
    acum_carreras?: number;
    acum_suplementos?: number;
    acum_total?: number;
    acum_dist_total?: number;    // km
    acum_dist_ocupado?: number;
    acum_dist_libre?: number;
    acum_dist_off?: number;
    acum_tiempo_ocupado?: number; // minutos
    acum_tiempo_on?: number;
    acum_borrados?: number;      // clave: comparar con ticket anterior

    // Parciales — datos del último turno
    parc_num_servicios?: number;
    parc_carreras?: number;
    parc_suplementos?: number;
    parc_total?: number;         // clave: comparar con ingreso_bruto
    parc_dist_total?: number;    // clave: comparar con km_fin-km_inicio
    parc_dist_ocupado?: number;
    parc_dist_libre?: number;
    parc_dist_off?: number;
    parc_tiempo_ocupado?: number;
    parc_tiempo_on?: number;

    // Legacy (backward compat con ocrComparacion.service.ts anterior)
    importe?: number;

    valido: boolean;
    errores: string[];
}

// Una línea de "P Total:", "P Dist. Total:", "P Nº de servs:"... — el modelo de
// ticket real visto el 2026-08-11 no usa cabeceras de sección ("ACUMULADO",
// "PARCIAL"...), marca CADA campo del turno con este prefijo "P " suelto.
// \b evita que "Precio" o similar cuente como prefijo (la "P" de "Precio" no
// está seguida de espacio/punto).
const LINEA_PARCIAL = /^\s*P[.\s]/i;

/**
 * Separa el texto del ticket en bloque "acumulado" (histórico del taxímetro)
 * y bloque "parcial" (turno actual).
 *
 * Dos estrategias, en orden:
 *   1. Por LÍNEA: si alguna línea empieza por "P " (el modelo de ticket real
 *      de PilotOS, sin cabeceras de sección), esa línea es del turno y el
 *      resto es acumulado. Esta es la señal más fiable porque no depende de
 *      que el OCR lea bien una palabra de cabecera.
 *   2. Por PALABRA CLAVE: si ninguna línea usa el prefijo "P ", se cae al
 *      método anterior (buscar "ACUMULADO"/"PARCIAL"/"TURNO"...), para no
 *      romper otros modelos de taxímetro que sí rotulen las secciones.
 */
function extractarSeccionTaximetro(t: string) {
    const lineas = t.split('\n');
    const lineasParcial = lineas.filter((l) => LINEA_PARCIAL.test(l));

    if (lineasParcial.length > 0) {
        const lineasAcum = lineas.filter((l) => !LINEA_PARCIAL.test(l));
        return { acumText: lineasAcum.join('\n'), parcText: lineasParcial.join('\n') };
    }

    // ── Fallback: separación por palabra clave de sección (modelos antiguos) ──
    const tUp = t.toUpperCase();
    const acumKws = ['ACUMULADO', 'TOTAL GENERAL', 'RESUMEN TOTAL', 'DATOS TOTALES', 'HIST'];
    const parcKws = ['PARCIAL', 'DEL TURNO', 'TURNO', 'DEL DIA', 'JORNADA', 'DATOS DEL'];

    let acumStart = -1;
    let parcStart = -1;
    for (const kw of acumKws) {
        const idx = tUp.indexOf(kw);
        if (idx >= 0 && (acumStart < 0 || idx < acumStart)) acumStart = idx;
    }
    for (const kw of parcKws) {
        const idx = tUp.indexOf(kw);
        if (idx >= 0 && (parcStart < 0 || idx < parcStart)) parcStart = idx;
    }

    if (acumStart >= 0 && parcStart >= 0) {
        if (acumStart < parcStart) {
            return { acumText: t.substring(acumStart, parcStart), parcText: t.substring(parcStart) };
        }
        return { parcText: t.substring(parcStart, acumStart), acumText: t.substring(acumStart) };
    }
    if (acumStart >= 0) {
        return { acumText: t.substring(acumStart), parcText: t.substring(0, acumStart) };
    }
    if (parcStart >= 0) {
        return { parcText: t.substring(parcStart), acumText: t.substring(0, parcStart) };
    }
    // Sin ninguna señal: todo se trata como parcial (mejor sobre-comparar el
    // turno, que es lo que ya se hacía, que no comparar nada).
    return { parcText: t, acumText: '' };
}

/**
 * Valida y extrae datos estructurados de un ticket de taxímetro español.
 * Extrae acumulados (incluyendo Borrados) y parciales del turno (Total, Dist.Total).
 */
export function validarTicketTaximetro(texto: string): DatosTaximetro {
    const errores: string[] = [];

    // Normalizar: eliminar acentos y colapsar espacios
    const t = texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ');

    const fecha = extractDate(t) || undefined;
    const hora = extractTime(t) || undefined;
    const licencia = extractLicencia(t) || undefined;

    const { acumText, parcText } = extractarSeccionTaximetro(t);

    // ── Acumulados ──
    const acum_borrados = extractNum(acumText, [
        /borrad[ao]s?\s*[:.]?\s*(\d+)/i,
        /borra\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const acum_total = extractNumCurrency(acumText, [
        /total\s*(?:acumulado|general)?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /acum\w*\s+total\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    // acum_dist_* NUNCA pasa por la conversión metros→km (tercer parámetro
    // `false`): un acumulado histórico supera los 2000 km con normalidad.
    const acum_dist_total = extractNumDistance(acumText, [
        /dist(?:ancia)?\.?\s*(?:total|recorrida)?\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)/i,
        /dist\s*\.?\s*total\s*[:.]?\s*([\d]+[.,]?[\d]*)/i,
    ], false) ?? undefined;

    // "serv\w*" en vez de "servicios?": el ticket real abrevia como "servs".
    const acum_num_servicios = extractNum(acumText, [
        /n[.oº°]?\s*(?:de\s+)?serv\w*\s*[:.]?\s*(\d+)/i,
        /serv\w*\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    // "Carreras" es un IMPORTE (€), no un contador — el ticket real lo
    // confirma: Carreras + Suplementos = Total, los tres en euros con
    // decimales. extractNum (entero) lo truncaba silenciosamente.
    const acum_carreras = extractNumCurrency(acumText, [
        /carreras?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    const acum_suplementos = extractNumCurrency(acumText, [
        /suplementos?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /suplem\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    const acum_dist_ocupado = extractNumDistance(acumText, [
        /dist\.?\s*ocup\w*\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
    ], false) ?? undefined;

    const acum_dist_libre = extractNumDistance(acumText, [
        /dist\.?\s*libre\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
    ], false) ?? undefined;

    // Nota (2026-08-11): en el ticket real de prueba este campo llega como
    // "9999999,9" — un desbordamiento del propio taxímetro, no un dato real.
    // No se usa en ninguna comparación aguas abajo; se deja tal cual llega.
    const acum_dist_off = extractNumDistance(acumText, [
        /dist\.?\s*(?:off|apagado)\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
    ], false) ?? undefined;

    // \b delante de "t": sin ese límite de palabra, "Dist." (que termina en
    // "t") + ". " + "Ocupado" coincidía con el patrón y se colaba como si
    // fuera "Tiempo Ocupado" — hallazgo del ticket real del 2026-08-11.
    const acum_tiempo_ocupado = extractNum(acumText, [
        /\bt(?:iempo)?\.?\s*ocup\w*\s*[:.]?\s*(\d+)\s*(?:min|h)?/i,
        /\bt\.?\s*ocu\.?\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const acum_tiempo_on = extractNum(acumText, [
        /\bt(?:iempo)?\.?\s*on\s*[:.]?\s*(\d+)\s*(?:min|h)?/i,
        /\bt\.?\s*enc\w*\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    // ── Parciales ──
    const parc_total = extractNumCurrency(parcText, [
        /p\.?\s*total\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /total\s*(?:del\s+)?(?:turno|jornada|dia|parcial)\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /\btotal\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    // Fallback parciales: si no hay sección clara, buscar en todo el texto
    const parc_total_final = parc_total ?? extractNumCurrency(t, [
        /p\.?\s*total\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /total\s*(?:turno|jornada)\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    const parc_dist_total = extractNumDistance(parcText, [
        /p\.?\s*dist\.?\s*(?:total|rec\w*)?\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
        /dist\.?\s*(?:total|recorrida)\s*(?:del\s+)?(?:turno|jornada|parcial)?\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
        /\bdist\.?\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*km/i,
    ]) ?? undefined;

    const parc_num_servicios = extractNum(parcText, [
        /n[.oº°]?\s*(?:de\s+)?serv\w*\s*[:.]?\s*(\d+)/i,
        /serv\w*\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    // "Carreras" es un importe, no un contador — ver nota en acum_carreras.
    const parc_carreras = extractNumCurrency(parcText, [
        /carreras?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    const parc_suplementos = extractNumCurrency(parcText, [
        /suplementos?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    const parc_dist_ocupado = extractNumDistance(parcText, [
        /dist\.?\s*ocup\w*\s*[:.]?\s*([\d]+[.,]?[\d]*)/i,
    ]) ?? undefined;

    const parc_dist_libre = extractNumDistance(parcText, [
        /dist\.?\s*libre\s*[:.]?\s*([\d]+[.,]?[\d]*)/i,
    ]) ?? undefined;

    const parc_dist_off = extractNumDistance(parcText, [
        /dist\.?\s*(?:off|apagado)\s*[:.]?\s*([\d]+[.,]?[\d]*)/i,
    ]) ?? undefined;

    // \b — mismo motivo que en acum_tiempo_ocupado.
    const parc_tiempo_ocupado = extractNum(parcText, [
        /\bt(?:iempo)?\.?\s*ocup\w*\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const parc_tiempo_on = extractNum(parcText, [
        /\bt(?:iempo)?\.?\s*on\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    // ── Validación ──
    if (!parc_total_final) {
        errores.push('No se pudo detectar el importe del turno (P Total)');
    }
    if (!fecha) {
        errores.push('No se detectó fecha en el ticket');
    }

    return {
        fecha,
        hora,
        licencia,
        acum_num_servicios,
        acum_carreras,
        acum_suplementos,
        acum_total,
        acum_dist_total,
        acum_dist_ocupado,
        acum_dist_libre,
        acum_dist_off,
        acum_tiempo_ocupado,
        acum_tiempo_on,
        acum_borrados,
        parc_num_servicios,
        parc_carreras,
        parc_suplementos,
        parc_total: parc_total_final,
        parc_dist_total,
        parc_dist_ocupado,
        parc_dist_libre,
        parc_dist_off,
        parc_tiempo_ocupado,
        parc_tiempo_on,
        importe: parc_total_final, // backward compat
        valido: errores.length === 0,
        errores,
    };
}

/**
 * Valida un ticket de gasoil/combustible.
 */
export function validarTicketGasoil(texto: string): {
    valido: boolean;
    fecha?: string;
    importe?: number;
    litros?: number;
    errores: string[];
} {
    const errores: string[] = [];
    const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

    const fecha = extractDate(t) || undefined;

    const importe = extractNumCurrency(t, [
        /(?:total|importe)\s*[:.]?\s*([\d]+[.,][\d]{2})\s*(?:€|eur)?/gi,
        /([\d]+[.,][\d]{2})\s*€/gi,
    ]) ?? undefined;

    const litros = extractNum(t, [
        /([\d]+[.,][\d]{1,3})\s*(?:l|lt|litros?)\b/gi,
        /litros?\s*[:.]?\s*([\d]+[.,][\d]{1,3})/gi,
    ]) ?? undefined;

    const palabrasCombustible = ['diesel', 'gasoil', 'gasolina', 'combustible', 'carburante', 'gas oil'];
    const tienePalabraCombustible = palabrasCombustible.some(p => t.toLowerCase().includes(p));

    if (!importe) errores.push('No se detectó importe');
    if (!tienePalabraCombustible && !litros) errores.push('No parece ser un ticket de combustible');

    return { valido: errores.length === 0, fecha, importe, litros, errores };
}
