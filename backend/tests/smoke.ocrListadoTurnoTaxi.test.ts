import { describe, it, expect } from 'vitest';
import { validarTicketTaximetro, limpiarTextoOcr } from '../src/services/ocr.service';
import { evaluarFiabilidadAcumulados, importeTurnoTicket } from '../src/services/ocrComparacion.service';

/**
 * Segundo modelo de taxímetro (2026-11-10): "LISTADO DE TURNO / LISTADO DE
 * TAXI", el de la tía de Alberto. Mismos datos clave que el Taxitronic con
 * otros nombres:
 *
 *   VIAJES -> nº servicios · TOTAL SERV. -> Carreras · SUPLEMENTOS
 *   E12. TOTAL RECAUD -> Total · KM. TOTALES / KM. OCUPADOS -> distancias
 *   nº junto a "LISTADO DE TURNO" (354, 355, 356) -> Borrados
 *
 * Las transcripciones son las de los tres tickets reales fotografiados el
 * 09/11/26 (354, 355 y 356, impresos seguidos). No relajes las aserciones si
 * fallan: vuelve a mirar el papel.
 */

// 354 — turno con datos (de prueba: sin cerrar en mucho tiempo).
const TICKET_354 = `
LISTADO DE TURNO 354
DNI: 00000000-X
LM: 633-S.CRUZ
MAT: 0000-XXX
12:40 09.11.26
LICENCIA No 1
CONDUCTOR No 1
TAXI No 1
LISTADO DE TURNO
1.KM. TOTALES 14967,8
2.KM. OCUPADOS 6826,1
3.VIAJES 1575
4.SUPLEMENTOS € 695,10
5.SALTO € 6408,85
11.INCR.TIEMPO € 624,00
12.TOTAL SERV.
€ 12621,00
E12.TOTAL RECAUD
€ 13316,10
REL. OCUPADO/LIBRE: 46 %
RENDIMIENTO/km: € 0,18
LISTADO DE TAXI
1.KM. TOTALES 88490,1
2.KM. OCUPADOS 73058,3
3.VIAJES 76509
4.SUPLEMENTOS € 5937,45
5.SALTO € 4314,87
11.INCR.TIEMPO € 2558,46
12.TOTAL SERV.
€ 41201,56
E12.TOTAL RECAUD
€ 47139,01
`;

// 355 — impreso justo después: el turno sale VACÍO.
const TICKET_355 = `
LISTADO DE TURNO 355
DNI: 00000000-X
LM: 633-S.CRUZ
MAT: 0000-XXX
12:41 09.11.26
LICENCIA No 1
CONDUCTOR No 1
TAXI No 1
LISTADO DE TURNO
LISTADO DE TAXI
1.KM. TOTALES 88490,1
2.KM. OCUPADOS 73058,3
3.VIAJES 76509
4.SUPLEMENTOS € 5937,45
5.SALTO € 4314,87
11.INCR.TIEMPO € 2558,46
12.TOTAL SERV.
€ 41201,56
E12.TOTAL RECAUD
€ 47139,01
INI. FIN. KM.L. KM.O. IMP.
`;

// 356 — un viaje de 3,85 €; arriba asoma el final del ticket anterior.
const TICKET_356 = `
FIN: 12:41 0,0
LISTADO DE TURNO 356
DNI: 00000000-X
LM: 633-S.CRUZ
MAT: 0000-XXX
12:42 09.11.26
LICENCIA No 1
CONDUCTOR No 1
TAXI No 1
LISTADO DE TURNO
3.VIAJES 1
12.TOTAL SERV. € 3,85
E12.TOTAL RECAUD € 3,85
LISTADO DE TAXI
1.KM. TOTALES 88490,1
2.KM. OCUPADOS 73058,3
3.VIAJES 76510
4.SUPLEMENTOS € 5937,45
5.SALTO € 4314,87
11.INCR.TIEMPO € 2558,46
12.TOTAL SERV.
€ 41205,41
E12.TOTAL RECAUD
€ 47142,86
INI. FIN. KM.L. KM.O. IMP.
`;

