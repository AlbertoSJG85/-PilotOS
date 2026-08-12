/**
 * Test de regresión con la FOTO REAL, no con su texto (2026-08-12, C-060).
 *
 * Por qué existe, y por qué la foto está en el repositorio:
 *
 * Durante tres días seguidos el ticket del taxímetro se leyó mal —"Borrados:
 * 2937" cuando el papel pone 297— y cada intento de arreglarlo se validó
 * contra una transcripción del texto. Pero el problema no estaba en el texto:
 * estaba ANTES, en cómo se le daba la imagen a Tesseract. Con el texto ya
 * equivocado, ningún parser podía acertar.
 *
 * La única prueba que detecta esa clase de fallo es pasar la FOTO entera por
 * la tubería completa y comparar con lo que pone el papel. Es lenta (unos
 * segundos), y merece la pena.
 *
 * Si alguien toca `prepararImagenParaOcr` y este test se pone rojo, es que ha
 * roto la lectura de los tickets reales. No relajes las expectativas: los
 * valores de abajo son los que se leen mirando la foto con los ojos.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { extraerTextoImagen, validarTicketTaximetro } from '../src/services/ocr.service';

const FOTO = path.join(__dirname, 'fixtures', 'ticket-taximetro-2026-08-10.jpg');

describe('la foto real del ticket del 10/08/2026, de principio a fin', () => {
    it('lee lo que pone el papel', async () => {
        const ocr = await extraerTextoImagen(FOTO);
        const d = validarTicketTaximetro(ocr.texto);

        // Contador de borrados: el que provocó las alertas falsas de C-056.
        expect(d.acum_borrados).toBe(297);

        // Distancia acumulada: se perdía la coma y se leía 1831080.
        expect(d.acum_dist_total).toBeCloseTo(183108, 0);

        // Importe acumulado y del turno.
        expect(d.acum_total).toBeCloseTo(149047.40, 1);
        expect(d.parc_total).toBeCloseTo(51.55, 2);

        // Km del turno y desglose del turno.
        expect(d.parc_dist_total).toBeCloseTo(64.9, 1);
        expect(d.parc_carreras).toBeCloseTo(49.75, 2);
        expect(d.parc_suplementos).toBeCloseTo(1.80, 2);
    }, 120_000);

    it('el acumulado es coherente consigo mismo (carreras + suplementos = total)', async () => {
        const ocr = await extraerTextoImagen(FOTO);
        const d = validarTicketTaximetro(ocr.texto);

        // 144.655,60 + 4.391,80 = 149.047,40. Si esto cuadra, las tres cifras
        // acumuladas se han leído bien: es la mejor señal de que no hay un
        // dígito inventado por ahí.
        expect(d.acum_carreras).toBeDefined();
        expect(d.acum_suplementos).toBeDefined();
        expect(d.acum_carreras! + d.acum_suplementos!).toBeCloseTo(d.acum_total!, 1);
    }, 120_000);
});

/**
 * El SEGUNDO ticket real, y está aquí por un motivo concreto: la primera
 * versión de la preparación de imagen (con `sharpen`) dejaba el ticket del
 * 10/08 perfecto y ROMPÍA este — perdía la línea de "Borrados" y el importe
 * del turno. Con una sola foto de referencia habría pasado por bueno.
 *
 * Dos fotos no son muchas, pero son dos formatos distintos de la misma
 * máquina y ya han bastado para tumbar una solución que parecía correcta.
 */
const FOTO_0808 = path.join(__dirname, 'fixtures', 'ticket-taximetro-2026-08-08.jpg');

describe('la foto real del ticket del 08/08/2026', () => {
    it('sigue leyéndose bien (es la que rompía al afilar la imagen)', async () => {
        const ocr = await extraerTextoImagen(FOTO_0808);
        const d = validarTicketTaximetro(ocr.texto);

        expect(d.acum_borrados).toBe(296);
        expect(d.acum_dist_total).toBeCloseTo(183043.1, 0);
        expect(d.acum_total).toBeCloseTo(148995.85, 1);
        expect(d.parc_total).toBeCloseTo(2024.65, 2);
    }, 120_000);
});
