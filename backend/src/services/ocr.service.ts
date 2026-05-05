import Tesseract from 'tesseract.js';
import sharp from 'sharp';

const UMBRAL_CONFIANZA = 60;

export interface OCRResult {
    texto: string;
    confianza: number;
    legible: boolean;
    error_ocr?: string;
}

export async function extraerTextoImagen(imagenPath: string): Promise<OCRResult> {
    try {
        try {
            await sharp(imagenPath).metadata();
        } catch (err: any) {
            console.warn('[OCR] Imagen corrupta detectada por Sharp:', err.message);
            return { texto: '', confianza: 0, legible: false, error_ocr: 'imagen_corrupta' };
        }

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
        console.error('[OCR] Error crítico en Tesseract:', error.message);
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
 */
function extractNumDistance(text: string, patterns: RegExp[]): number | null {
    const v = extractNum(text, patterns);
    if (v === null) return null;
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

function extractarSeccionTaximetro(t: string) {
    const tUp = t.toUpperCase();

    // Palabras clave que delimitan la sección de acumulados
    const acumKws = ['ACUMULADO', 'TOTAL GENERAL', 'RESUMEN TOTAL', 'DATOS TOTALES', 'HIST'];
    // Palabras clave que delimitan la sección de parciales
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

    let acumText: string;
    let parcText: string;

    if (acumStart >= 0 && parcStart >= 0) {
        if (acumStart < parcStart) {
            acumText = t.substring(acumStart, parcStart);
            parcText = t.substring(parcStart);
        } else {
            parcText = t.substring(parcStart, acumStart);
            acumText = t.substring(acumStart);
        }
    } else if (acumStart >= 0) {
        acumText = t.substring(acumStart);
        parcText = t.substring(0, acumStart);
    } else if (parcStart >= 0) {
        parcText = t.substring(parcStart);
        acumText = t.substring(0, parcStart);
    } else {
        // Sin secciones claras: usar el texto completo para parciales,
        // y vacío para acumulados (los parciales son más importantes para cotejo).
        parcText = t;
        acumText = '';
    }

    return { acumText, parcText };
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

    const acum_dist_total = extractNumDistance(acumText, [
        /dist(?:ancia)?\.?\s*(?:total|recorrida)?\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)/i,
        /dist\s*\.?\s*total\s*[:.]?\s*([\d]+[.,]?[\d]*)/i,
    ]) ?? undefined;

    const acum_num_servicios = extractNum(acumText, [
        /n[.oº°]?\s*(?:de\s+)?servicios?\s*[:.]?\s*(\d+)/i,
        /servicios?\s*[:.]?\s*(\d+)/i,
        /serv\s*\.?\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const acum_carreras = extractNum(acumText, [
        /carreras?\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const acum_suplementos = extractNumCurrency(acumText, [
        /suplementos?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /suplem\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
    ]) ?? undefined;

    const acum_dist_ocupado = extractNumDistance(acumText, [
        /dist\.?\s*ocup\w*\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
    ]) ?? undefined;

    const acum_dist_libre = extractNumDistance(acumText, [
        /dist\.?\s*libre\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
    ]) ?? undefined;

    const acum_dist_off = extractNumDistance(acumText, [
        /dist\.?\s*(?:off|apagado)\s*[:.]?\s*([\d]+[.,]?[\d]*)\s*(?:km|m\b)?/i,
    ]) ?? undefined;

    const acum_tiempo_ocupado = extractNum(acumText, [
        /t(?:iempo)?\.?\s*ocup\w*\s*[:.]?\s*(\d+)\s*(?:min|h)?/i,
        /t\.?\s*ocu\.?\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const acum_tiempo_on = extractNum(acumText, [
        /t(?:iempo)?\.?\s*on\s*[:.]?\s*(\d+)\s*(?:min|h)?/i,
        /t\.?\s*enc\w*\s*[:.]?\s*(\d+)/i,
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
        /n[.oº°]?\s*(?:de\s+)?servicios?\s*[:.]?\s*(\d+)/i,
        /servicios?\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const parc_carreras = extractNum(parcText, [
        /carreras?\s*[:.]?\s*(\d+)/i,
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

    const parc_tiempo_ocupado = extractNum(parcText, [
        /t(?:iempo)?\.?\s*ocup\w*\s*[:.]?\s*(\d+)/i,
    ]) ?? undefined;

    const parc_tiempo_on = extractNum(parcText, [
        /t(?:iempo)?\.?\s*on\s*[:.]?\s*(\d+)/i,
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
    importe?: number;
    litros?: number;
    errores: string[];
} {
    const errores: string[] = [];
    const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

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

    return { valido: errores.length === 0, importe, litros, errores };
}
