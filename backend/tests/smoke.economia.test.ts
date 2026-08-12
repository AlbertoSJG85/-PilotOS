/**
 * Tests de humo — exactitud económica de los gastos fijos.
 *
 * REGLA CAMBIADA EL 2026-08-12, y estos tests son los que la fijan.
 *
 * Antes esto prorrateaba por días: gasto anual ÷ 365 × días del rango. Sobre
 * el papel es impecable; en la pantalla del taxista mentía:
 *
 *   · del 1 al 12 de agosto mostraba 182,66 € cuando solo su cuota de
 *     autónomo son 303 € al mes — Alberto lo cazó al instante;
 *   · y ni un mes entero cuadraba: 31 días daban 471,88 € con unos fijos de
 *     463, porque los meses no miden 30,4 días.
 *
 * Una cuota de autónomo se paga entera el día 1, no a trocitos. Ahora cada
 * MES que toca el rango devenga su cuota completa — la misma regla que la
 * Seguridad Social (F4, decidida por Alberto el 2026-08-11).
 */
import { describe, it, expect } from 'vitest';
import { calcularGastosFijosDelPeriodo } from '../src/services/resumen.service';

describe('calcularGastosFijosDelPeriodo', () => {
    it('CLAVE: 12 días de un mes devengan la cuota ENTERA de ese mes', () => {
        const fijos = [{ importe: 303, periodicidad: 'MENSUAL' }];
        const total = calcularGastosFijosDelPeriodo(fijos, new Date('2026-08-01'), new Date('2026-08-12'));
        // Ni 182,66 ni ninguna otra fracción: la cuota se paga entera.
        expect(total).toBeCloseTo(303, 2);
    });

    it('CLAVE: un mes entero devuelve exactamente la cuota, no 471,88', () => {
        const fijos = [
            { importe: 303, periodicidad: 'MENSUAL' }, // autónomo
            { importe: 100, periodicidad: 'MENSUAL' }, // radio taxi
            { importe: 50, periodicidad: 'MENSUAL' },  // gestoría
            { importe: 10, periodicidad: 'MENSUAL' },  // datáfono
        ];
        const total = calcularGastosFijosDelPeriodo(fijos, new Date('2026-08-01'), new Date('2026-08-31'));
        expect(total).toBeCloseTo(463, 2);
    });

    it('un rango a caballo entre dos meses devenga DOS cuotas', () => {
        const fijos = [{ importe: 300, periodicidad: 'MENSUAL' }];
        const total = calcularGastosFijosDelPeriodo(fijos, new Date('2026-07-20'), new Date('2026-08-05'));
        expect(total).toBeCloseTo(600, 2);
    });

    it('TRIMESTRAL se lleva a su equivalente mensual: 90 al trimestre = 30 al mes', () => {
        const fijos = [{ importe: 90, periodicidad: 'TRIMESTRAL' }];
        expect(calcularGastosFijosDelPeriodo(fijos, new Date('2026-03-01'), new Date('2026-03-31'))).toBeCloseTo(30, 2);
        expect(calcularGastosFijosDelPeriodo(fijos, new Date('2026-01-01'), new Date('2026-12-31'))).toBeCloseTo(360, 2);
    });

    it('un seguro ANUAL no cae entero en un mes: se reparte a 1/12', () => {
        // 780 € de seguro al año son 65 al mes. Si cayera entero en agosto,
        // ese mes parecería ruinoso y los otros once, artificialmente buenos.
        const fijos = [{ importe: 780, periodicidad: 'ANUAL' }];
        expect(calcularGastosFijosDelPeriodo(fijos, new Date('2026-03-01'), new Date('2026-03-31'))).toBeCloseTo(65, 2);
    });

    it('sin rango devuelve el equivalente mensual (vista por defecto)', () => {
        const fijos = [{ importe: 90, periodicidad: 'TRIMESTRAL' }];
        expect(calcularGastosFijosDelPeriodo(fijos)).toBeCloseTo(30, 5);
    });

    it('varios gastos fijos se suman', () => {
        const fijos = [
            { importe: 300, periodicidad: 'MENSUAL' },
            { importe: 1200, periodicidad: 'ANUAL' },
        ];
        // 300 + 1200/12 = 400 al mes
        expect(calcularGastosFijosDelPeriodo(fijos)).toBeCloseTo(400, 5);
        expect(calcularGastosFijosDelPeriodo(fijos, new Date('2026-05-01'), new Date('2026-05-31'))).toBeCloseTo(400, 2);
    });
});