describe('Listado de turno/taxi — ticket 354 (turno con datos)', () => {
    const r = validarTicketTaximetro(TICKET_354);

    it('reconoce el formato y es válido', () => {
        expect(r.formato).toBe('listado_turno_taxi');
        expect(r.errores).toEqual([]);
        expect(r.valido).toBe(true);
    });

    it('lee cabecera: fecha, hora, licencia (LM) y nº de listado como borrados', () => {
        expect(r.fecha).toBe('09/11/2026');
        expect(r.hora).toBe('12:40');
        expect(r.licencia).toBe('633');
        expect(r.acum_borrados).toBe(354);
    });

    it('el TURNO sale del bloque LISTADO DE TURNO', () => {
        expect(r.parc_num_servicios).toBe(1575);
        expect(r.parc_carreras).toBeCloseTo(12621.0, 2);
        expect(r.parc_suplementos).toBeCloseTo(695.1, 2);
        expect(r.parc_total).toBeCloseTo(13316.1, 2);
        expect(r.parc_total_reconstruido).toBe(false);
        // Sin conversión metros→km: 14967,8 son km.
        expect(r.parc_dist_total).toBeCloseTo(14967.8, 1);
        expect(r.parc_dist_ocupado).toBeCloseTo(6826.1, 1);
        expect(r.parc_dist_libre).toBeCloseTo(8141.7, 1);
    });

    it('el ACUMULADO sale del bloque LISTADO DE TAXI', () => {
        expect(r.acum_num_servicios).toBe(76509);
        expect(r.acum_carreras).toBeCloseTo(41201.56, 2);
        expect(r.acum_suplementos).toBeCloseTo(5937.45, 2);
        expect(r.acum_total).toBeCloseTo(47139.01, 2);
        expect(r.acum_dist_total).toBeCloseTo(88490.1, 1);
        expect(r.acum_dist_ocupado).toBeCloseTo(73058.3, 1);
    });

    it('cuadra: TOTAL SERV. + SUPLEMENTOS = TOTAL RECAUD en los dos bloques', () => {
        expect(r.parc_carreras! + r.parc_suplementos!).toBeCloseTo(r.parc_total!, 2);
        expect(r.acum_carreras! + r.acum_suplementos!).toBeCloseTo(r.acum_total!, 2);
    });
});

describe('Listado de turno/taxi — ticket 355 (turno vacío)', () => {
    const r = validarTicketTaximetro(TICKET_355);

    it('NUNCA toma el acumulado del taxi como importe del turno', () => {
        expect(r.parc_total).toBeUndefined();
        expect(r.parc_num_servicios).toBeUndefined();
        expect(r.parc_dist_total).toBeUndefined();
        expect(r.importe).toBeUndefined();
    });

    it('queda para revisar a mano, diciendo por qué', () => {
        expect(r.valido).toBe(false);
        expect(r.errores.join(' ')).toMatch(/LISTADO DE TURNO viene vacío/);
    });

    it('el acumulado y el nº de listado sí se leen', () => {
        expect(r.acum_borrados).toBe(355);
        expect(r.acum_total).toBeCloseTo(47139.01, 2);
    });
});

describe('Listado de turno/taxi — ticket 356 (turno corto, líneas a cero omitidas)', () => {
    const r = validarTicketTaximetro(TICKET_356);

    it('es válido con solo VIAJES, TOTAL SERV. y TOTAL RECAUD en el turno', () => {
        expect(r.formato).toBe('listado_turno_taxi');
        expect(r.valido).toBe(true);
        expect(r.parc_num_servicios).toBe(1);
        expect(r.parc_total).toBeCloseTo(3.85, 2);
        expect(r.parc_suplementos).toBeUndefined();
        expect(r.parc_total_reconstruido).toBe(false);
    });

    it('la hora es la del ticket, no la del viaje que asoma arriba', () => {
        expect(r.hora).toBe('12:42');
        expect(r.acum_borrados).toBe(356);
    });

    it('el importe del turno que se compara con el parte es 3,85', () => {
        expect(importeTurnoTicket(r)).toEqual({ valor: 3.85, reconstruido: false });
    });
});

describe('Listado de turno/taxi — comparación entre tickets seguidos', () => {
    const t355 = validarTicketTaximetro(TICKET_355);
    const t356 = validarTicketTaximetro(TICKET_356);

    it('el acumulado sube exactamente lo que marca el turno', () => {
        expect(t356.acum_borrados! - t355.acum_borrados!).toBe(1);
        expect(t356.acum_num_servicios! - t355.acum_num_servicios!).toBe(t356.parc_num_servicios);
        expect(t356.acum_total! - t355.acum_total!).toBeCloseTo(t356.parc_total!, 2);
    });

    it('los contadores son utilizables como prueba', () => {
        const f = evaluarFiabilidadAcumulados(t355, t356, 0);
        expect(f).toMatchObject({ borrados: true, km: true, eur: true });
    });
});

