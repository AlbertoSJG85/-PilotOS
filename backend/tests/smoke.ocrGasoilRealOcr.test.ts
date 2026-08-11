/**
 * Regresión del ticket de COMBUSTIBLE con la salida REAL de Tesseract.
 *
 * Fixture: factura de Suministros Insulares Océano del 10/08/2026 que Alberto
 * subió en producción. Texto copiado literal de `documentos.ocr_texto`, con
 * toda su basura (incluida la mitad del pie de página del RGPD mal leída).
 *
 * Este ticket destapó tres fallos distintos del parser, y ninguno se habría
 * visto con un ejemplo inventado:
 *
 *   1. Cogía el DESCUENTO en vez del importe pagado. Una factura de
 *      gasolinera trae varias cifras en euros —"Total Venta 30,00",
 *      "Dto. total 1,30", "IMPORTE A PAGAR 28,70"— y el patrón genérico
 *      casaba primero con "Dto. total". Guardaba 1,30 € como gasto del día y
 *      levantaba una discrepancia de 27,40 € que no existía.
 *   2. "GASOLEO" no estaba en la lista de palabras de combustible (solo
 *      "gasoil"), así que el ticket se daba por "no es de combustible".
 *   3. Los litros vienen en una tabla, sin la unidad pegada al número.
 *
 * Ver smoke.ocrTicketRealOcr.test.ts para el equivalente del taxímetro y la
 * regla de fondo: un texto transcrito a mano no prueba un parser de OCR.
 */
import { describe, it, expect } from 'vitest';
import { validarTicketGasoil } from '../src/services/ocr.service';

const OCR_REAL = `OCÉANO
Ea "! LE
TADINNTA
|
SUMINISTROS INSULARES OCÉANO S.L
B38447058 - ES. SANTA CRUZ
CALLE PANAMÁ 9
SANTA CRUZ DE TENERIFE TIf.:628286159
CAE: RIPPO0036
DNI/NIF: 78717432R :
Alberto Sebastián Jiménez García
Camino La Herradura 97
38540 - Candelaria - STA CRUZ DE TENERIFE
Matrícula: 8053KKX
Contacto: Alberto Sebastián Jiménez García
FACTURA: 6/1001038602
Fecha: 10/08/2026 18:17:19
Expendecor: TPVSANTACRUZ
Producto Unid. Precio Dto. Importe
GASOLEO A PREMIUM *
21,66 1,385€ 130€ 28,70€
, Calle: 7
Importe Devolución: 1,30 €
Comercio minorista exento de Igic |
Total Venta: 30,00 €
Dto. total: 1,30 €
IMPORTE A PAGAR: 28,70 €
Tarj. Bancaria SANTACRUZ: 28,70 €
1D
OCEANITOS acumulados en esta venta: 21,00
OCEANITOS TOTALES: 132,00
`;

describe('validarTicketGasoil contra la salida REAL de Tesseract (factura 10/08/2026)', () => {
    const r = validarTicketGasoil(OCR_REAL);

    it('CRITICO: coge el IMPORTE A PAGAR, no el descuento', () => {
        // Antes daba 1.30 (el "Dto. total") y generaba una discrepancia
        // falsa de 27,40 € contra los 28,70 € declarados en el parte.
        expect(r.importe).toBeCloseTo(28.70, 2);
    });

    it('CRITICO: reconoce GASOLEO como combustible', () => {
        expect(r.valido).toBe(true);
        expect(r.errores).toEqual([]);
    });

    it('saca los litros de la fila de la tabla', () => {
        expect(r.litros).toBeCloseTo(21.66, 2);
    });

    it('lee la fecha de la factura', () => {
        // Es del 10, no del 8: que no cuadre con el parte del 08/08 es una
        // discrepancia REAL y el sistema hace bien en avisar. No se "arregla".
        expect(r.fecha).toBe('10/08/2026');
    });

    it('no se queda con ninguna de las otras cifras en euros del ticket', () => {
        expect(r.importe).not.toBeCloseTo(30.00, 2); // Total Venta (antes del dto.)
        expect(r.importe).not.toBeCloseTo(1.30, 2);  // el descuento
        expect(r.importe).not.toBeCloseTo(21.00, 2); // "OCEANITOS" acumulados
    });
});
