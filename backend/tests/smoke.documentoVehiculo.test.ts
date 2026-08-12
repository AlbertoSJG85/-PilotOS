/**
 * Tests de humo — documentación del vehículo (2026-08-12).
 *
 * La regla que fijó Alberto y que estos tests protegen:
 *
 *   · Cualquiera de los dos sube y corrige.
 *   · Acepta lo que dice el documento  → se aplica.
 *   · Lo corrige el DUEÑO              → se aplica (su palabra vale).
 *   · Lo corrige el ASALARIADO         → NO se aplica, va a revisión.
 *
 * Lo que dispara la revisión es contradecir al documento, no quién lo sube.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../src/middleware/auth.middleware';

const prismaMock: any = {
    documento: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    vehiculo: { findUnique: vi.fn() },
};
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const aplicarMock = vi.fn();
vi.mock('../src/services/aplicarDocumento.service', () => ({
    aplicarDocumentoConfirmado: aplicarMock,
}));

const { default: rutas } = await import('../src/routes/documentoVehiculo.routes');
const {
    clasificarDocumento, extraerMatricula, extraerValidaHasta,
    detectarMantenimientos, analizarDocumentoVehiculo, extraerImporteFactura,
} = await import('../src/services/ocrDocumentoVehiculo.service');

function manejador(metodo: string, ruta: string) {
    const capa = (rutas as any).stack.find((c: any) => c.route?.path === ruta && c.route?.methods?.[metodo]);
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    const stack = capa.route.stack;
    return stack[stack.length - 1].handle as (req: AuthRequest, res: Response) => Promise<void>;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

const PATRON = { id: 1, telefono: '+34600000001', nombre: 'Dueño', role: 'user', es_patron: true, cliente_id: 'cli-1' };
const ASALARIADO = { id: 2, telefono: '+34600000002', nombre: 'Asalariado', role: 'user', es_patron: false, cliente_id: 'cli-1', conductor_id: 'cond-2' };

const DOC = {
    id: 'doc-1',
    url: '/uploads/factura.jpg',
    estado: 'PENDIENTE_CONFIRMACION',
    aplicado_at: null,
    vehiculo_id: 'veh-1',
    vehiculo: { cliente_id: 'cli-1' },
    ocr_datos_extraidos: {
        tipo: 'FACTURA_TALLER',
        fecha: '05/08/2026',
        importe: 420.5,
        mantenimientos_detectados: ['Neumaticos'],
    },
    datos_confirmados: null,
};

// ─────────────────────────────────────────────────────────
// Lectura del documento (funciones puras)
// ─────────────────────────────────────────────────────────

describe('clasificar y leer un documento del vehículo', () => {
    it('reconoce una ITV', () => {
        expect(clasificarDocumento('ESTACION ITV — INSPECCION TECNICA DE VEHICULOS')).toBe('CERTIFICADO_ITV');
    });

    it('reconoce una factura de taller', () => {
        expect(clasificarDocumento('FACTURA A-2026/145\nTaller Hermanos\nMano de obra')).toBe('FACTURA_TALLER');
    });

    it('lo que no reconoce lo deja sin clasificar, no se lo inventa', () => {
        expect(clasificarDocumento('hola qué tal')).toBe('DOCUMENTO_VEHICULO_SIN_CLASIFICAR');
    });

    it('lee la matrícula moderna y la antigua', () => {
        expect(extraerMatricula('Matricula: 8053 KKX')).toBe('8053KKX');
        expect(extraerMatricula('Matricula: M-1234-AB')).toBe('M-1234-AB');
    });

    it('coge la fecha de validez por su etiqueta', () => {
        expect(extraerValidaHasta('PROXIMA INSPECCION: 14/08/2028')).toBe('14/08/2028');
        expect(extraerValidaHasta('Válida hasta 01/09/2027')).toBe('01/09/2027');
    });

    it('mapea los conceptos de la factura a mantenimientos del catálogo', () => {
        const m = detectarMantenimientos('4 NEUMATICOS 205/55 R16 y PASTILLAS DE FRENO delanteras');
        expect(m).toContain('Neumaticos');
        expect(m).toContain('Pastillas de freno');
    });

    it('una factura combinada propone TODO lo que resuelve, no solo lo primero', () => {
        const r = analizarDocumentoVehiculo(
            'FACTURA Taller\nFecha: 05/08/2026\n4 neumaticos\ndiscos de freno\npastillas de freno\nTOTAL A PAGAR: 620,00 €',
        );
        expect(r.tipo).toBe('FACTURA_TALLER');
        expect(r.mantenimientos_detectados).toEqual(
            expect.arrayContaining(['Neumaticos', 'Discos de freno', 'Pastillas de freno']),
        );
    });

    it('una ITV siempre propone el mantenimiento de ITV, aunque el texto salga sucio', () => {
        const r = analizarDocumentoVehiculo('INSPECCION TECNICA\nPROXIMA INSPECCION 14/08/2028', 'CERTIFICADO_ITV');
        expect(r.mantenimientos_detectados).toContain('ITV del vehiculo');
        expect(r.valida_hasta).toBe('14/08/2028');
    });

    it('CLAVE: lo que no lee lo declara faltante en vez de inventárselo', () => {
        const r = analizarDocumentoVehiculo('papel ilegible', 'FACTURA_TALLER');
        expect(r.importe).toBeUndefined();
        expect(r.faltantes).toContain('importe');
        expect(r.faltantes).toContain('fecha');
    });
});

// ─────────────────────────────────────────────────────────
// El importe de una factura (C-064)
// ─────────────────────────────────────────────────────────

/**
 * Estos tests salen todos de la MISMA factura real: la primera que entró en
 * producción, el 2026-08-12. Propuso 54,15 € cuando el papel ponía 397,31 €,
 * porque el importe se sacaba con el lector de tickets de gasolinera y ese
 * termina cogiendo "la primera cifra con un € detrás" — que en una factura
 * con líneas de detalle es el primer artículo, no el total.
 */
