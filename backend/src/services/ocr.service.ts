import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { transcribirImagen, lectorDisponible } from '../vendor/nexos-ocr-vision';

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
    /** Con qué se leyó al final. Para poder diagnosticar una lectura mala. */
    tuberia?: 'ticket' | 'documento' | 'vision';
    /** Solo con visión: los trozos que el modelo dice no haber leído seguro. */
    dudas?: string[];
    /** Solo con visión: qué modelo lo leyó. */
    modelo?: string;
}

/**
 * Confianza que se le asigna a una lectura por visión.
 *
 * NO es una medida — es un valor de conveniencia, y conviene saberlo. Tesseract
 * devuelve un porcentaje calculado; un modelo de visión no: declara si ha
 * leído con seguridad (booleano) y enumera sus dudas. Como el resto del
 * sistema habla en confianzas, se traduce a un número: 95 cuando dice que lo
 * ha leído bien, 40 cuando declara dudas (por debajo del umbral de "legible",
 * para que el documento pase por revisión humana).
 *
 * Lo que vale de verdad es `dudas`. Un número inventado no debe leerse como
 * una medición: por eso está aquí escrito y no escondido en una constante.
 */
const CONFIANZA_VISION_SEGURA = 95;
const CONFIANZA_VISION_CON_DUDAS = 40;

/**
 * Por debajo de esta confianza, la primera lectura se da por mala y se
 * reintenta con la tubería de documento (ver `extraerTextoImagen`). No es el
 * umbral de "legible" (60): es el de "esto ha salido tan mal que merece la
 * pena gastar otros diez segundos". Los dos tickets reales del repositorio
 * salen a 64 y 73, así que un ticket normal NUNCA paga ese coste.
 */
