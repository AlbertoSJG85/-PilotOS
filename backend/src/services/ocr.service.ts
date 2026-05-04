import Tesseract from 'tesseract.js';
import sharp from 'sharp';

// Umbral de confianza para considerar una foto legible
const UMBRAL_CONFIANZA = 60; // porcentaje

export interface OCRResult {
    texto: string;
    confianza: number;
    legible: boolean;
    error_ocr?: string;
}

/**
 * Extrae texto de una imagen usando Tesseract.js
 * Optimizado para tickets de taxímetro y gasoil
 */
export async function extraerTextoImagen(imagenPath: string): Promise<OCRResult> {
    try {
        // 1. Validar imagen antes de pasarla a Tesseract (evita crash por imagen corrupta)
        try {
            await sharp(imagenPath).metadata();
        } catch (err: any) {
            console.warn('[OCR] Imagen corrupta o ilegible detectada por Sharp:', err.message);
            return {
                texto: '',
                confianza: 0,
                legible: false,
                error_ocr: 'imagen_corrupta',
            };
        }

        // 2. Ejecutar Tesseract con timeout y catch-all
        const { data } = await Tesseract.recognize(imagenPath, 'spa', {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR progreso: ${Math.round(m.progress * 100)}%`);
                }
            },
        });

        const confianza = data.confidence;
        const legible = confianza >= UMBRAL_CONFIANZA;

        return {
            texto: data.text,
            confianza,
            legible,
        };
    } catch (error: any) {
        // El OCR NUNCA debe tumbar el proceso
        console.error('[OCR] Error crítico en Tesseract:', error.message);
        return {
            texto: '',
            confianza: 0,
            legible: false,
            error_ocr: 'tesseract_error',
        };
    }
}

/**
 * Valida un ticket de taxímetro
 * Busca patrones comunes en tickets de taxi
 */
export function validarTicketTaximetro(texto: string): {
    valido: boolean;
    importe?: number;
    errores: string[];
} {
    const errores: string[] = [];
    let importe: number | undefined;

    // Patrones comunes en tickets de taxímetro
    const patronImporte = /(?:total|importe|€|eur)\s*[:.]?\s*(\d+[.,]\d{2})/gi;
    const matchImporte = patronImporte.exec(texto);

    if (matchImporte) {
        importe = parseFloat(matchImporte[1].replace(',', '.'));
    } else {
        // Buscar cualquier número que parezca un importe
        const patronNumero = /(\d{1,3}[.,]\d{2})/g;
        const matches = texto.match(patronNumero);
        if (matches && matches.length > 0) {
            // Tomar el último número (suele ser el total)
            importe = parseFloat(matches[matches.length - 1].replace(',', '.'));
        }
    }

    if (!importe) {
        errores.push('No se pudo detectar el importe del ticket');
    }

    // Buscar fecha
    const patronFecha = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/;
    if (!patronFecha.test(texto)) {
        errores.push('No se detectó fecha en el ticket');
    }

    return {
        valido: errores.length === 0,
        importe,
        errores,
    };
}

/**
 * Valida un ticket de gasoil
 * Busca patrones de combustible
 */
export function validarTicketGasoil(texto: string): {
    valido: boolean;
    importe?: number;
    litros?: number;
    errores: string[];
} {
    const errores: string[] = [];
    let importe: number | undefined;
    let litros: number | undefined;

    // Patrones para importe
    const patronImporte = /(?:total|importe|€|eur)\s*[:.]?\s*(\d+[.,]\d{2})/gi;
    const matchImporte = patronImporte.exec(texto);
    if (matchImporte) {
        importe = parseFloat(matchImporte[1].replace(',', '.'));
    }

    // Patrones para litros
    const patronLitros = /(\d+[.,]\d{1,3})\s*(?:l|lt|litros?)/gi;
    const matchLitros = patronLitros.exec(texto);
    if (matchLitros) {
        litros = parseFloat(matchLitros[1].replace(',', '.'));
    }

    // Palabras clave de combustible
    const palabrasCombustible = ['diesel', 'gasoil', 'gasolina', 'combustible', 'carburante'];
    const tienePalabraCombustible = palabrasCombustible.some(
        palabra => texto.toLowerCase().includes(palabra)
    );

    if (!importe) {
        errores.push('No se detectó importe');
    }

    if (!tienePalabraCombustible && !litros) {
        errores.push('No parece ser un ticket de combustible');
    }

    return {
        valido: errores.length === 0,
        importe,
        litros,
        errores,
    };
}
