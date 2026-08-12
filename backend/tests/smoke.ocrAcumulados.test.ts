/**
 * Tests de humo — comparación de acumulados del taxímetro entre tickets
 * (2026-08-11, diseño acordado con Alberto a partir de un ticket real, ver
 * también smoke.ocrTaximetro.test.ts para el parser de OCR).
 *
 * Regla: los borrados esperados no son "máximo +1 fijo", son el borrado del
 * ticket anterior + el número de partes (turnos) declarados entre los dos
 * tickets. Si sobran borrados: si además sobra dinero acumulado sin declarar
 * → mensaje de "trabajo no declarado"; si solo sobran km sin dinero → mensaje
 * de "uso del vehículo fuera de trabajo, pregúntaselo al asalariado".
 *
 * Además (mismo día): toda anomalía CRÍTICA avisa al patrón por WhatsApp vía
 * el mismo canal que los avisos de mantenimiento (`enviarAvisoGloria`), y
 * queda registrada como `Aviso` para trazabilidad. Un fallo de ese envío
 * nunca debe romper la comparación ni dejar de registrar la Anomalia.
 *
 * Se mockea prisma y notificacion.service: aquí interesa la lógica de
 * comparación y de aviso, no la BD ni la red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
    parteDiario: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    anomalia: { deleteMany: vi.fn(), create: vi.fn() },
    documento: { update: vi.fn() },
    aviso: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

// Desde el 2026-08-12 el aviso sale por los DOS canales (WhatsApp + email)
// a traves de avisarPatron.
const avisarPatronMock = vi.fn();
vi.mock('../src/services/notificacion.service', () => ({ avisarPatron: avisarPatronMock }));

const { compararDocumentosConParte } = await import('../src/services/ocrComparacion.service');

const TELEFONO_PATRON = '+34600111222';
const MATRICULA = '1234ABC';

function ticketAnterior(overrides: Partial<Record<string, number>> = {}) {
    return {
        id: 'p1',
        vehiculo_id: 'v1',
        fecha_trabajada: new Date('2026-08-10'),
        conductor_id: 'cond-1',
        documentos: [{
            documento: {
                id: 'doc1',
                tipo: 'TICKET_TAXIMETRO',
                estado: 'OK',
                ocr_datos_extraidos: {
                    acum_borrados: 297,
                    acum_dist_total: 183108.0,
                    acum_total: 149047.40,
                    ...overrides,
                },
            },
        }],
    };
}

function parteActual(datosTicket: Record<string, unknown>, kmInicio = 1000, kmFin = 1064.9, ingresoBruto = 51.55) {
    return {
        id: 'p2',
        vehiculo_id: 'v1',
        fecha_trabajada: new Date('2026-08-11'),
        conductor_id: 'cond-1',
        ingreso_bruto: ingresoBruto,
        combustible: null,
        km_inicio: kmInicio,
        km_fin: kmFin,
        vehiculo: {
            matricula: MATRICULA,
            cliente: { id: 'cli-1', patron: { telefono: TELEFONO_PATRON } },
        },
        documentos: [{
            documento: {
                id: 'doc2',
                tipo: 'TICKET_TAXIMETRO',
                estado: 'OK',
                ocr_datos_extraidos: {
                    parc_total: ingresoBruto,
                    parc_dist_total: kmFin - kmInicio,
                    fecha: '11/08/2026',
                    ...datosTicket,
                },
            },
        }],
    };
}

/** El único parte "entre tickets" es el actual — caso normal, ticket a diario. */
function partesEntreTickets(kmInicio = 1000, kmFin = 1064.9, ingresoBruto = 51.55) {
    return [{ km_inicio: kmInicio, km_fin: kmFin, ingreso_bruto: ingresoBruto }];
}