const UMBRAL_SEGUNDO_INTENTO = 45;

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
function sufijoTemporal(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function prepararImagenParaOcr(imagenPath: string): Promise<string> {
    // Nombre único: con uno fijo, dos lecturas de la misma foto a la vez se
    // pisaban el temporal (una lo borraba mientras la otra lo leía). Lo
    // destapaban los tests de la foto real al correr en paralelo.
    const salida = `${imagenPath.replace(/\.(jpe?g|png|webp)$/i, '')}.${sufijoTemporal()}.ocr.png`;
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

/**
 * Prepara un DOCUMENTO —una factura A4, una tarjeta ITV— antes de Tesseract
 * (2026-08-12, C-064).
 *
 * POR QUÉ HACE FALTA OTRA. La tubería de arriba está afinada contra tickets
 * térmicos: tira estrecha, letra grande, fondo uniforme. La primera factura
 * real de taller que subió Alberto era lo contrario —un A4 con tabla de
 * líneas, y encima fotografiado de la PANTALLA de un ordenador, con muaré—
 * y salió a 31 de confianza: 3.465 caracteres de ruido de los que solo se
 * salvaba alguna palabra suelta. La fecha no se leyó, el total tampoco.
 *
 * QUÉ HACE DISTINTO, y es lo que arregla el caso:
 *   1. Divide la imagen por su propio fondo desenfocado. Eso quita de golpe
 *      el gradiente de luz de la pantalla y buena parte del muaré, que es
 *      justo lo que ahogaba el texto pequeño.
 *   2. Binariza (`threshold`). En la tubería de tickets esto está PROHIBIDO
 *      porque los mata; aquí es imprescindible.
 *
 * ── CÓMO SE ELIGIERON LOS NÚMEROS ────────────────────────────────────────
 * Barriendo sigma (8/15/25) × umbral (140/150/160/170) contra la factura real
 * y contando cuántos de 12 datos verificables aparecían (fecha, total, base,
 * las cuatro piezas, el número de factura...):
 *
 *   sigma 8  / 150   10/12
 *   sigma 15 / 140   10/12
 *   sigma 25 / 140   11/12
 *   sigma 25 / 150   12/12  ← esta, y sus vecinas también puntúan alto,
 *                             así que es una meseta y no un pico afortunado
 *   sigma 25 / 170    6/12
 *
 * ── HONESTIDAD ───────────────────────────────────────────────────────────
 * Está ajustada contra UNA sola factura. Es exactamente la trampa de C-060
 * (ajustar contra una foto y cantar victoria), y aquí no hay más remedio
 * porque solo hay una. Por eso se eligió un punto con vecinos buenos en vez
 * del máximo aislado, y por eso esta tubería NO sustituye a la de tickets:
 * se probó, y deja los dos tickets reales en 0 de 4 datos correctos.
 */
async function prepararDocumentoParaOcr(imagenPath: string): Promise<string> {
    const salida = `${imagenPath.replace(/\.(jpe?g|png|webp)$/i, '')}.${sufijoTemporal()}.doc.png`;
    const gris = sharp(imagenPath).grayscale();
    const { data, info } = await gris.clone().raw().toBuffer({ resolveWithObject: true });
    const fondo = await gris.clone().blur(25).raw().toBuffer();

    // Cada píxel dividido por su fondo local. El 200 deja el papel cerca del
    // blanco sin saturar la tinta.
    const plano = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
        plano[i] = Math.min(255, Math.round((data[i] / Math.max(fondo[i], 1)) * 200));
    }

    const anchoObjetivo = Math.min(Math.round(info.width * 2), 5000);
    await sharp(plano, { raw: { width: info.width, height: info.height, channels: 1 } })
        .normalize()
        .resize({ width: anchoObjetivo, kernel: 'lanczos3' })
        .threshold(150)
        .png()
        .toFile(salida);

    return salida;
}

/**
 * Lee la imagen, y si sale mal lo vuelve a intentar de otra manera.
 *
 * El segundo intento (C-064) solo se paga cuando la primera lectura es mala
 * de verdad (confianza < 45): un ticket normal sale a 60-75 y no pasa por
 * aquí. Se queda la lectura con más confianza de las dos, que es lo que
 * impide que este reintento estropee un caso que ya funcionaba: si la tubería
 * de documento lo hace peor —y con un ticket térmico lo hace mucho peor— su
 * resultado se descarta.
 */
/**
 * Lee el papel con un modelo de visión (2026-08-13, C-068).
 *
 * ── POR QUÉ ES EL PRIMER LECTOR ──────────────────────────────────────────
 * Tesseract lleva cinco correcciones encima por el mismo síntoma (C-043,
 * C-054, C-055, C-056, C-060, C-064): lee "2938" donde el papel pone "298".
 * No es un fallo del parser ni del preprocesado — es que reconoce formas sin
 * entender qué mira. Un modelo de visión sabe que "Borrados" lleva detrás un
 * contador que sube de uno en uno.
 *
 * El 2026-08-12, con la tubería vieja: el ticket de las 23:21 leyó 2938 donde
 * ponía 298, y generó dos alertas falsas. Ese es el caso que esto resuelve.
 *
 * ── SIGUE HABIENDO TESSERACT DETRÁS, Y NO ES PROVISIONAL ─────────────────
 * Si no hay clave, si OpenAI está caído, si tarda demasiado o si devuelve
 * algo raro, se lee como siempre. Un proveedor externo no puede ser un punto
 * único de fallo para que un ticket entre en el sistema.
 *
 * ── APAGADO POR DEFECTO ──────────────────────────────────────────────────
 * Sin `OPENAI_API_KEY` no se intenta siquiera. `OCR_VISION_ENABLED=false`
 * lo apaga aunque la clave esté puesta — un interruptor para volver atrás en
 * segundos sin desplegar nada.
 */
async function intentarConVision(imagenPath: string, contexto: string): Promise<OCRResult | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!lectorDisponible(apiKey)) return null;
    if (process.env.OCR_VISION_ENABLED === 'false') return null;

    const mimePorExtension: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    };
    const extension = path.extname(imagenPath).toLowerCase();
    const mime = mimePorExtension[extension];
    if (!mime) return null; // formato que el modelo no acepta: a Tesseract

    let base64: string;
    try {
        base64 = fs.readFileSync(imagenPath).toString('base64');
    } catch {
        return null;
    }

    // El módulo promete no lanzar nunca. Aun así se envuelve, y no es
    // desconfianza gratuita: la promesa de una pieza es suya, la garantía de
    // que el ticket entre es de aquí. Un test tumbó esta función el mismo día
    // que se escribió por saltarse esto.
    let t;
    try {
        t = await transcribirImagen(base64, mime, contexto, {
            apiKey: apiKey!,
            modelo: process.env.OCR_VISION_MODELO,
            timeoutMs: Number(process.env.OCR_VISION_TIMEOUT_MS) || 30_000,
        });
    } catch (err: any) {
        console.warn('[OCR] El lector por visión falló, se sigue con Tesseract:', err?.message ?? err);
        return null;
    }
    if (!t) return null;

    if (t.dudas.length > 0) {
        console.log(`[OCR] Visión (${t.modelo}) con dudas: ${t.dudas.join(' · ')}`);
    } else {
        console.log(`[OCR] Leído con visión (${t.modelo})`);
    }

    return {
        texto: limpiarTextoOcr(t.texto),
        confianza: t.legible && t.dudas.length === 0 ? CONFIANZA_VISION_SEGURA : CONFIANZA_VISION_CON_DUDAS,
        legible: t.legible,
        tuberia: 'vision',
        dudas: t.dudas.map(limpiarTextoOcr),
        modelo: t.modelo,
    };
}

