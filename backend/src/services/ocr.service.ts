import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs';

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
/**
 * Prepara la imagen ANTES de pasarla por Tesseract (2026-08-12, C-060).
 *
 * Esto es lo que arregla el fallo que más ha costado: el ticket ponía
 * "Borrados: 297" y Tesseract leía "2937", una y otra vez. No era el parser
 * —el número llegaba ya mal— sino la resolución: la letra del ticket, tal y
 * como sale de la foto, es demasiado pequeña para el motor. Tesseract está
 * afinado para texto a ~300 dpi; con menos, se inventa trazos.
 *
 * Tres pasos:
 *   1. Escala de grises: el color no aporta nada y sí ruido.
 *   2. Normalizar el contraste: la foto de un ticket suele salir grisácea.
 *   3. Agrandar x2,5 con lanczos3. Este es el que arregla el problema.
 *
 * ── LO QUE NO SE HACE, Y POR QUÉ ─────────────────────────────────────────
 * NO se afila (`sharpen`) y NO se binariza (`threshold`). Los dos parecían
 * buena idea y los dos ROMPEN tickets: con afilado, el ticket del 10/08 sale
 * perfecto pero el del 08/08 pierde la línea de "Borrados" y el importe del
 * turno. Es exactamente la trampa de siempre en este módulo — ajustar contra
 * una sola foto y cantar victoria.
 *
 * ── CÓMO SE ELIGIÓ ───────────────────────────────────────────────────────
 * Probando 6 combinaciones (escalas 1,5 / 2 / 2,5 × afilado sí/no) contra las
 * DOS fotos reales que hay, y midiendo los 9 campos clave contra lo que pone
 * el papel:
 *
 *   x2   plano    7/9   (pierde el importe del turno en las dos)
 *   x2,5 afilado  8/9
 *   x2,5 plano    9/9   ← esta
 *
 * Los dos tickets están en tests/fixtures y el test `smoke.ocrImagenReal`
 * comprueba esta tubería entera. Si alguien cambia estos parámetros y ese
 * test se pone rojo, ha roto la lectura de tickets reales.
 */
async function prepararImagenParaOcr(imagenPath: string): Promise<string> {
    const salida = imagenPath.replace(/\.(jpe?g|png|webp)$/i, '') + '.ocr.png';
    const meta = await sharp(imagenPath).metadata();
    // Tope de 5000 px para que una foto enorme no dispare la memoria del
    // servidor: por encima de eso Tesseract tampoco mejora.
    const anchoObjetivo = Math.min(Math.round((meta.width ?? 1200) * 2.5), 5000);

    await sharp(imagenPath)
        .grayscale()
        .normalize()
        .resize({ width: anchoObjetivo, kernel: 'lanczos3' })
        .png()
        .toFile(salida);

    return salida;
}