/**
 * Lo que devolvió OpenAI (gpt-4.1-mini, el lector de producción) con las tres
 * fotos reales, pasadas por el mismo módulo y el mismo contexto que usa
 * PilotOS (2026-11-10). DNI y matrícula tapados. Dos trampas reales:
 *   - 356: línea en blanco entre "12.TOTAL SERV." y su cifra, y el "€" leído
 *     como "0" ("03,85").
 *   - 355: papel roto en el total del taxi -> "E12.TOTAL RECAUD 4713" (pone
 *     47139,01), sin ninguna duda declarada.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OPENAI: Record<'t354' | 't355' | 't356' | 't356_euro_como_03', { texto: string; dudas: string[] }> =
    require('./fixtures/listado-turno-taxi-openai-2026-11-09.json');

describe('Listado de turno/taxi — transcripción real de OpenAI', () => {
    const r354 = validarTicketTaximetro(OPENAI.t354.texto);
    const r355 = validarTicketTaximetro(OPENAI.t355.texto);
    const r356 = validarTicketTaximetro(OPENAI.t356.texto);

    it('354: casa todos los datos clave', () => {
        expect(r354.valido).toBe(true);
        expect(r354).toMatchObject({ fecha: '09/11/2026', hora: '12:40', licencia: '633', acum_borrados: 354 });
        expect(r354.parc_num_servicios).toBe(1575);
        expect(r354.parc_total).toBeCloseTo(13316.1, 2);
        expect(r354.parc_dist_total).toBeCloseTo(14967.8, 1);
        expect(r354.acum_num_servicios).toBe(76509);
        expect(r354.acum_total).toBeCloseTo(47139.01, 2);
        expect(r354.acum_dist_total).toBeCloseTo(88490.1, 1);
    });

    it('355: turno vacío a revisión, y el total roto se recompone (41201,56 + 5937,45)', () => {
        expect(r355.valido).toBe(false);
        expect(r355.parc_total).toBeUndefined();
        expect(r355.acum_borrados).toBe(355);
        expect(r355.acum_total).toBeCloseTo(47139.01, 2);
    });

    it('356: lee la cifra tras la línea en blanco y el "03,85"', () => {
        expect(r356.valido).toBe(true);
        expect(r356).toMatchObject({ hora: '12:42', acum_borrados: 356, parc_num_servicios: 1 });
        expect(r356.parc_total).toBeCloseTo(3.85, 2);
        expect(r356.acum_carreras).toBeCloseTo(41205.41, 2);
        expect(r356.acum_total).toBeCloseTo(47142.86, 2);
    });

    it('355 -> 356: borrados +1 y el acumulado sube lo que marca el turno', () => {
        expect(r356.acum_borrados! - r355.acum_borrados!).toBe(1);
        expect(r356.acum_total! - r355.acum_total!).toBeCloseTo(r356.parc_total!, 2);
        expect(evaluarFiabilidadAcumulados(r355, r356, 0)).toMatchObject({ borrados: true, km: true, eur: true });
    });
});

describe('El "€" que OpenAI transcribe como lo que le parece', () => {
    it('lectura real con el € como "03": 3,85 y no 3,00 (se guardaba 3 y el ticket salía válido)', () => {
        const r = validarTicketTaximetro(OPENAI.t356_euro_como_03.texto);
        expect(r.valido).toBe(true);
        expect(r.parc_total).toBeCloseTo(3.85, 2);
        expect(r.parc_carreras).toBeCloseTo(3.85, 2);
        expect(r.acum_total).toBeCloseTo(47142.86, 2);
        expect(r.acum_carreras).toBeCloseTo(41205.41, 2);
        expect(r.acum_suplementos).toBeCloseTo(5937.45, 2);
    });

    it.each([
        ['€ 12,10', '€ '],
        ['0 12,10', '0 '],
        ['03 12,10', '03 '],
        ['012,10 (€ pegado a la cifra)', '0'],
        [' 12,10', ' '],
        ['E 12,10', 'E '],
    ])('importe del turno 12,10 con el símbolo leído como %j', (_c, prefijo) => {
        const texto = `LISTADO DE TURNO 500
LM: 633-S.CRUZ
10:00 10.11.26
LISTADO DE TURNO
3.VIAJES 2
12.TOTAL SERV. ${prefijo}12,10
E12.TOTAL RECAUD ${prefijo}12,10
LISTADO DE TAXI
3.VIAJES 76600
12.TOTAL SERV. ${prefijo}41500,00
E12.TOTAL RECAUD ${prefijo}47500,00`;
        const r = validarTicketTaximetro(limpiarTextoOcr(texto));
        expect(r.parc_total).toBeCloseTo(12.1, 2);
        expect(r.acum_total).toBeCloseTo(47500, 2);
    });

    it('el símbolo en una línea y el importe en la siguiente', () => {
        const texto = `LISTADO DE TURNO 501
10:00 10.11.26
LISTADO DE TURNO
12.TOTAL SERV. 03
 03 12,10
E12.TOTAL RECAUD
03 12,10
LISTADO DE TAXI
E12.TOTAL RECAUD 03 47500,00`;
        const r = validarTicketTaximetro(texto);
        expect(r.parc_total).toBeCloseTo(12.1, 2);
        expect(r.parc_carreras).toBeCloseTo(12.1, 2);
    });

    it('un importe menor de 1 € ("0,85") no pierde su cero', () => {
        const texto = `LISTADO DE TURNO 502
10:00 10.11.26
LISTADO DE TURNO
E12.TOTAL RECAUD € 0,85
LISTADO DE TAXI
E12.TOTAL RECAUD € 47500,00`;
        expect(validarTicketTaximetro(texto).parc_total).toBeCloseTo(0.85, 2);
    });
});

describe('limpiarTextoOcr — el NUL que rompía la subida del ticket', () => {
    it('quita NUL y demás caracteres de control, y deja saltos de línea y tabuladores', () => {
        expect(limpiarTextoOcr('a\u0000b\u0002c\nd\te\u007Ff')).toBe('a b c\nd\te f');
    });

    it('el texto sin NUL (apto para PostgreSQL) se sigue leyendo: "€" como NUL', () => {
        const conNul = OPENAI.t356.texto.replace(/\u0002/g, '\u0000');
        const limpio = limpiarTextoOcr(conNul);
        expect(limpio).not.toMatch(/\u0000/);
        const r = validarTicketTaximetro(limpio);
        expect(r.valido).toBe(true);
        expect(r.acum_total).toBeCloseTo(47142.86, 2);
        expect(r.parc_total).toBeCloseTo(3.85, 2);
    });
});

describe('Listado de turno/taxi — robustez', () => {
    it('lee igual si el bloque del taxi va antes que el del turno', () => {
        const desordenado = `
LISTADO DE TURNO 400
LM: 633-S.CRUZ
21:15 10.11.26
LISTADO DE TAXI
3.VIAJES 76530
12.TOTAL SERV. € 41400,00
E12.TOTAL RECAUD € 47350,00
LISTADO DE TURNO
3.VIAJES 20
4.SUPLEMENTOS € 12,40
12.TOTAL SERV. € 194,60
E12.TOTAL RECAUD € 207,00
`;
        const r = validarTicketTaximetro(desordenado);
        expect(r.valido).toBe(true);
        expect(r.parc_total).toBeCloseTo(207, 2);
        expect(r.parc_num_servicios).toBe(20);
        expect(r.acum_total).toBeCloseTo(47350, 2);
        expect(r.acum_borrados).toBe(400);
    });

    it('reconstruye el TOTAL RECAUD del turno si está mal leído y SERV + SUPL cuadran', () => {
        const malLeido = TICKET_354.replace('€ 13316,10', '€ 18316,10');
        const r = validarTicketTaximetro(malLeido);
        expect(r.parc_total).toBeCloseTo(13316.1, 2);
        expect(r.parc_total_reconstruido).toBe(true);
    });

    it('si el turno marca más que el taxi entero, no lo da por bueno', () => {
        const imposible = TICKET_356.replace('E12.TOTAL RECAUD € 3,85', 'E12.TOTAL RECAUD € 93850,00');
        const r = validarTicketTaximetro(imposible);
        expect(r.valido).toBe(false);
        expect(r.errores.join(' ')).toMatch(/TOTAL RECAUD/);
    });

    it('acepta el nº de listado en su propia línea y miles con punto', () => {
        const texto = TICKET_356
            .replace('LISTADO DE TURNO 356', 'LISTADO DE TURNO\n356')
            .replace('€ 47142,86', '€ 47.142,86');
        const r = validarTicketTaximetro(texto);
        expect(r.acum_borrados).toBe(356);
        expect(r.acum_total).toBeCloseTo(47142.86, 2);
        expect(r.parc_total).toBeCloseTo(3.85, 2);
    });
});