describe('el importe de una factura de taller', () => {
    const FACTURA_CON_LINEAS = [
        'FACTURA INV/2026/0193',
        'Fecha factura 13/05/2026',
        'KIT DISTRIBUCION Y BOMBA DE AGUA   1,000   154,15   igic 7%   154,15€',
        'CORREA ALTERNADOR                  1,000    21,83   igic 7%    21,83€',
        'TUBO EMBRAGUE(ORIGINAL)            1,000    72,83   igic 7%    72,83€',
        'MANO DE OBRA TAXI                  4,500    25,00   igic 7%   112,50€',
        'Base imponible : 371,31€',
        'Impuesto : 26,00€',
        'Total : 397,31€',
    ].join('\n');

    it('CLAVE: coge el TOTAL, no la primera línea de la factura', () => {
        expect(extraerImporteFactura(FACTURA_CON_LINEAS)).toBeCloseTo(397.31, 2);
    });

    it('no confunde el total con la base imponible ni con el impuesto', () => {
        const r = analizarDocumentoVehiculo(FACTURA_CON_LINEAS, 'FACTURA_TALLER');
        expect(r.importe).not.toBeCloseTo(371.31, 2);
        expect(r.importe).not.toBeCloseTo(26.0, 2);
    });

    it('aguanta el ruido del OCR en la cifra: "397, 31€" y "371 31€"', () => {
        expect(extraerImporteFactura('Base imponible : 371 31€\nTotal : 397, 31€')).toBeCloseTo(397.31, 2);
    });

    it('entiende el separador de miles', () => {
        expect(extraerImporteFactura('TOTAL A PAGAR: 1.397,31 €')).toBeCloseTo(1397.31, 2);
    });

    it('CLAVE: sin una etiqueta de total, no propone importe (antes se inventaba uno)', () => {
        // Cifras en euros hay, pero ninguna dice ser el total. Antes esto
        // devolvía 154,15 €; ahora se le pregunta a la persona.
        const sinTotal = 'FACTURA Taller\nKIT DISTRIBUCION 154,15€\nCORREA 21,83€';
        expect(extraerImporteFactura(sinTotal)).toBeUndefined();
        expect(analizarDocumentoVehiculo(sinTotal, 'FACTURA_TALLER').faltantes).toContain('importe');
    });

    it('un "total" menor que la base imponible es imposible: no se propone', () => {
        const incoherente = 'Base imponible : 371,31€\nTotal : 54,15€';
        expect(analizarDocumentoVehiculo(incoherente, 'FACTURA_TALLER').importe).toBeUndefined();
    });

    it('coge la fecha por su etiqueta, no la primera del papel', () => {
        const texto = 'Vencimiento 30/06/2026\nFecha factura 13/05/2026';
        expect(analizarDocumentoVehiculo(texto, 'FACTURA_TALLER').fecha).toBe('13/05/2026');
    });
});

