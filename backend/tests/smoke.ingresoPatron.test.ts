/**
 * Tests de humo — lo que ingresa el dueño (2026-08-12).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Al separar el panel en "lo del asalariado" y
 * "lo mío", el beneficio pasó a calcularse sumando los ingresos por persona.
 * La primera versión miraba solo el lado "conductor" del reparto del dueño, y
 * en PRODUCCIÓN su configuración deja todo su dinero en el lado "patrón":
 * resultado, ingreso 0 y un beneficio de −463 € con 2.076 € facturados.
 * En el entorno de prueba no se veía, porque allí la config lo deja en el
 * otro lado.
 *
 * La regla, que es lo que fijan estos tests: **de los días que conduce el
 * dueño, le corresponden LAS DOS partes del reparto** — el dinero es suyo
 * entero, esté donde esté apuntado. De los días del asalariado, solo la
 * parte del patrón.
 */
import { describe, it, expect } from 'vitest';

interface Persona {
    reparto: number;
    para_el_patron: number;
}

/** Misma fórmula que resumen.service.ts, aislada para poder fijarla aquí. */
function ingresoDelPatron(patron: Persona | null, asalariados: Persona[]): number {
    return (patron ? patron.reparto + patron.para_el_patron : 0)
        + asalariados.reduce((acc, a) => acc + a.para_el_patron, 0);
}

describe('lo que ingresa el dueño antes de gastos', () => {
    it('CLAVE: si su config deja el dinero en el lado "patrón", cuenta igual', () => {
        // Caso de PRODUCCIÓN: sus partes salen con parte_conductor 0 y todo
        // el neto en parte_patron. Antes esto daba 0.
        expect(ingresoDelPatron({ reparto: 0, para_el_patron: 2047.50 }, [])).toBeCloseTo(2047.50, 2);
    });

    it('CLAVE: y si lo deja en el lado "conductor", también', () => {
        // Caso del entorno de prueba: config 100/0.
        expect(ingresoDelPatron({ reparto: 290.65, para_el_patron: 0 }, [])).toBeCloseTo(290.65, 2);
    });

    it('con asalariado: lo suyo íntegro más SU PARTE de lo que genera el otro', () => {
        const patron = { reparto: 290.65, para_el_patron: 0 };
        const carlos = { reparto: 584.33, para_el_patron: 584.33 };
        // 290,65 suyos + 584,33 de Carlos = 874,98. Los otros 584,33 son de Carlos.
        expect(ingresoDelPatron(patron, [carlos])).toBeCloseTo(874.98, 2);
    });

    it('lo que se lleva el asalariado NO entra en el ingreso del dueño', () => {
        const carlos = { reparto: 584.33, para_el_patron: 584.33 };
        const total = ingresoDelPatron(null, [carlos]);
        expect(total).toBeCloseTo(584.33, 2);
        expect(total).not.toBeCloseTo(carlos.reparto + carlos.para_el_patron, 2);
    });

    it('un dueño que no ha conducido y sin asalariados no ingresa nada', () => {
        expect(ingresoDelPatron(null, [])).toBe(0);
    });
});
