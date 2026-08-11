import { describe, it, expect } from 'vitest';
import { validarTicketTaximetro } from '../src/services/ocr.service';

/**
 * Regresión del hallazgo N6 (2026-08-11): un ticket real fotografiado por
 * Alberto reveló que el parser confundía sistemáticamente los campos del
 * turno con los del acumulado histórico, y que el acumulado (incluido
 * "Borrados", el único control marcado como CRÍTICO contra manipulación)
 * nunca llegaba a extraerse. Causa raíz: el separador de secciones buscaba
 * palabras clave ("ACUMULADO", "PARCIAL"...) que este modelo de ticket no
 * usa — marca cada campo del turno con el prefijo "P " y nada más.
 *
 * Este texto es la transcripción literal del ticket real (mismo formato que
 * produciría Tesseract en el caso favorable de columnas bien alineadas).
 * Si esta prueba empieza a fallar, alguien ha tocado el parser sin corregir
 * este caso real — no lo "arregles" relajando las aserciones, vuelve a
 * mirar el ticket.
 */
const TICKET_REAL_2026_08_11 = `
FECHA: 10/08/26 18
Nº LICENCIA: 562 S.CRUZ
Num. Servicios: 18807
Carreras: 144655,60
Suplementos: 4391,80
Total: 149047,40
Dist. Total: 183108,0
Dist. Ocupado: 80159,5
Dist. Libre: 78257,9
Dist. OFF: 9999999,9
Tiempo Ocupado: 269018
Tiempo On: 510680
Borrados: 297
P Nº de servs: 6
P Carreras: 49,75
P Suplementos: 1,80
P Total: 51,55
P Dist. Total: 64,9
P Dist. Ocupado: 21,6
P Dist. Libre: 22,2
P Dist. OFF: 21,1
P Tiempo Ocupado: 41
P Tiempo On: 109
`;

describe('validarTicketTaximetro — ticket real 2026-08-11', () => {
    const r = validarTicketTaximetro(TICKET_REAL_2026_08_11);

    it('es válido y no reporta errores de extracción', () => {
        expect(r.valido).toBe(true);
        expect(r.errores).toEqual([]);
    });

    it('lee la fecha y la licencia', () => {
        expect(r.fecha).toBe('10/08/2026');
        expect(r.licencia).toBe('562');
    });

    it('lee el ACUMULADO (histórico del taxímetro), no el del turno', () => {
        expect(r.acum_num_servicios).toBe(18807);
        expect(r.acum_carreras).toBeCloseTo(144655.60, 2);
        expect(r.acum_suplementos).toBeCloseTo(4391.80, 2);
        expect(r.acum_total).toBeCloseTo(149047.40, 2);
        // Sin la conversión de metros: 183108 km de vida útil es un valor
        // legítimo y NO debe dividirse por 1000.
        expect(r.acum_dist_total).toBe(183108);
        expect(r.acum_dist_ocupado).toBeCloseTo(80159.5, 1);
        expect(r.acum_dist_libre).toBeCloseTo(78257.9, 1);
        expect(r.acum_tiempo_ocupado).toBe(269018);
        expect(r.acum_tiempo_on).toBe(510680);
        // El campo crítico: si esto es undefined, el control CRÍTICO de
        // manipulación (compararBorrados) nunca se ejecuta.
        expect(r.acum_borrados).toBe(297);
    });

    it('lee el PARCIAL (turno actual), no el acumulado', () => {
        expect(r.parc_num_servicios).toBe(6);
        expect(r.parc_carreras).toBeCloseTo(49.75, 2);
        expect(r.parc_suplementos).toBeCloseTo(1.80, 2);
        expect(r.parc_total).toBeCloseTo(51.55, 2);
        expect(r.parc_dist_total).toBeCloseTo(64.9, 1);
        expect(r.parc_dist_ocupado).toBeCloseTo(21.6, 1);
        expect(r.parc_dist_libre).toBeCloseTo(22.2, 1);
        expect(r.parc_tiempo_ocupado).toBe(41);
        expect(r.parc_tiempo_on).toBe(109);
    });

    it('la coherencia interna del ticket real se conserva (carreras + suplementos = total)', () => {
        expect(r.acum_carreras! + r.acum_suplementos!).toBeCloseTo(r.acum_total!, 2);
        expect(r.parc_carreras! + r.parc_suplementos!).toBeCloseTo(r.parc_total!, 2);
    });
});

describe('validarTicketTaximetro — formato antiguo por palabra clave (compatibilidad)', () => {
    // Un ticket que SÍ rotula secciones con palabras clave (otro modelo de
    // taxímetro) debe seguir funcionando: la separación por línea "P " es
    // la estrategia primaria, pero si ninguna línea la usa, cae al método
    // anterior de palabras clave.
    const TICKET_CON_CABECERAS = `
FECHA: 01/01/2026
ACUMULADO
Total: 90000,00
Dist. Total: 50000,0
Borrados: 12
PARCIAL DEL TURNO
Total: 120,50
Dist. Total: 180,3
`;

    it('separa acumulado y parcial por cabecera cuando no hay prefijo "P "', () => {
        const r = validarTicketTaximetro(TICKET_CON_CABECERAS);
        expect(r.acum_total).toBeCloseTo(90000, 2);
        expect(r.acum_dist_total).toBe(50000);
        expect(r.acum_borrados).toBe(12);
        expect(r.parc_total).toBeCloseTo(120.50, 2);
        expect(r.parc_dist_total).toBeCloseTo(180.3, 1);
    });
});
