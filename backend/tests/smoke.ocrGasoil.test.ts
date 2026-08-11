/**
 * Regresión del ticket de combustible (2026-08-11).
 *
 * `validarTicketGasoil` NUNCA había detectado el importe, ni con un ticket
 * perfectamente limpio: sus cuatro patrones llevaban el flag `/g`, y con `/g`
 * `String.match` devuelve las coincidencias ENTERAS y descarta los grupos de
 * captura, así que `m[1]` era siempre undefined.
 *
 * Consecuencia: todo ticket de gasolinera salía "No se detectó importe" →
 * inválido → el combustible declarado no se contrastaba jamás. Los patrones
 * del taxímetro no llevaban `/g`, por eso ese lado sí funcionaba y este no.
 *
 * Se descubrió por carambola: al aplicarle al parser de gasoil la misma
 * limpieza de ruido OCR que necesitaba el del taxímetro, el caso "limpio"
 * seguía fallando — y eso no cuadraba.
 *
 * PENDIENTE: nada de esto está verificado contra la salida real de Tesseract
 * sobre una foto de gasolinera, porque no había ninguna subida. Cuando haya
 * una, hay que añadir su texto literal aquí como fixture, igual que en
 * smoke.ocrTicketRealOcr.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { validarTicketGasoil } from '../src/services/ocr.service';

describe('validarTicketGasoil', () => {
    it('CRITICO: detecta el importe en un ticket limpio (antes fallaba por el flag /g)', () => {
        const r = validarTicketGasoil('GASOLINERA\nFECHA: 08/08/2026\nDIESEL\n20,50 L\nTotal: 28,70 EUR');
        expect(r.importe).toBeCloseTo(28.70, 2);
        expect(r.litros).toBeCloseTo(20.5, 2);
        expect(r.valido).toBe(true);
    });

    it('aguanta el ruido del OCR en las cifras (» como separador decimal)', () => {
        const r = validarTicketGasoil('ESTACION\nFECHA: 08/08/26\nGASOLEO A\nLitros: 20»50\nTotal! 28»70 EUR');
        expect(r.importe).toBeCloseTo(28.70, 2);
        expect(r.valido).toBe(true);
    });

    it('formato con símbolo de euro y sin la palabra "total"', () => {
        const r = validarTicketGasoil('REPSOL\n08/08/2026\nGasolina 95\n28,70 €');
        expect(r.importe).toBeCloseTo(28.70, 2);
        expect(r.valido).toBe(true);
    });

    it('lee la fecha sin que la normalización la rompa', () => {
        const r = validarTicketGasoil('REPSOL\nFECHA: 08/08/2026\nDIESEL\nTotal: 28,70 €');
        expect(r.fecha).toBe('08/08/2026');
    });

    it('un ticket que no es de combustible se rechaza', () => {
        const r = validarTicketGasoil('FARMACIA\n08/08/2026\nTotal: 12,30 €');
        expect(r.valido).toBe(false);
        expect(r.errores.join(' ')).toMatch(/no parece ser un ticket de combustible/i);
    });

    it('sin importe se rechaza con el motivo claro', () => {
        const r = validarTicketGasoil('GASOLINERA\n08/08/2026\nDIESEL');
        expect(r.valido).toBe(false);
        expect(r.errores.join(' ')).toMatch(/no se detect/i);
    });
});
