/**
 * Regresión con la SALIDA REAL DE TESSERACT, no con una transcripción limpia.
 *
 * Este archivo existe porque el 2026-08-11 arreglé el parser dos veces:
 *
 *   - Por la mañana (C-043) lo validé contra un texto que escribí YO a mano
 *     leyendo la foto. Pasó al 100%.
 *   - Por la tarde, con la foto que Alberto subió de verdad, el mismo parser
 *     fallaba: no encontraba el importe del turno y guardaba el del turno
 *     como acumulado. El ticket quedaba `valido: false`, se marcaba ilegible
 *     y por eso "nunca contrastaba nada".
 *
 * La diferencia: Tesseract destroza el prefijo "P" (`7 Total:`, `PP pist.`,
 * `de pel TOA`) y mete símbolos raros como separador decimal (`144605» 85`,
 * `1967-05`).
 *
 * MORALEJA, y por eso este fixture es sagrado: un texto transcrito a mano NO
 * prueba un parser de OCR. Solo prueba lo que uno cree que pone la foto.
 * Si tocas ocr.service.ts, esto tiene que seguir en verde.
 */
import { describe, it, expect } from 'vitest';
import { validarTicketTaximetro } from '../src/services/ocr.service';

/**
 * Salida literal de `extraerTextoImagen()` sobre la foto real del ticket del
 * 08/08/2026 (vehículo 8053KKX). Copiada tal cual, con toda su basura.
 */
const OCR_REAL = `FECHA: 08/08/26 21:50
N*e LICENCIA: 562 Ss. CRUZ
Num Servicios: 18801
carreras! 144605» 85
Suplementos: 4390.00
Total 14999585
Dist- Total 183043»1
pist- Ocupado: 80137>3
Dist: Libre: 78235»
Dist. OFF: 9999999: 3
TiemPO Ocupado: 263977
Tiempo ON: 510571
Borrados: 296
p Ne de servus: 263
P-Carrerasi 1967-05
P Suplementos: 57,60
7 Total: 2024.65
de pel TOA 23521
PP pist. Ocurado 3659
P Dist- Libre: 378.6
P Dist. OFF: 607,5
Pp Tiempo pcurado — 2120
p TiemPO on: 5709
«
.
`;

describe('parser contra la salida REAL de Tesseract (ticket 08/08/2026)', () => {
    const r = validarTicketTaximetro(OCR_REAL);

    it('CRITICO: encuentra el importe del turno — es lo que se compara con el parte', () => {
        // El parte declaraba 2024,65 €. Antes del arreglo esto era undefined
        // y el ticket quedaba inválido.
        expect(r.parc_total).toBeCloseTo(2024.65, 2);
    });

    it('CRITICO: el importe del turno NO se guarda como acumulado', () => {
        // Este era el fallo de fondo: 2024,65 (turno) acababa en acum_total.
        expect(r.acum_total).not.toBeCloseTo(2024.65, 2);
    });

    it('el ticket se da por válido (si no, se marca ilegible y no contrasta nada)', () => {
        expect(r.valido).toBe(true);
        expect(r.errores).toEqual([]);
    });

    it('lee el contador de borrados, que es el control de manipulación', () => {
        expect(r.acum_borrados).toBe(296);
    });

    it('recupera cifras con el separador decimal ensuciado por el OCR', () => {
        // "carreras! 144605» 85" -> 144605,85
        expect(r.acum_carreras).toBeCloseTo(144605.85, 2);
        // "Dist- Total 183043»1" -> 183043,1
        expect(r.acum_dist_total).toBeCloseTo(183043.1, 1);
        // "P-Carrerasi 1967-05" -> 1967,05
        expect(r.parc_carreras).toBeCloseTo(1967.05, 2);
    });

    it('lee la fecha pese al ruido (y sin que la normalización la rompa)', () => {
        expect(r.fecha).toBe('08/08/2026');
    });

    it('los suplementos del turno se leen del bloque correcto', () => {
        expect(r.parc_suplementos).toBeCloseTo(57.60, 2);
    });

    /**
     * Lo que NO se puede recuperar de esta foto, documentado a propósito para
     * que nadie lo tome por un fallo del parser:
     *
     *   "de pel TOA 23521"  =  "P Dist. Total: 2352,1"
     *
     * La etiqueta está tan destrozada que ninguna expresión regular puede
     * saber que eso eran los km del turno, y el separador decimal desapareció.
     * Consecuencia práctica: en tickets así, la comparación de KM no se puede
     * hacer. La de IMPORTE sí, que es la que protege el dinero.
     */
    it('los km del turno NO se recuperan de esta foto — limitación conocida, no un fallo', () => {
        expect(r.parc_dist_total).toBeUndefined();
    });
});