// ─────────────────────────────────────────────────────────
// Matrícula y kilómetros: no inventar (C-064)
// ─────────────────────────────────────────────────────────

describe('lo que el documento NO puede afirmar por su cuenta', () => {
    // "1100 mts" salió de la cabecera de la factura real y el patrón de
    // matrícula moderna (4 cifras + 3 consonantes) lo dio por bueno.
    const RUIDO = 'FACTURA taller\n1100 mts MEET N NN al EN\nTotal : 397,31€';

    it('CLAVE: no propone una matrícula que no sea la del vehículo', () => {
        expect(analizarDocumentoVehiculo(RUIDO, 'FACTURA_TALLER', '8053KKX').matricula).toBeUndefined();
    });

    it('si no se sabe de qué vehículo es, tampoco propone matrícula', () => {
        expect(analizarDocumentoVehiculo(RUIDO, 'FACTURA_TALLER').matricula).toBeUndefined();
    });

    it('si coincide con la del vehículo, sí la enseña (sirve de confirmación)', () => {
        const texto = 'FACTURA taller\nVehiculo: 8053 KKX\nTotal : 397,31€';
        expect(analizarDocumentoVehiculo(texto, 'FACTURA_TALLER', '8053-KKX').matricula).toBe('8053KKX');
    });

    it('descarta kilómetros imposibles (el "Kilómetro 245,25" de la factura real)', () => {
        const texto = 'FACTURA taller\nKilómetro 245,25\nTotal : 397,31€';
        expect(analizarDocumentoVehiculo(texto, 'FACTURA_TALLER').km_documento).toBeUndefined();
    });

    it('un kilometraje creíble sí se propone', () => {
        const texto = 'FACTURA taller\nKm: 245.250\nTotal : 397,31€';
        expect(analizarDocumentoVehiculo(texto, 'FACTURA_TALLER').km_documento).toBe(245250);
    });
});

// ─────────────────────────────────────────────────────────
// Confirmación
// ─────────────────────────────────────────────────────────