export async function extraerTextoImagen(imagenPath: string): Promise<OCRResult> {
    let rutaPreparada: string | null = null;
    try {
        // Si la preparación falla (imagen rara, sin memoria...), se sigue con
        // la original: peor lectura, pero lectura al fin y al cabo.
        try {
            rutaPreparada = await prepararImagenParaOcr(imagenPath);
        } catch (err: any) {
            console.warn('[OCR] No se pudo preparar la imagen, se usa la original:', err?.message);
        }

        const { data } = await Tesseract.recognize(rutaPreparada ?? imagenPath, 'spa', {
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
    } finally {
        // El PNG preparado es de usar y tirar: pesa más que el original y ya
        // no sirve de nada. Si no se puede borrar, tampoco es grave.
        if (rutaPreparada) {
            try { fs.unlinkSync(rutaPreparada); } catch { /* da igual */ }
        }
    }
}

// ─────────────────────────────────────────────────────────
// Helpers de extracción
// ─────────────────────────────────────────────────────────

/**
 * Limpia el ruido que Tesseract mete DENTRO de los números.
 *
 * En el ticket real del 2026-08-11 el separador decimal salió como `»`, `>`,
 * `-` o un espacio según la línea: `144605» 85`, `183043»1`, `80137>3`,
 * `1967-05`. Sin esto, esas cifras no casan con ningún patrón y el campo se
 * pierde entero.
 *
 * Solo toca lo que está ENTRE DÍGITOS, para no estropear texto normal ni las
 * horas (`21:50` se queda como está).
 */
function normalizarNumerosOcr(t: string): string {
    return t
        // separador decimal leído como símbolo raro: 144605» 85 -> 144605.85
        // La lista ha ido creciendo con cada ticket real: `»«>·—–` salieron el
        // 2026-08-11, y `;` y `"` el 2026-08-12 ("Carreras: 144655; 60",
        // "carreras" 144605» 89"). Es texto de impresora térmica fotografiado:
        // cualquier símbolo pequeño puede acabar aquí.
        .replace(/(\d)\s*[»«>·—–;:"']\s*(\d)/g, '$1.$2')
        // guion entre cifras cuando hace de decimal: 1967-05 -> 1967.05
        .replace(/(\d)-(\d{1,2})(?!\d)/g, '$1.$2')
        // separador decimal PERDIDO del todo, solo queda el espacio:
        // "P Carreras: 49 75" -> 49.75. Se exigen exactamente dos decimales
        // para no tocar cifras como "144 655" (miles) ni contadores enteros.
        .replace(/(d)[ 	]+(d{2})(?!d)/g, '$1.$2')
        // separador decimal PERDIDO del todo, del que solo queda el espacio:
        // "P Carreras: 49 75" -> 49.75 (el ticket pone 49,75). Se exigen
        // exactamente DOS decimales y que no siga otro digito, para no tocar
        // separadores de miles ("144 655") ni contadores enteros.
        .replace(/(\d)[ \t]+(\d{2})(?!\d)/g, '$1.$2')
        // decimal con el separador BIEN leido pero un espacio detras:
        // "Total: 149047, 40" -> 149047.40. Sin esto el patron de importe
        // (que exige separador + 2 digitos pegados) no casa y el campo se
        // pierde entero -- asi se perdio `acum_total` en el ticket del
        // 2026-08-10, y sin importe acumulado la comparacion de acumulados
        // no puede distinguir "trabajo no declarado" de ruido de OCR.
        // Solo en la MISMA linea (no \s) para no unir cifras de dos filas.
        .replace(/(\d)[.,][ \t]+(\d{2})(?!\d)/g, '$1.$2')
        // los DOS PUNTOS de la etiqueta leídos como otra cosa, justo antes de
        // la cifra: "carreras! 144605", "P-Carrerasi 1967". Sin esto la
        // etiqueta no casa y el campo se pierde aunque el número esté bien.
        .replace(/([A-Za-z])[!¡;iI](?=\s*\d)/g, '$1:')
        // el PUNTO abreviador leído como guion: "Dist- Total" -> "Dist. Total".
        .replace(/([A-Za-z])[-–—](?=\s*[A-Za-z])/g, '$1.');
}

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
    /** true = P Total no cuadraba con Carreras+Suplementos y se uso la suma. */
    parc_total_reconstruido?: boolean;
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
 * La línea de "Borrados" es el ÚLTIMO campo del bloque acumulado y no se
 * repite en el del turno. Es el separador más fiable que tiene este ticket.
 */
const LINEA_BORRADOS = /borrad/i;

/**
 * Separa el texto del ticket en bloque "acumulado" (histórico del taxímetro)
 * y bloque "parcial" (turno actual).
 *
 * Tres estrategias, en orden de fiabilidad:
 *
 *   1. Por la línea de BORRADOS. Es el último campo del acumulado y no
 *      aparece en el turno, así que parte el ticket en dos exactamente por
 *      donde toca.
 *
 *      **Por qué esta va primero (2026-08-11, segunda corrección del mismo
 *      día):** la estrategia 2 se escribió por la mañana validándola contra
 *      una transcripción limpia escrita a mano, y se cayó contra el OCR real.
 *      Tesseract destroza el prefijo "P": en el ticket de Alberto salió
 *      `7 Total: 2024.65` (la P leída como 7), `P-Carrerasi 1967-05`,
 *      `PP pist. Ocurado`, `de pel TOA 23521`. Con esas líneas fuera del
 *      bloque del turno, el importe del turno acababa guardado como
 *      acumulado y el ticket se marcaba inválido — por eso no contrastaba
 *      nada. "Borrados" sobrevive al ruido porque es una palabra larga y
 *      sola en su línea.
 *
 *   2. Por PREFIJO "P " de línea, para tickets donde el OCR salga limpio y
 *      no haya línea de borrados legible.
 *
 *   3. Por PALABRA CLAVE de cabecera ("ACUMULADO"/"PARCIAL"...), para otros
 *      modelos de taxímetro que sí rotulen las secciones.
 */
function extractarSeccionTaximetro(t: string) {
    const lineas = t.split('\n');

    // ── 1. Corte por la línea de Borrados ──
    const iBorrados = lineas.findIndex((l) => LINEA_BORRADOS.test(l));
    if (iBorrados >= 0 && iBorrados < lineas.length - 1) {
        return {
            acumText: lineas.slice(0, iBorrados + 1).join('\n'),
            parcText: lineas.slice(iBorrados + 1).join('\n'),
        };
    }

    // ── 2. Corte por prefijo "P " de línea ──
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

    // La fecha y la hora se leen del texto SIN normalizar: la normalización
    // toca los símbolos entre dígitos y estropearía "21:50" o "08/08/26".
    const fecha = extractDate(t) || undefined;
    const hora = extractTime(t) || undefined;
    const licencia = extractLicencia(t) || undefined;

    // El resto de campos sí, para recuperar las cifras que el OCR ensucia.
    const { acumText, parcText } = extractarSeccionTaximetro(normalizarNumerosOcr(t));

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

    // "su.{0,2}lementos": en el ticket real del 10/08/2026 Tesseract escribió
    // "Surlementos" (acumulado) y "SurPlementos" (turno). Con "suplementos"
    // literal el campo se perdía, y sin suplementos no se puede comprobar la
    // coherencia interna del ticket (Carreras + Suplementos = Total), que es
    // lo que destapa un P Total mal leído (C-056).
    const acum_suplementos = extractNumCurrency(acumText, [
        /su.{0,2}lementos?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /su.{0,2}lem\w*\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
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
        /su.{0,2}lementos?\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
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

    // ── Coherencia interna del turno (2026-08-12, C-060) ──────────────────
    // P Carreras + P Suplementos tiene que dar P Total. Cuando no cuadra, la
    // cifra que se descarta es P Total: son tres lecturas independientes y dos
    // que suman bien pesan más que una suelta.
    //
    // Caso real del ticket del 10/08: el papel pone "P Total: 51,55" y
    // Tesseract lee "1.55" —se come el 5 al confundir el borde del ticket con
    // un carácter—, mientras que 49,75 + 1,80 salen perfectos. Sin esto, el
    // parte se comparaba contra 1,55 € y saltaba una diferencia absurda.
    let parc_total_corregido = parc_total_final;
    let parc_total_reconstruido = false;
    if (parc_carreras !== undefined && parc_suplementos !== undefined) {
        const suma = Number((parc_carreras + parc_suplementos).toFixed(2));
        if (parc_total_corregido === undefined || Math.abs(suma - parc_total_corregido) > 1) {
            parc_total_corregido = suma;
            parc_total_reconstruido = true;
        }
    }

    // ── Validación ──
    if (!parc_total_corregido) {
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
        parc_total: parc_total_corregido,
        parc_total_reconstruido,
        parc_dist_total,
        parc_dist_ocupado,
        parc_dist_libre,
        parc_dist_off,
        parc_tiempo_ocupado,
        parc_tiempo_on,
        importe: parc_total_corregido, // backward compat
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
    const crudo = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

    // La fecha, del texto sin normalizar (la normalización toca los símbolos
    // entre dígitos y estropearía 08/08/26).
    const fecha = extractDate(crudo) || undefined;

    // El resto, del texto limpio: este parser tenía la misma exposición al
    // ruido del OCR que el del taxímetro (ver C-054).
    const t = normalizarNumerosOcr(crudo);

    // ── Importe ──────────────────────────────────────────────────────────
    // El ORDEN de estos patrones importa, y es la lección del ticket real de
    // Alberto (2026-08-11). Una factura de gasolinera trae varias cifras en
    // euros y solo una es la que pagó:
    //
    //     Total Venta:        30,00 €   <- antes del descuento
    //     Dto. total:          1,30 €   <- el descuento
    //     IMPORTE A PAGAR:    28,70 €   <- ESTA
    //
    // El patrón genérico anterior (`(?:total|importe)...`) casaba primero con
    // "Dto. total: 1,30" y guardaba 1,30 € como el gasto del día. El parte
    // declaraba 28,70, así que saltaba una discrepancia de 27,40 € que no
    // existía. Lo específico va antes que lo genérico.
    //
    // OJO también con el flag /g: estos patrones lo llevaban, y con /g
    // `String.match` devuelve las coincidencias ENTERAS y descarta los grupos
    // de captura (`m[1]` siempre undefined). Por eso el importe no se
    // detectaba nunca, ni con un ticket limpio.
    const importe = extractNumCurrency(t, [
        /importe\s*a\s*pagar\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        /total\s*a\s*pagar\s*[:.]?\s*([\d]+[.,][\d]{2})/i,
        // "Total" al PRINCIPIO de línea: así "Dto. total" no cuela, porque
        // lleva el "Dto." delante.
        /(?:^|\n)\s*total[^\n\d]{0,12}?([\d]+[.,][\d]{2})/i,
        /importe[^\n\d]{0,12}?([\d]+[.,][\d]{2})/i,
        /([\d]+[.,][\d]{2})\s*€/i,
    ]) ?? undefined;

    const litros = extractNum(t, [
        /([\d]+[.,][\d]{1,3})\s*(?:l\b|lt\b|litros?\b)/i,
        /litros?\s*[:.]?\s*([\d]+[.,][\d]{1,3})/i,
        // Formato de tabla: la línea del producto y debajo la fila de
        // valores, donde los litros son el primer número.
        //     GASOLEO A PREMIUM *
        //     21,66  1,385€  1,30€  28,70€
        /(?:gasoleo|gasolina|diesel|carburante)[^\n]*\n\s*([\d]+[.,][\d]{1,3})\s/i,
    ]) ?? undefined;

    // "gasoleo" (y "gasóleo", que llega sin tilde tras normalizar) faltaba, y
    // es como lo escriben la mayoría de las gasolineras españolas. Sin él, el
    // ticket real de Alberto se daba por "no es de combustible".
    const palabrasCombustible = [
        'diesel', 'gasoil', 'gas oil', 'gasoleo', 'gasolina', 'combustible',
        'carburante', 'sin plomo', 'adblue', 'estacion de servicio', 'repsol',
        'cepsa', 'galp', 'bp ', 'shell', 'petroprix', 'ballenoil',
    ];
    const tienePalabraCombustible = palabrasCombustible.some(p => t.toLowerCase().includes(p));

    if (!importe) errores.push('No se detectó importe');
    if (!tienePalabraCombustible && !litros) errores.push('No parece ser un ticket de combustible');

    return { valido: errores.length === 0, fecha, importe, litros, errores };
}
