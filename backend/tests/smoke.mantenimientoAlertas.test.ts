/**
 * Tests de humo — Fase 6 (mantenimientos e2e en backend, sin n8n).
 *
 * Cubren la logica pura de escalones (calcularNivelKm/calcularNivelDias) y
 * el criterio de dedupe (esMasUrgente), que es lo que soluciona M3 (faltaban
 * escalones 500/250/vencido) y M4 (se avisaria el mismo umbral cada dia).
 * La orquestacion completa (procesarMantenimientos) toca BD real y queda
 * pendiente de un test de integracion (ver seccion final del informe).
 */
import { describe, it, expect } from 'vitest';
import { calcularNivelKm, calcularNivelDias, esMasUrgente, resolverPreferenciasAvisos } from '../src/services/mantenimientoAlertas.service';

describe('calcularNivelKm', () => {
    it('mas de 1000 km de margen → sin aviso (null)', () => {
        expect(calcularNivelKm(1500)).toBeNull();
        expect(calcularNivelKm(1001)).toBeNull();
    });

    it('entre 1000 y 500 km de margen → nivel 1000', () => {
        expect(calcularNivelKm(1000)).toBe(1000);
        expect(calcularNivelKm(900)).toBe(1000);
        expect(calcularNivelKm(501)).toBe(1000);
    });

    it('CRITICO: entre 500 y 250 km → nivel 500 (antes no existia este escalon)', () => {
        expect(calcularNivelKm(500)).toBe(500);
        expect(calcularNivelKm(400)).toBe(500);
        expect(calcularNivelKm(251)).toBe(500);
    });

    it('CRITICO: entre 250 y 0 km → nivel 250 (antes no existia este escalon)', () => {
        expect(calcularNivelKm(250)).toBe(250);
        expect(calcularNivelKm(100)).toBe(250);
        expect(calcularNivelKm(1)).toBe(250);
    });

    it('CRITICO: vencido (<=0) → niveles negativos cada 250 km (antes no existian recordatorios post-vencimiento)', () => {
        expect(calcularNivelKm(0)).toBe(0);
        expect(calcularNivelKm(-100)).toBe(0);
        expect(calcularNivelKm(-250)).toBe(-250);
        expect(calcularNivelKm(-300)).toBe(-250);
        expect(calcularNivelKm(-500)).toBe(-500);
        expect(calcularNivelKm(-750)).toBe(-750);
    });
});

describe('calcularNivelDias', () => {
    it('mas de 30 dias → sin aviso', () => {
        expect(calcularNivelDias(31)).toBeNull();
    });

    it('entre 30 y 0 dias → nivel 30', () => {
        expect(calcularNivelDias(30)).toBe(30);
        expect(calcularNivelDias(1)).toBe(30);
    });

    it('vencido → niveles negativos cada 15 dias', () => {
        expect(calcularNivelDias(0)).toBe(0);
        expect(calcularNivelDias(-14)).toBe(0);
        expect(calcularNivelDias(-15)).toBe(-15);
        expect(calcularNivelDias(-30)).toBe(-30);
    });
});

describe('esMasUrgente (dedupe)', () => {
    it('nivel null (sin aviso) nunca es mas urgente', () => {
        expect(esMasUrgente(null, null)).toBe(false);
        expect(esMasUrgente(null, 1000)).toBe(false);
    });

    it('sin aviso previo (null) → cualquier nivel valido dispara aviso', () => {
        expect(esMasUrgente(1000, null)).toBe(true);
    });

    it('CRITICO: mismo nivel que el ultimo notificado → NO vuelve a avisar (dedupe, antes avisaria cada dia)', () => {
        expect(esMasUrgente(1000, 1000)).toBe(false);
        expect(esMasUrgente(0, 0)).toBe(false);
        expect(esMasUrgente(-250, -250)).toBe(false);
    });

    it('nivel mas urgente (numero menor) que el ultimo → dispara aviso nuevo', () => {
        expect(esMasUrgente(500, 1000)).toBe(true);
        expect(esMasUrgente(0, 250)).toBe(true);
        expect(esMasUrgente(-250, 0)).toBe(true);
    });

    it('nivel MENOS urgente que el ultimo notificado → no deberia avisar (no retrocede)', () => {
        expect(esMasUrgente(1000, 500)).toBe(false);
    });
});