describe('POST /:id/confirmar — quién aplica y quién manda a revisión', () => {
    const handler = manejador('post', '/:id/confirmar');

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.documento.findUnique.mockResolvedValue(DOC);
        prismaMock.documento.update.mockImplementation(async ({ data }: any) => ({ ...DOC, ...data }));
        aplicarMock.mockResolvedValue({ mantenimientos_actualizados: ['Neumaticos'], gasto_id: 'gasto-1', avisos: [] });
    });

    it('el asalariado ACEPTA lo que dice el documento → se aplica, sin pasar por el dueño', async () => {
        const res = mockRes();
        await handler({ params: { id: 'doc-1' }, usuario: ASALARIADO, body: { acepta_ocr: true } } as any, res);

        expect(aplicarMock).toHaveBeenCalledTimes(1);
        // Se aplica lo que leyó la máquina, tal cual.
        expect(aplicarMock.mock.calls[0][1]).toMatchObject({ importe: 420.5, mantenimientos: ['Neumaticos'] });
        expect(res.json.mock.calls[0][0]).toMatchObject({ status: 'OK', aplicado: true });
    });

    it('CLAVE: el asalariado CORRIGE el documento → no se aplica nada, va a revisión del dueño', async () => {
        const res = mockRes();
        await handler({
            params: { id: 'doc-1' }, usuario: ASALARIADO,
            body: { acepta_ocr: false, datos: { importe: 500, fecha: '05/08/2026', mantenimientos: ['Neumaticos'] } },
        } as any, res);

        expect(aplicarMock).not.toHaveBeenCalled();
        expect(prismaMock.documento.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ estado: 'PENDIENTE_REVISION', corregido: true }),
        }));
        expect(res.json.mock.calls[0][0]).toMatchObject({ pendiente_revision: true });
    });

    it('el DUEÑO corrige → se aplica lo que él dice (su palabra vale)', async () => {
        const res = mockRes();
        await handler({
            params: { id: 'doc-1' }, usuario: PATRON,
            body: { acepta_ocr: false, datos: { importe: 500, fecha: '05/08/2026', mantenimientos: ['Neumaticos'] } },
        } as any, res);

        expect(aplicarMock).toHaveBeenCalledTimes(1);
        expect(aplicarMock.mock.calls[0][1]).toMatchObject({ importe: 500 });
        expect(res.json.mock.calls[0][0]).toMatchObject({ aplicado: true });
    });

    it('las dos versiones quedan guardadas: la de la máquina y la de la persona', async () => {
        const res = mockRes();
        await handler({
            params: { id: 'doc-1' }, usuario: PATRON,
            body: { acepta_ocr: false, datos: { importe: 500 } },
        } as any, res);

        const guardado = prismaMock.documento.update.mock.calls[0][0].data;
        expect(guardado.datos_confirmados).toMatchObject({ importe: 500 });
        expect(guardado.corregido).toBe(true);
        // ocr_datos_extraidos NO se toca en ninguna rama: es lo que leyó la máquina.
        expect(guardado.ocr_datos_extraidos).toBeUndefined();
    });

    it('un documento ya aplicado no se aplica dos veces', async () => {
        prismaMock.documento.findUnique.mockResolvedValue({ ...DOC, aplicado_at: new Date() });
        const res = mockRes();
        await handler({ params: { id: 'doc-1' }, usuario: PATRON, body: { acepta_ocr: true } } as any, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(aplicarMock).not.toHaveBeenCalled();
    });

    it('un documento de otro cliente → 404', async () => {
        prismaMock.documento.findUnique.mockResolvedValue({ ...DOC, vehiculo: { cliente_id: 'cli-AJENO' } });
        const res = mockRes();
        await handler({ params: { id: 'doc-1' }, usuario: PATRON, body: { acepta_ocr: true } } as any, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(aplicarMock).not.toHaveBeenCalled();
    });
});

describe('POST /:id/revisar — el dueño cierra lo que corrigió el asalariado', () => {
    const handler = manejador('post', '/:id/revisar');
    const DOC_EN_REVISION = {
        ...DOC,
        estado: 'PENDIENTE_REVISION',
        corregido: true,
        datos_confirmados: { importe: 500, fecha: '05/08/2026', mantenimientos: ['Neumaticos'] },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.documento.findUnique.mockResolvedValue(DOC_EN_REVISION);
        prismaMock.documento.update.mockResolvedValue(DOC_EN_REVISION);
        aplicarMock.mockResolvedValue({ mantenimientos_actualizados: ['Neumaticos'], gasto_id: 'gasto-1', avisos: [] });
    });

    it('aprobar → se aplica lo que dijo el asalariado', async () => {
        const res = mockRes();
        await handler({ params: { id: 'doc-1' }, usuario: PATRON, body: { aprobar: true } } as any, res);

        expect(aplicarMock.mock.calls[0][1]).toMatchObject({ importe: 500 });
    });

    it('corregir → manda el dueño', async () => {
        const res = mockRes();
        await handler({
            params: { id: 'doc-1' }, usuario: PATRON,
            body: { aprobar: false, datos: { importe: 430, fecha: '05/08/2026', mantenimientos: ['Neumaticos'] } },
        } as any, res);

        expect(aplicarMock.mock.calls[0][1]).toMatchObject({ importe: 430 });
        expect(prismaMock.documento.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ revisado_por: 1 }),
        }));
    });

    it('un documento que no está en revisión → 409', async () => {
        prismaMock.documento.findUnique.mockResolvedValue({ ...DOC, estado: 'PENDIENTE_CONFIRMACION' });
        const res = mockRes();
        await handler({ params: { id: 'doc-1' }, usuario: PATRON, body: { aprobar: true } } as any, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(aplicarMock).not.toHaveBeenCalled();
    });
});
