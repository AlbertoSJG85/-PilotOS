/**
 * Test de regresión con la FOTO REAL de la primera factura de taller que
 * entró en el sistema (2026-08-12, C-064).
 *
 * Es el hermano de `smoke.ocrImagenReal` —el de los tickets del taxímetro— y
 * existe por el mismo motivo: el fallo no estaba en el parser, estaba antes,
 * en cómo se le daba la imagen a Tesseract. Con el texto ya destrozado
 * ningún patrón podía acertar.
 *
 * La foto es difícil a propósito, porque es la que llegó de verdad: Alberto
 * fotografió la factura EN LA PANTALLA de un ordenador, con el muaré que eso
 * produce. Con la tubería de tickets salía a 31 de confianza y no se leía ni
 * la fecha ni el total.
 *
 * LO QUE PONE EL PAPEL, mirándolo con los ojos:
 *   Factura INV/2026/0193, de fecha 13/05/2026
 *   KIT DISTRIBUCION Y BOMBA DE AGUA   154,15 €
 *   CORREA ALTERNADOR                   21,83 €
 *   TUBO EMBRAGUE (ORIGINAL)            72,83 €
 *   AGUA REFRIGERANTE 50 %              10,00 €
 *   MANO DE OBRA TAXI                  112,50 €
 *   Base imponible 371,31 €  ·  Impuesto 26,00 €  ·  TOTAL 397,31 €
 *
 * Si alguien toca la preparación de imagen o el parser de facturas y esto se
 * pone rojo, ha roto la lectura de facturas reales. No relajes los valores.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { extraerTextoImagen } from '../src/services/ocr.service';
import { analizarDocumentoVehiculo } from '../src/services/ocrDocumentoVehiculo.service';

const FOTO = path.join(__dirname, 'fixtures', 'factura-taller-2026-08-12.jpg');

describe('la factura de taller real del 13/05/2026, de principio a fin', () => {
    it('lee el total, la fecha y las piezas que se cambiaron', async () => {
        const ocr = await extraerTextoImagen(FOTO);

        // Con la tubería de tickets esta foto daba 31. El segundo intento como
        // documento es lo que la sube; si esto baja, es que el reintento ha
        // dejado de dispararse o de ganar.
        expect(ocr.confianza).toBeGreaterThan(50);
        expect(ocr.tuberia).toBe('documento');

        const p = analizarDocumentoVehiculo(ocr.texto);

        expect(p.tipo).toBe('FACTURA_TALLER');

        // EL dato del día: el total de la factura, no la primera cifra con un
        // € detrás (que era 154,15 € y el OCR además leía como 54,15 €).
        expect(p.importe).toBeCloseTo(397.31, 2);

        expect(p.fecha).toBe('13/05/2026');

        // Las piezas, que son las que ponen al día el mantenimiento.
        expect(p.mantenimientos_detectados).toContain('Correa de distribucion');
        expect(p.mantenimientos_detectados).toContain('Embrague');
        expect(p.mantenimientos_detectados).toContain('Liquido refrigerante');

        // Nada que pedirle a la persona: la factura se leyó entera.
        expect(p.faltantes).toEqual([]);
    }, 180_000);

    it('no se inventa la matrícula ni los kilómetros', async () => {
        const ocr = await extraerTextoImagen(FOTO);

        // Sin decirle de qué coche es, no propone matrícula. Con la tubería
        // anterior proponía "1100MTS", que salía de leer "1100 mts".
        expect(analizarDocumentoVehiculo(ocr.texto).matricula).toBeUndefined();

        // Y si se le dice, tampoco cuela: la del documento no es esa.
        expect(analizarDocumentoVehiculo(ocr.texto, undefined, '1234BCD').matricula).toBeUndefined();

        // La factura trae un campo "Kilómetro 245,25" que no son kilómetros
        // del coche. No se propone nada antes que proponer 245 km.
        expect(analizarDocumentoVehiculo(ocr.texto).km_documento).toBeUndefined();
    }, 180_000);
});