describe('calcularNivelKm/Dias con umbrales personalizados (M8, preferencias por cliente)', () => {
    it('un cliente puede pedir un unico aviso mas cercano al vencimiento, p.ej. solo 300 km antes', () => {
        expect(calcularNivelKm(500, { umbralesProximo: [300] })).toBeNull();
        expect(calcularNivelKm(300, { umbralesProximo: [300] })).toBe(300);
        expect(calcularNivelKm(1, { umbralesProximo: [300] })).toBe(300);
        expect(calcularNivelKm(0, { umbralesProximo: [300] })).toBe(0);
    });

    it('el intervalo de vencido tambien es configurable', () => {
        expect(calcularNivelKm(-100, { umbralesProximo: [1000, 500, 250], intervaloVencido: 100 })).toBe(-100);
        expect(calcularNivelKm(-250, { umbralesProximo: [1000, 500, 250], intervaloVencido: 100 })).toBe(-200);
    });

    it('calcularNivelDias respeta un umbral e intervalo personalizados', () => {
        expect(calcularNivelDias(10, { umbralProximo: 7 })).toBeNull();
        expect(calcularNivelDias(7, { umbralProximo: 7 })).toBe(7);
        expect(calcularNivelDias(-5, { umbralProximo: 7, intervaloVencido: 5 })).toBe(-5);
    });
});

describe('resolverPreferenciasAvisos (M8)', () => {
    it('sin datos (null/undefined/no-objeto) devuelve los valores por defecto de siempre', () => {
        for (const raw of [null, undefined, 'texto', 42]) {
            const prefs = resolverPreferenciasAvisos(raw);
            expect(prefs.canal).toBe('whatsapp');
            expect(prefs.umbralesKmProximo).toEqual([1000, 500, 250]);
            expect(prefs.intervaloKmVencido).toBe(250);
            expect(prefs.umbralDiasProximo).toBe(30);
            expect(prefs.intervaloDiasVencido).toBe(15);
        }
    });

    it('CRITICO: canal "ninguno" se respeta para silenciar avisos', () => {
        expect(resolverPreferenciasAvisos({ canal: 'ninguno' }).canal).toBe('ninguno');
    });

    it('cualquier otro valor de canal cae a "whatsapp" (no se inventan canales)', () => {
        expect(resolverPreferenciasAvisos({ canal: 'email' }).canal).toBe('whatsapp');
    });

    it('umbrales personalizados validos se aceptan y se ordenan de mayor a menor', () => {
        const prefs = resolverPreferenciasAvisos({ umbralesKmProximo: [200, 500] });
        expect(prefs.umbralesKmProximo).toEqual([500, 200]);
    });

    it('umbrales invalidos (negativos, no numericos, vacios) se descartan y caen al default', () => {
        expect(resolverPreferenciasAvisos({ umbralesKmProximo: [-10, 'x', 0] }).umbralesKmProximo).toEqual([1000, 500, 250]);
        expect(resolverPreferenciasAvisos({ umbralesKmProximo: [] }).umbralesKmProximo).toEqual([1000, 500, 250]);
    });

    it('CRITICO: valores fuera de rango o no enteros para los intervalos/umbral de dias caen al default (sin lanzar)', () => {
        expect(resolverPreferenciasAvisos({ intervaloKmVencido: -5 }).intervaloKmVencido).toBe(250);
        expect(resolverPreferenciasAvisos({ intervaloKmVencido: 12.5 }).intervaloKmVencido).toBe(250);
        expect(resolverPreferenciasAvisos({ umbralDiasProximo: 99999 }).umbralDiasProximo).toBe(30);
        expect(resolverPreferenciasAvisos({ intervaloDiasVencido: 'sabotaje' }).intervaloDiasVencido).toBe(15);
    });

    it('valores validos dentro de rango se respetan tal cual', () => {
        const prefs = resolverPreferenciasAvisos({ intervaloKmVencido: 500, umbralDiasProximo: 45, intervaloDiasVencido: 7 });
        expect(prefs.intervaloKmVencido).toBe(500);
        expect(prefs.umbralDiasProximo).toBe(45);
        expect(prefs.intervaloDiasVencido).toBe(7);
    });
});