/**
 * Quita los caracteres de control del texto leído (2026-11-10).
 *
 * Con el ticket de "LISTADO DE TURNO" OpenAI devolvió dos veces un carácter de
 * control donde el papel lleva el "€": `\u0002` en una lectura y `\u0000`
 * (NUL) en otra. PostgreSQL no admite NUL en un texto, así que guardar el
 * documento fallaba con "invalid byte sequence for encoding UTF8: 0x00" y la
 * subida del ticket daba error 500: el parte no se podía enviar. Se sustituyen
 * por un espacio (no por nada, para no pegar dos palabras o cifras) y se
 * conservan el salto de línea y el tabulador.
 */
export function limpiarTextoOcr(texto: string): string {
    return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
}

export async function extraerTextoImagen(
    imagenPath: string,
    contexto = 'documento fotografiado',
): Promise<OCRResult> {
    // Primero el que entiende lo que lee. Si no puede, se sigue como siempre.
    const porVision = await intentarConVision(imagenPath, contexto);
    if (porVision) return porVision;

    const temporales: string[] = [];
    try {
        // Si la preparación falla (imagen rara, sin memoria...), se sigue con
        // la original: peor lectura, pero lectura al fin y al cabo.
        let rutaPreparada: string | null = null;
        try {
            rutaPreparada = await prepararImagenParaOcr(imagenPath);
            temporales.push(rutaPreparada);
        } catch (err: any) {
            console.warn('[OCR] No se pudo preparar la imagen, se usa la original:', err?.message);
        }

        const primera = await reconocer(rutaPreparada ?? imagenPath);
        let mejor: OCRResult = { ...primera, tuberia: 'ticket' };

        if (primera.confianza < UMBRAL_SEGUNDO_INTENTO) {
            console.log(`[OCR] Confianza ${primera.confianza.toFixed(0)}: segundo intento como documento`);
            try {
                const rutaDoc = await prepararDocumentoParaOcr(imagenPath);
                temporales.push(rutaDoc);
                const segunda = await reconocer(rutaDoc);
                if (segunda.confianza > primera.confianza) {
                    console.log(`[OCR] Gana la tubería de documento (${segunda.confianza.toFixed(0)})`);
                    mejor = { ...segunda, tuberia: 'documento' };
                }
            } catch (err: any) {
                // Que falle el reintento no puede estropear la lectura que ya
                // teníamos, por mala que fuera.
                console.warn('[OCR] Falló el segundo intento:', err?.message);
            }
        }

        return { ...mejor, legible: mejor.confianza >= UMBRAL_CONFIANZA };
    } catch (error: any) {
        console.error('[OCR] Error en Tesseract (no implica imagen ilegible):', error.message);
        return { texto: '', confianza: 0, legible: false, error_ocr: 'tesseract_error' };
    } finally {
        // Los PNG preparados son de usar y tirar: pesan más que el original y
        // ya no sirven de nada. Si no se pueden borrar, tampoco es grave.
        for (const ruta of temporales) {
            try { fs.unlinkSync(ruta); } catch { /* da igual */ }
        }
    }
}

