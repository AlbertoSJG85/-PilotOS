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
