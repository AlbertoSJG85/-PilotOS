/**
 * Tests de humo — Fase 4 (exactitud economica).
 *
 * Cubren prorratearGastosFijos (resumen.service.ts), la unica pieza de esta
 * fase que es logica pura sin base de datos. El resto (calculo.service.ts:
 * separacion neto/base de reparto, orden de configuracion especifica/generica)
 * requiere una BD de test real (queda en la lista de pendientes de la fase).
 */
import { describe, it, expect } from 'vitest';
import { prorratearGastosFijos } from '../src/services/resumen.service';

describe('prorratearGastosFijos', () => {
    it('CRITICO: una semana no paga lo mismo que un mes entero (antes si)', () => {
        const fijos = [{ importe: 300, periodicidad: 'MENSUAL' }];
        const desde = new Date('2026-01-01');
        const unaSemana = new Date('2026-01-07'); // 7 dias inclusive
        const unMes = new Date('2026-01-31'); // 31 dias inclusive

        const totalSemana = prorratearGastosFijos(fijos, desde, unaSemana);
        const totalMes = prorratearGastosFijos(fijos, desde, unMes);

        expect(totalSemana).toBeLessThan(totalMes);
        // La semana deberia rondar 7/31 del total del mes, no ser igual.
        expect(totalSemana).toBeCloseTo((300 * 12 / 365) * 7, 1);
    });

    it('TRIMESTRAL se convierte a anual (importe*4) antes de prorratear', () => {
        const fijos = [{ importe: 90, periodicidad: 'TRIMESTRAL' }];
        const desde = new Date('2026-01-01');
        const hasta = new Date('2026-12-31'); // ~365 dias
        const total = prorratearGastosFijos(fijos, desde, hasta);
        // 90/trimestre * 4 = 360/anio ≈ total de un anio completo
        expect(total).toBeCloseTo(360, 0);
    });

    it('ANUAL prorrateado a un solo dia es aproximadamente importe/365', () => {
        const fijos = [{ importe: 365, periodicidad: 'ANUAL' }];
        const dia = new Date('2026-03-10');
        const total = prorratearGastosFijos(fijos, dia, dia);
        expect(total).toBeCloseTo(1, 1);
    });

    it('sin rango (desde/hasta ausentes) devuelve el equivalente mensual, como antes', () => {
        const fijos = [{ importe: 90, periodicidad: 'TRIMESTRAL' }];
        const total = prorratearGastosFijos(fijos);
        expect(total).toBeCloseTo(30, 5); // 90/3
    });

    it('varios gastos fijos se suman correctamente', () => {
        const fijos = [
            { importe: 300, periodicidad: 'MENSUAL' },
            { importe: 1200, periodicidad: 'ANUAL' },
        ];
        const total = prorratearGastosFijos(fijos);
        // 300 (mensual tal cual) + 1200/12 (anual a mensual) = 400
        expect(total).toBeCloseTo(400, 5);
    });
});
