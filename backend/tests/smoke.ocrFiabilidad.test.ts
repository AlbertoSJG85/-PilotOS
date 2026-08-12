/**
 * Tests de humo — C-056 (2026-08-12): el motor de alertas no puede acusar a
 * nadie con cifras que el OCR ha leído mal.
 *
 * Fixtures tomados de los DOS tickets reales que subió Alberto (partes del
 * 08/08 y del 10/08, vehículo 8053KKX), con los valores literales que quedaron
 * guardados en producción:
 *
 *   ticket 08/08 → Borrados 296, Dist. Total 183.043,1
 *   ticket 10/08 → "Borrados: 2937" (el ticket pone 297) y
 *                  "Dist. Total: 1831080" (pone 183.108,0 — se perdió la coma)
 *
 * Con esas dos lecturas el sistema acusó de 2.640 borrados sin declarar y
 * 1.648.004,9 km sin declarar en dos días, y mandó (intentó mandar) un
 * WhatsApp al patrón.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
    parteDiario: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    anomalia: { deleteMany: vi.fn(), create: vi.fn() },
    documento: { update: vi.fn() },
    aviso: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const enviarAvisoGlorMock = vi.fn();
vi.mock('../src/services/notificacion.service', () => ({ enviarAvisoGloria: enviarAvisoGlorMock }));

const {
    compararDocumentosConParte,
    evaluarFiabilidadAcumulados,
    importeTurnoTicket,
} = await import('../src/services/ocrComparacion.service');

// ─────────────────────────────────────────────────────────
// Funciones puras
// ─────────────────────────────────────────────────────────

describe('evaluarFiabilidadAcumulados', () => {
    const ANT = { acum_borrados: 296, acum_dist_total: 183043.1, acum_total: 148995.85, valido: true, errores: [] };

    it('ticket real del 10/08: borrados 296→2937 y km 183.043→1.831.080 en 2 días → nada es utilizable', () => {
        const act = { acum_borrados: 2937, acum_dist_total: 1831080, valido: false, errores: [] };
        const f = evaluarFiabilidadAcumulados(ANT, act, 2);
        expect(f.borrados).toBe(false);
        expect(f.km).toBe(false);
        expect(f.motivos.join(' ')).toMatch(/imposible/);
    });

    it('lectura correcta del mismo ticket (297 / 183.108,0 / 149.047,40) → todo utilizable', () => {
        const act = { acum_borrados: 297, acum_dist_total: 183108.0, acum_total: 149047.40, valido: true, errores: [] };
        const f = evaluarFiabilidadAcumulados(ANT, act, 2);
        expect(f).toMatchObject({ borrados: true, km: true, eur: true });
        expect(f.motivos).toEqual([]);
    });

    it('un contador que retrocede es imposible, no una anomalía del conductor', () => {
        const act = { acum_borrados: 290, acum_dist_total: 183108.0, acum_total: 149047.40, valido: true, errores: [] };
        expect(evaluarFiabilidadAcumulados(ANT, act, 2).borrados).toBe(false);
    });

    it('campo que el OCR no leyó → no utilizable, pero sin declararlo imposible', () => {
        const act = { acum_borrados: 297, valido: true, errores: [] };
        const f = evaluarFiabilidadAcumulados(ANT, act, 2);
        expect(f.borrados).toBe(true);
        expect(f.km).toBe(false);
        expect(f.eur).toBe(false);
        expect(f.motivos.join(' ')).not.toMatch(/imposible/);
    });

    it('el techo escala con los días: 20 borrados en 1 día es imposible, en 30 días no', () => {
        const act = { acum_borrados: 316, acum_dist_total: 183108.0, acum_total: 149047.40, valido: true, errores: [] };
        expect(evaluarFiabilidadAcumulados(ANT, act, 1).borrados).toBe(false);
        expect(evaluarFiabilidadAcumulados(ANT, act, 30).borrados).toBe(true);
    });
});

describe('importeTurnoTicket', () => {
    it('ticket real del 10/08: P Total 91,55 no cuadra con 49,75 + 1,80 → vale la suma (51,55)', () => {
        const r = importeTurnoTicket({
            parc_total: 91.55, parc_carreras: 49.75, parc_suplementos: 1.80, valido: false, errores: [],
        });
        expect(r).toEqual({ valor: 51.55, reconstruido: true });
    });

    it('si las tres cifras cuadran, manda el P Total impreso', () => {
        const r = importeTurnoTicket({
            parc_total: 2024.65, parc_carreras: 1967.05, parc_suplementos: 57.60, valido: true, errores: [],
        });
        expect(r).toEqual({ valor: 2024.65, reconstruido: false });
    });

    it('sin carreras/suplementos no hay con qué contrastar: se usa el P Total tal cual', () => {
        expect(importeTurnoTicket({ parc_total: 91.55, valido: true, errores: [] }))
            .toEqual({ valor: 91.55, reconstruido: false });
    });

    it('sin ninguna cifra utilizable → null (no se compara nada)', () => {
        expect(importeTurnoTicket({ valido: false, errores: [] })).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────
// Integración con la comparación completa
// ─────────────────────────────────────────────────────────

const TELEFONO_PATRON = '+34600111222';

function ticketAnterior(fecha: string, datos: Record<string, unknown>) {
    return {
        id: 'p1',
        vehiculo_id: 'v1',
        fecha_trabajada: new Date(fecha),
        conductor_id: 'cond-1',
        documentos: [{
            documento: { id: 'doc1', tipo: 'TICKET_TAXIMETRO', estado: 'OK', ocr_datos_extraidos: datos },
        }],
    };
}

function parteActual(fecha: string, datos: Record<string, unknown>, ingresoBruto = 32, kmInicio = 252068, kmFin = 252100) {
    return {
        id: 'p2',
        vehiculo_id: 'v1',
        fecha_trabajada: new Date(fecha),
        conductor_id: 'cond-1',
        ingreso_bruto: ingresoBruto,
        combustible: null,
        km_inicio: kmInicio,
        km_fin: kmFin,
        vehiculo: { matricula: '8053KKX', cliente: { id: 'cli-1', patron: { telefono: TELEFONO_PATRON } } },
        documentos: [{
            documento: { id: 'doc2', tipo: 'TICKET_TAXIMETRO', estado: 'OK', ocr_datos_extraidos: datos },
        }],
    };
}

describe('compararAcumulados con lecturas de OCR poco fiables (caso real 08→10/08)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.anomalia.deleteMany.mockResolvedValue({});
        prismaMock.documento.update.mockResolvedValue({});
        prismaMock.anomalia.create.mockImplementation(async ({ data }: any) => ({ id: 'anom-1', ...data }));
        prismaMock.aviso.findUnique.mockResolvedValue(null);
        prismaMock.aviso.create.mockResolvedValue({ id: 'aviso-1' });
        prismaMock.aviso.update.mockResolvedValue({});
        enviarAvisoGlorMock.mockResolvedValue({ ok: true });
    });

    it('el caso que disparó C-056: NO acusa, NO manda WhatsApp, y dice que revise la foto', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(parteActual('2026-08-10', {
            // valores literales guardados en producción para ese ticket
            parc_total: 91.55, parc_carreras: 49.75, parc_suplementos: 1.80, parc_dist_total: 64.9,
            acum_borrados: 2937, acum_dist_total: 1831080,
        }));
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior('2026-08-08', {
            acum_borrados: 296, acum_dist_total: 183043.1,
        }));
        prismaMock.parteDiario.findMany.mockResolvedValue([{ km_inicio: 252068, km_fin: 252100, ingreso_bruto: 32 }]);

        const r = await compararDocumentosConParte('p2');

        const disc = r.discrepancias_por_doc['doc2'] ?? [];
        const borrados = disc.find((d) => d.campo === 'borrados');
        expect(borrados?.severidad).toBe('NORMAL');
        expect(borrados?.mensaje).toMatch(/LECTURA del ticket/);
        expect(borrados?.mensaje).not.toMatch(/2640|1648004/);
        // Nadie recibe una acusación por un dígito mal leído.
        expect(enviarAvisoGlorMock).not.toHaveBeenCalled();
        expect(prismaMock.anomalia.create.mock.calls.every((c: any) => c[0].data.tipo === 'NORMAL')).toBe(true);
    });

    it('el importe del turno se compara contra 51,55 (suma real), no contra los 91,55 mal leídos', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(parteActual('2026-08-10', {
            parc_total: 91.55, parc_carreras: 49.75, parc_suplementos: 1.80,
        }));
        prismaMock.parteDiario.findFirst.mockResolvedValue(null);

        const r = await compararDocumentosConParte('p2');

        const total = (r.discrepancias_por_doc['doc2'] ?? []).find((d) => d.campo === 'total');
        expect(total?.detectado).toBe(51.55);
        expect(total?.diff).toBe(19.55);
        expect(total?.mensaje).toMatch(/P Carreras \+ P Suplementos/);
    });

    it('tickets muy separados en el tiempo (mayo → agosto): informa, pero no acusa ni avisa', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(parteActual('2026-08-08', {
            parc_total: 2024.65, acum_borrados: 296, acum_dist_total: 183043.1,
        }, 2024.65, 249716, 252068));
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior('2026-05-18', {
            acum_borrados: 288, acum_dist_total: 179.8,
        }));
        prismaMock.parteDiario.findMany.mockResolvedValue([{ km_inicio: 249716, km_fin: 252068, ingreso_bruto: 2024.65 }]);

        const r = await compararDocumentosConParte('p2');

        const borrados = (r.discrepancias_por_doc['doc2'] ?? []).find((d) => d.campo === 'borrados');
        expect(borrados?.severidad).toBe('NORMAL');
        expect(borrados?.mensaje).toMatch(/días desde el ticket anterior/);
        expect(enviarAvisoGlorMock).not.toHaveBeenCalled();
    });

    it('borrado de más pero sin km ni € contrastables → aviso NORMAL, sin WhatsApp', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(parteActual('2026-08-10', {
            parc_total: 51.55, acum_borrados: 299,
        }));
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior('2026-08-08', { acum_borrados: 297 }));
        prismaMock.parteDiario.findMany.mockResolvedValue([{ km_inicio: 252068, km_fin: 252100, ingreso_bruto: 51.55 }]);

        const r = await compararDocumentosConParte('p2');

        const borrados = (r.discrepancias_por_doc['doc2'] ?? []).find((d) => d.campo === 'borrados');
        expect(borrados?.severidad).toBe('NORMAL');
        expect(borrados?.mensaje).toMatch(/No se ha podido comprobar/);
        expect(enviarAvisoGlorMock).not.toHaveBeenCalled();
    });
});