/** Una pasada de Tesseract. Sin decidir nada: solo texto y confianza. */
async function reconocer(ruta: string): Promise<OCRResult> {
    const { data } = await Tesseract.recognize(ruta, 'spa', {
        logger: (m) => {
            if (m.status === 'recognizing text') {
                console.log(`OCR progreso: ${Math.round(m.progress * 100)}%`);
            }
        },
    });
    return { texto: limpiarTextoOcr(data.text), confianza: data.confidence, legible: data.confidence >= UMBRAL_CONFIANZA };
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
export function normalizarNumerosOcr(t: string): string {
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

    /**
     * Qué modelo de ticket se reconoció. `taxitronic`: acumulado + campos del
     * turno con "P " + Borrados. `listado_turno_taxi`: "LISTADO DE TURNO" /
     * "LISTADO DE TAXI" con campos numerados (1.KM TOTALES, E12.TOTAL RECAUD...).
     */
    formato?: 'taxitronic' | 'listado_turno_taxi';

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

// ─────────────────────────────────────────────────────────
// Modelo "LISTADO DE TURNO / LISTADO DE TAXI" (2026-11-10)
// ─────────────────────────────────────────────────────────
//
// El taxímetro de la tía de Alberto no es un Taxitronic. Imprime los mismos
// datos clave con otros nombres y en otro orden:
//
//     LISTADO DE TURNO              354   <- nº de listado = "Borrados"
//     DNI / LM: 633-S.CRUZ / MAT / 12:40   09.11.26
//     LISTADO DE TURNO                    <- bloque del turno (parcial)
//       1.KM. TOTALES    14967,8
//       2.KM. OCUPADOS    6826,1
//       3.VIAJES            1575
//       4.SUPLEMENTOS   € 695,10
//      12.TOTAL SERV.   € 12621,00        <- = "Carreras" del Taxitronic
//     E12.TOTAL RECAUD  € 13316,10        <- = "Total"
//     LISTADO DE TAXI                     <- bloque del acumulado
//       (los mismos campos)
//     INI. FIN. KM.L. KM.O. IMP.          <- lista de viajes (no se usa)
//
// Lo que obliga a un lector propio, y no a añadir patrones al del Taxitronic:
//   - Los mismos nombres salen en los dos bloques; solo la cabecera dice si
//     es turno o acumulado. Sin ella, el primer "TOTAL RECAUD" que se
//     encuentre puede ser el del taxi entero.
//   - No imprime las líneas a cero. Un turno vacío (ticket 355 de prueba)
//     trae la cabecera y nada más; el lector viejo habría cogido entonces los
//     47.139 € del taxi como importe del turno sin avisar.
//   - No tiene "Borrados". El equivalente es el número correlativo junto al
//     título: cada listado de turno impreso lo sube en uno (confirmado por
//     Alberto con los tickets 354/355/356).
//
// Coherencia que se comprueba igual que en el Taxitronic:
//   TOTAL SERV. + SUPLEMENTOS = TOTAL RECAUD (verificado en los tres tickets).

// "tax[i1l]" : la I final es la letra que el OCR confunde más (1, l).
const CABECERA_LISTADO = /listado\s+de\s+(turno|tax[i1l])\b/i;
const INICIO_LISTA_VIAJES = /\bini\.?\s+fin\b/i;

type CampoListado =
    | 'km_totales' | 'km_ocupados' | 'viajes' | 'suplementos'
    | 'salto' | 'incr_tiempo' | 'total_serv' | 'total_recaud';

// Se reconoce cada dato por su NOMBRE, no por su posición ni por el número que
// lleva delante: si un día sale en otro orden, o el OCR se come el "12.", el
// dato sigue siendo el mismo. TOTAL RECAUD va antes que TOTAL SERV para que
// ninguno de los dos se lleve la línea del otro.
const CAMPOS_LISTADO: Array<{ campo: CampoListado; etiqueta: RegExp; euros?: boolean }> = [
    { campo: 'total_recaud', etiqueta: /total\.?\s*recau\w*\.?/i, euros: true },
    { campo: 'total_serv', etiqueta: /total\.?\s*serv\w*\.?/i, euros: true },
    { campo: 'km_totales', etiqueta: /\bkm\.?\s*total\w*\.?/i },
    { campo: 'km_ocupados', etiqueta: /\bkm\.?\s*ocup\w*\.?/i },
    { campo: 'viajes', etiqueta: /\bviajes?\b\.?/i },
    { campo: 'suplementos', etiqueta: /su.{0,2}lement\w*\.?/i, euros: true },
    { campo: 'salto', etiqueta: /\bsalto\b\.?/i, euros: true },
    { campo: 'incr_tiempo', etiqueta: /incr\w*\.?\s*tiempo\.?/i, euros: true },
];

/**
 * Un IMPORTE en euros: cifra con exactamente dos decimales ("3,85",
 * "41205,41", "5.937,45"). El ticket los imprime siempre así, y eso es lo que
 * permite distinguirlos del "€" cuando el lector lo transcribe mal.
 *
 * El símbolo "€" no llega siempre igual (visto en el ticket de la tía con
 * OpenAI, 2026-11-10): "€", "0", "03" ("12.TOTAL SERV.  03 3,85" — y se leyó
 * 3,00 € en vez de 3,85 € sin ningún aviso), pegado a la cifra ("03,85") o
 * como un carácter de control. Por eso, en un importe se toma la ÚLTIMA cifra
 * con dos decimales de la línea y se ignora lo que haya delante.
 */
const IMPORTE_EUROS = /\d[\d.,]*[.,]\d{2}(?!\d)/g;

/** Línea que, aparte de cifras y símbolos sueltos, no trae palabras (valor bajado de renglón). */
const LINEA_SIN_PALABRAS = /^[^A-Za-z]*(?:eur[^A-Za-z]*)?$/i;

function ultimoImporte(texto: string): string | undefined {
    const m = texto.match(IMPORTE_EUROS);
    if (!m) return undefined;
    // "03,85" es "€" + "3,85" pegados: un cero delante de otra cifra no existe
    // en un importe real ("0,85" lleva coma justo detrás del cero).
    return m[m.length - 1].replace(/^0+(?=\d)/, '');
}

export function esListadoTurnoTaxi(t: string): boolean {
    return /listado\s+de\s+tax[i1l]\b/i.test(t) || /total\.?\s*recau/i.test(t);
}

/**
 * "88.490,1" -> 88490.1, "13316,10" -> 13316.1, "1575" -> 1575.
 * El último separador es el decimal salvo que lleve detrás exactamente tres
 * cifras (entonces es de miles). En este ticket los km llevan un decimal, los
 * euros dos y los contadores ninguno, así que no hay ambigüedad.
 */
function numeroListado(s: string): number | undefined {
    const x = s.replace(/[.,]+$/, '');
    const ult = Math.max(x.lastIndexOf(','), x.lastIndexOf('.'));
    let v: number;
    if (ult === -1) {
        v = Number(x);
    } else {
        const entero = x.slice(0, ult).replace(/[.,]/g, '');
        const decimales = x.slice(ult + 1);
        v = decimales.length === 3 ? Number(entero + decimales) : Number(`${entero}.${decimales}`);
    }
    return Number.isFinite(v) ? v : undefined;
}

function esEtiquetaOCabecera(linea: string): boolean {
    return CABECERA_LISTADO.test(linea) || CAMPOS_LISTADO.some((c) => c.etiqueta.test(linea));
}

/**
 * Parte el ticket por sus cabeceras y lee los campos de cada bloque.
 * Lo que va antes de la primera cabecera (restos del ticket anterior, como
 * "FIN: 12:41 0,0") y la lista de viajes del final no cuentan.
 */
function leerBloquesListado(lineas: string[]) {
    const bloques: Record<'turno' | 'taxi', Partial<Record<CampoListado, number>>> = { turno: {}, taxi: {} };
    const vistos = { turno: false, taxi: false };
    let actual: 'turno' | 'taxi' | null = null;

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        const cab = linea.match(CABECERA_LISTADO);
        if (cab) {
            actual = cab[1].toLowerCase().startsWith('tur') ? 'turno' : 'taxi';
            vistos[actual] = true;
            continue;
        }
        if (INICIO_LISTA_VIAJES.test(linea)) { actual = null; continue; }
        if (!actual) continue;

        for (const { campo, etiqueta, euros } of CAMPOS_LISTADO) {
            const m = linea.match(etiqueta);
            if (!m) continue;
            // El valor va DESPUÉS de la etiqueta: lo de delante es el código
            // ("12.", "E12.") y no hay que confundirlo con la cifra.
            const resto = linea.slice((m.index ?? 0) + m[0].length);
            let crudo = euros ? ultimoImporte(resto) : resto.match(/(\d[\d.,]*)/)?.[1];
            if (!crudo) {
                // El valor bajado de renglón, saltando líneas en blanco: OpenAI
                // las mete a veces entre la etiqueta y su valor (ticket 356).
                let k = i + 1;
                while (k < lineas.length && k <= i + 3 && lineas[k].trim() === '') k++;
                const siguiente = lineas[k] ?? '';
                if (!esEtiquetaOCabecera(siguiente) && LINEA_SIN_PALABRAS.test(siguiente)) {
                    crudo = euros ? ultimoImporte(siguiente) : siguiente.match(/(\d[\d.,]*)/)?.[1];
                }
            }
            const v = crudo ? numeroListado(crudo) : undefined;
            // El primero que aparece en el bloque manda: no se pisa.
            if (v !== undefined && bloques[actual][campo] === undefined) bloques[actual][campo] = v;
            break;
        }
    }
    return { bloques, vistos };
}

/** El número correlativo del listado ("LISTADO DE TURNO   354"): hace de Borrados. */
function numeroDeListado(lineas: string[]): number | undefined {
    const i = lineas.findIndex((l) => /listado\s+de\s+turno/i.test(l));
    if (i < 0) return undefined;
    const enLaLinea = lineas[i].match(/listado\s+de\s+turno\s*[:.]?\s*(?:n[oº°.]*\s*)?(\d{1,7})\s*$/i);
    if (enLaLinea) return Number(enLaLinea[1]);
    // El transcriptor puede bajarlo (o subirlo) a su propia línea.
    for (const j of [i + 1, i - 1]) {
        const m = lineas[j]?.match(/^\s*(?:n[oº°.]*\s*)?(\d{1,7})\s*$/i);
        if (m) return Number(m[1]);
    }
    return undefined;
}

function redondear(v: number, decimales: number): number {
    const f = 10 ** decimales;
    return Math.round(v * f) / f;
}

export function validarListadoTurnoTaxi(t: string): DatosTaximetro {
    const errores: string[] = [];
    const lineasCrudas = t.split('\n');

    // Fecha y hora, de la cabecera del ticket (desde el primer "LISTADO DE
    // TURNO" hasta el bloque siguiente) y del texto SIN normalizar. Así no se
    // cuela la hora de un viaje del ticket anterior que haya quedado encima.
    const iTitulo = lineasCrudas.findIndex((l) => CABECERA_LISTADO.test(l));
    const iSiguiente = iTitulo >= 0
        ? lineasCrudas.findIndex((l, k) => k > iTitulo && CABECERA_LISTADO.test(l))
        : -1;
    const cabecera = iTitulo >= 0
        ? lineasCrudas.slice(iTitulo, iSiguiente > 0 ? iSiguiente : undefined).join('\n')
        : t;
    const fecha = extractDate(cabecera) ?? extractDate(t) ?? undefined;
    const hora = extractTime(cabecera) ?? undefined;
    // "LM: 633-S.CRUZ" es la licencia municipal. "LICENCIA No 1" es un número
    // interno del aparato y no sirve.
    const licencia = cabecera.match(/\bL\.?\s?M\.?\s*[:.]?\s*(\d+)/i)?.[1];

    // Sin normalizarNumerosOcr: esa limpieza está hecha para el ruido de
    // Tesseract (separadores que se leen como » ; "), y aquí estorba. Con el
    // "€" leído como "03" (`03 12,10`) la regla de "decimal perdido" pegaba el
    // "03" y el "12" en "03.12,10" y se perdía el importe. Las cifras de este
    // ticket se leen por su forma (ver IMPORTE_EUROS).
    const lineas = lineasCrudas;
    const { bloques, vistos } = leerBloquesListado(lineas);
    const turno = bloques.turno;
    const taxi = bloques.taxi;
    const acum_borrados = numeroDeListado(lineas);

    const libre = (b: Partial<Record<CampoListado, number>>) =>
        b.km_totales !== undefined && b.km_ocupados !== undefined && b.km_totales >= b.km_ocupados
            ? redondear(b.km_totales - b.km_ocupados, 1)
            : undefined;

    // Coherencia del turno: TOTAL SERV. + SUPLEMENTOS = TOTAL RECAUD. Misma
    // regla que en el Taxitronic: si no cuadra, mandan las dos que suman.
    // Si SUPLEMENTOS no viene es porque es cero y no se imprime: entonces no
    // se reconstruye nada, se queda el TOTAL RECAUD tal y como se leyó.
    const totalCoherente = (b: Partial<Record<CampoListado, number>>) => {
        if (b.total_serv !== undefined && b.suplementos !== undefined) {
            const suma = redondear(b.total_serv + b.suplementos, 2);
            if (b.total_recaud === undefined || Math.abs(suma - b.total_recaud) > 1) {
                return { valor: suma, reconstruido: true };
            }
        }
        return { valor: b.total_recaud, reconstruido: false };
    };
    const totTurno = totalCoherente(turno);
    let parc_total = totTurno.valor;
    const parc_total_reconstruido = totTurno.reconstruido;
    // También en el acumulado, a diferencia del Taxitronic: con el ticket 355,
    // roto justo por esa cifra, OpenAI transcribió "E12.TOTAL RECAUD 4713"
    // (el papel pone 47139,01) sin declarar ninguna duda. Contra 4713 la
    // comparación entre tickets daba un desplome imposible del acumulado.
    const acum_total = totalCoherente(taxi).valor;

    // ── Validación ──
    const turnoVacio = Object.keys(turno).length === 0;
    if (!vistos.turno) {
        errores.push('No se encontró el bloque LISTADO DE TURNO en el ticket');
    } else if (turnoVacio) {
        // Punto muerto detectado con el ticket 355: el turno sale en blanco y
        // lo único con cifras es el acumulado. Nunca se toma el acumulado por
        // el turno; el ticket se queda para revisar a mano.
        errores.push('El LISTADO DE TURNO viene vacío: el ticket no trae los datos del turno');
    } else if (!parc_total) {
        errores.push('No se pudo detectar el importe del turno (E12. TOTAL RECAUD)');
    }
    if (!fecha) errores.push('No se detectó fecha en el ticket');

    // El turno es una parte del acumulado: no puede ser mayor. Si lo es, una
    // de las dos cifras está mal leída (o el taxímetro se reinició), y
    // comparar contra ella daría avisos falsos.
    const parejas: Array<[string, number | undefined, number | undefined]> = [
        ['TOTAL RECAUD', parc_total, acum_total],
        ['TOTAL SERV.', turno.total_serv, taxi.total_serv],
        ['VIAJES', turno.viajes, taxi.viajes],
        ['KM. TOTALES', turno.km_totales, taxi.km_totales],
    ];
    for (const [nombre, p, a] of parejas) {
        if (p !== undefined && a !== undefined && p > a + 0.01) {
            errores.push(`El turno marca más ${nombre} (${p}) que el acumulado del taxi (${a}): una de las dos cifras está mal leída`);
        }
    }

    return {
        fecha,
        hora,
        licencia,
        acum_num_servicios: taxi.viajes,
        acum_carreras: taxi.total_serv,
        acum_suplementos: taxi.suplementos,
        acum_total,
        acum_dist_total: taxi.km_totales,
        acum_dist_ocupado: taxi.km_ocupados,
        acum_dist_libre: libre(taxi),
        acum_borrados,
        parc_num_servicios: turno.viajes,
        parc_carreras: turno.total_serv,
        parc_suplementos: turno.suplementos,
        parc_total,
        parc_total_reconstruido,
        // Los km de este ticket vienen siempre en km con un decimal: no se
        // aplica la conversión metros→km del Taxitronic.
        parc_dist_total: turno.km_totales,
        parc_dist_ocupado: turno.km_ocupados,
        parc_dist_libre: libre(turno),
        importe: parc_total,
        formato: 'listado_turno_taxi',
        valido: errores.length === 0,
        errores,
    };
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

    // Otro modelo de taxímetro, otro papel: se lee con su propio lector y el
    // del Taxitronic no se toca (ver validarListadoTurnoTaxi).
    if (esListadoTurnoTaxi(t)) return validarListadoTurnoTaxi(t);

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
        formato: 'taxitronic',
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