/**
 * Salida literal de Tesseract sobre el SEGUNDO ticket real (10/08/2026, mismo
 * vehículo), el que subió Alberto el 2026-08-12 y disparó las alertas falsas
 * de C-056. Interesa por lo que el OCR hace MAL aquí y que el del 08/08 no
 * tenía: pierde la coma de la distancia acumulada, añade un dígito al
 * contador de borrados y lee un 5 como 9 en el importe del turno.
 */
const OCR_REAL_10_08 = `FECHA: 10708726 18

Ne LICENCIA: 562 S.CRUZ
Num. Servicios: 18807
Carreras: 144655, 60
Surlementos: 4391.80
Total: 149047, 40
Dist. Total: 1831080
Dist. Ocupado: 80159,5
Dist. Libre: 78257,9
Dist, OFF: 9999999, 9
Tiemro Ocurado: 269018
Tiempo On: 510680
Borrados: 2937
P Ne de servus: 6
P Carreras: 49. 75
P SurPlementos: 1.80
P Total: 91-55
P Dist. Total: 64,9
P Dist. Ocurado 21.6
P Dist. Libre: 22.2
P Dist. OFF: 21.1
P Tiemro Ocupado 41
P Tiempo On: 109
`;

describe('parser contra la salida REAL de Tesseract (ticket 10/08/2026)', () => {
    const r = validarTicketTaximetro(OCR_REAL_10_08);

    /**
     * `Total: 149047, 40` — separador bien leído pero con un espacio detrás.
     * El patrón de importe exige separador + 2 dígitos PEGADOS, así que el
     * campo se perdía entero. Sin importe acumulado, la comparación entre
     * tickets no puede distinguir "trabajo no declarado" de ruido de OCR y
     * siempre caía en el mensaje alarmista de kilómetros.
     */
    it('recupera el importe acumulado pese al espacio tras la coma', () => {
        expect(r.acum_total).toBeCloseTo(149047.40, 2);
    });

    it('sigue leyendo carreras y suplementos acumulados (mismo defecto de espacio)', () => {
        expect(r.acum_carreras).toBeCloseTo(144655.60, 2);
        expect(r.acum_suplementos).toBeCloseTo(4391.80, 2);
    });

    it('lee bien lo que está bien impreso: km y servicios del turno', () => {
        expect(r.parc_dist_total).toBeCloseTo(64.9, 1);
        expect(r.parc_num_servicios).toBe(6);
    });

    /**
     * Estas tres son las lecturas MALAS del ticket, y se documentan tal cual
     * a propósito: el parser no puede saber que están mal (`2937` es un
     * número perfectamente formado). Quien tiene que darse cuenta es el motor
     * de comparación — ver smoke.ocrFiabilidad.test.ts, que usa exactamente
     * estos valores.
     */
    it('lecturas erróneas conocidas: el parser las devuelve, el motor de alertas debe filtrarlas', () => {
        expect(r.acum_borrados).toBe(2937);       // el ticket pone 297
        expect(r.acum_dist_total).toBe(1831080);  // el ticket pone 183.108,0
        expect(r.parc_total).toBeCloseTo(91.55, 2); // el ticket pone 51,55
        // La prueba de que 91,55 está mal está en el propio ticket:
        expect(r.parc_carreras! + r.parc_suplementos!).toBeCloseTo(51.55, 2);
    });
});