describe('compararAcumulados (vía compararDocumentosConParte)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.anomalia.deleteMany.mockResolvedValue({});
        prismaMock.documento.update.mockResolvedValue({});
        prismaMock.anomalia.create.mockImplementation(async ({ data }: any) => ({ id: 'anom-1', ...data }));
        prismaMock.aviso.findUnique.mockResolvedValue(null); // sin aviso previo -> se crea
        prismaMock.aviso.create.mockResolvedValue({ id: 'aviso-1' });
        prismaMock.aviso.update.mockResolvedValue({});
        avisarPatronMock.mockResolvedValue({ ok: true });
    });

    it('todo cuadra (borrado esperado exacto, km y € sin diferencia) → sin anomalía ni aviso', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 298, acum_dist_total: 183172.9, acum_total: 149098.95 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue(partesEntreTickets());

        const r = await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).not.toHaveBeenCalled();
        expect(avisarPatronMock).not.toHaveBeenCalled();
        const disc = r.discrepancias_por_doc['doc2'] ?? [];
        expect(disc.find((d) => d.campo === 'borrados')).toBeUndefined();
    });

    it('caso explicable: borrado y km de más, dinero cuadra → aviso de "uso del vehículo", y WhatsApp al patrón', async () => {
        // borrados: esperado 297+1=298, llega 299 → 1 borrado sin turno.
        // km: salto 104.9 vs declarado 64.9 → 40 km sin declarar (> tolerancia 20).
        // €: salto exactamente igual al declarado → sin dinero de más.
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 299, acum_dist_total: 183212.9, acum_total: 149098.95 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue(partesEntreTickets());

        const r = await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).toHaveBeenCalledTimes(1);
        const mensaje = prismaMock.anomalia.create.mock.calls[0][0].data.descripcion as string;
        expect(mensaje).toContain('40.0 km');
        expect(mensaje).toMatch(/uso del vehículo fuera de trabajo/i);
        expect(mensaje).not.toMatch(/trabajo no declarado/i);

        const disc = r.discrepancias_por_doc['doc2'].find((d) => d.campo === 'borrados');
        expect(disc?.severidad).toBe('CRITICA');
        expect(disc?.diff).toBe(1);

        // Aviso al patrón: mismo canal que mantenimiento, plantilla nueva.
        expect(prismaMock.aviso.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.aviso.create.mock.calls[0][0].data).toMatchObject({
            cliente_id: 'cli-1', tipo: 'ANOMALIA', canal: 'whatsapp+email',
        });
        expect(avisarPatronMock).toHaveBeenCalledWith(
            expect.objectContaining({ telefono: TELEFONO_PATRON }),
            expect.objectContaining({
                tipo: 'anomalia_taximetro',
                template_params: expect.objectContaining({ matricula: MATRICULA, motivo: expect.stringMatching(/40 km.*sin dinero de más/i) }),
                asunto: expect.stringContaining(MATRICULA),
            }),
        );
        expect(prismaMock.aviso.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'aviso-1' } }),
        );
    });

    it('caso grave: borrado, km Y dinero de más → aviso de "trabajo no declarado" por WhatsApp', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 299, acum_dist_total: 183212.9, acum_total: 149113.95 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue(partesEntreTickets());

        await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).toHaveBeenCalledTimes(1);
        const mensaje = prismaMock.anomalia.create.mock.calls[0][0].data.descripcion as string;
        expect(mensaje).toContain('40.0 km');
        expect(mensaje).toContain('15.00 €');
        expect(mensaje).toMatch(/trabajo no declarado/i);

        expect(avisarPatronMock).toHaveBeenCalledWith(
            expect.objectContaining({ telefono: TELEFONO_PATRON }),
            expect.objectContaining({
                tipo: 'anomalia_taximetro',
                template_params: expect.objectContaining({ motivo: expect.stringMatching(/trabajo no declarado/i) }),
            }),
        );
    });

    it('borrados por debajo de lo esperado → CRITICA de manipulación + WhatsApp, sin mirar km/€', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 297, acum_dist_total: 183172.9, acum_total: 149098.95 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue(partesEntreTickets());

        await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).toHaveBeenCalledTimes(1);
        const mensaje = prismaMock.anomalia.create.mock.calls[0][0].data.descripcion as string;
        expect(mensaje).toMatch(/manipulación del contador/i);
        expect(avisarPatronMock).toHaveBeenCalledTimes(1);
    });

    it('ticket con varios partes de por medio: los borrados esperados suman todos los turnos, no solo +1', async () => {
        // Dos partes entre tickets (el conductor subió el ticket cada 2 días):
        // esperado = 297 + 2 = 299.
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 299, acum_dist_total: 183108 + 64.9 + 40.2, acum_total: 149047.40 + 51.55 + 38.10 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue([
            { km_inicio: 900, km_fin: 940.2, ingreso_bruto: 38.10 }, // turno intermedio, sin ticket propio
            { km_inicio: 1000, km_fin: 1064.9, ingreso_bruto: 51.55 }, // turno de hoy (con ticket)
        ]);

        await compararDocumentosConParte('p2');

        // 2 partes explican 2 borrados (297+2=299=actual) y todo el km/€ → sin aviso.
        expect(prismaMock.anomalia.create).not.toHaveBeenCalled();
        expect(avisarPatronMock).not.toHaveBeenCalled();
    });

    it('sin ticket anterior (primer ticket del vehículo) → no revienta, no compara, no avisa', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 5 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(null);

        const r = await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).not.toHaveBeenCalled();
        expect(avisarPatronMock).not.toHaveBeenCalled();
        expect(r.discrepancias_por_doc['doc2']?.find((d) => d.campo === 'borrados')).toBeUndefined();
    });

    it('ticket sin acum_borrados extraído (OCR no lo leyó) → no compara, no falla', async () => {
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: undefined }),
        );

        const r = await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).not.toHaveBeenCalled();
        expect(prismaMock.parteDiario.findFirst).not.toHaveBeenCalled();
        expect(r.discrepancias_por_doc['doc2']?.find((d) => d.campo === 'borrados')).toBeUndefined();
    });

    it('el patrón sin teléfono registrado: la anomalía se guarda igual, pero no se intenta enviar WhatsApp', async () => {
        const parte = parteActual({ acum_borrados: 299, acum_dist_total: 183212.9, acum_total: 149098.95 });
        (parte as any).vehiculo.cliente.patron.telefono = null;
        prismaMock.parteDiario.findUnique.mockResolvedValue(parte);
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue(partesEntreTickets());

        await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.aviso.create).not.toHaveBeenCalled();
        expect(avisarPatronMock).not.toHaveBeenCalled();
    });

    it('si el envío a GlorIA falla, la Anomalia queda registrada igual (el fallo no rompe la comparación)', async () => {
        avisarPatronMock.mockResolvedValue({ ok: false, error: 'timeout' });
        prismaMock.parteDiario.findUnique.mockResolvedValue(
            parteActual({ acum_borrados: 299, acum_dist_total: 183212.9, acum_total: 149098.95 }),
        );
        prismaMock.parteDiario.findFirst.mockResolvedValue(ticketAnterior());
        prismaMock.parteDiario.findMany.mockResolvedValue(partesEntreTickets());

        const r = await compararDocumentosConParte('p2');

        expect(prismaMock.anomalia.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.aviso.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'aviso-1' }, data: expect.objectContaining({ error_envio: 'timeout' }) }),
        );
        expect(r.discrepancias_por_doc['doc2'].find((d) => d.campo === 'borrados')).toBeDefined();
    });
});
