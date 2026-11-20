/**
 * Fotos por WhatsApp (2026-11-20): lo que se le enseña a la persona antes de archivar.
 * Función pura — sin BD. Ver borradorWhatsapp.service.ts.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({ prisma: {} }));
vi.mock('../src/services/ocr.service', () => ({
    analizarImagen: vi.fn(), extraerTextoImagen: vi.fn(), normalizarNumerosOcr: (t: string) => t,
}));

const { construirLectura, vehiculoPorTexto, matriculasDeLaFlotaEnTexto } = await import('../src/services/borradorWhatsapp.service');
const { analizarDocumentoVehiculo } = await import('../src/services/ocrDocumentoVehiculo.service');

const HOY = new Date(Date.UTC(2026, 10, 20));
const UNO = [{ id: 'v1', matricula: '1234BCD' }];
const DOS = [{ id: 'v1', matricula: '1234BCD' }, { id: 'v2', matricula: '5678FGH' }];

const TALLER = `TALLERES HERMANOS LOPEZ S.L.\nFACTURA N 2026/118\nFecha: 12/11/2026\nCambio de aceite y filtro\nMano de obra 40,00\nBase imponible 120,58\nIVA 21% 25,32\nTOTAL FACTURA 145,90 €`;
const IKEA = `IKEA IBERICA S.A.\nFACTURA SIMPLIFICADA\nFecha 10/11/2026\nESTANTERIA KALLAX 59,00\nBase imponible 48,76\nIVA 10,24\nTOTAL 59,00 EUR`;
const BANCO = `Inicio Visible Blue Menú Destacado Tus productos Patrimonio no financiero Viviendas Mi vivienda 1 394.050 € Espacio Seguros Encuentra tu seguro`;

function lectura(texto: string, flota = UNO, cambios = {}, extra: Partial<Parameters<typeof construirLectura>[0]> = {}) {
    const propuesta = analizarDocumentoVehiculo(texto, undefined, flota.length === 1 ? flota[0].matricula : undefined);
    return construirLectura({
        estadoDocumento: 'BORRADOR_WHATSAPP', estadoOcr: 'COMPLETADO', ocrTexto: texto, propuesta,
        vehiculoIdFijado: null, cambios, flota, duplicado: null, hoy: HOY, ...extra,
    });
}

describe('lectura de una foto de WhatsApp', () => {
    it('mientras se lee, solo dice LEYENDO', () => {
        const l = construirLectura({ estadoDocumento: 'BORRADOR_WHATSAPP', estadoOcr: 'PENDIENTE', ocrTexto: null, propuesta: null, vehiculoIdFijado: null, cambios: {}, flota: UNO, duplicado: null });
        expect(l.estado).toBe('LEYENDO');
        expect(l.listo_para_confirmar).toBe(false);
    });

    it('foto ilegible: se pide otra, no se inventa nada', () => {
        const l = construirLectura({ estadoDocumento: 'BORRADOR_WHATSAPP', estadoOcr: 'ILEGIBLE', ocrTexto: null, propuesta: null, vehiculoIdFijado: null, cambios: {}, flota: UNO, duplicado: null });
        expect(l.legible).toBe(false);
        expect(l.dudosos[0]).toMatchObject({ campo: 'legible', bloquea: true });
        expect(l.listo_para_confirmar).toBe(false);
    });

    it('factura de taller con un solo vehículo: lista para confirmar, con todo lo leído', () => {
        const l = lectura(TALLER);
        expect(l.tipo).toBe('FACTURA_TALLER');
        expect(l).toMatchObject({ fecha: '12/11/2026', importe: 145.9, vehiculo: { matricula: '1234BCD', como: 'unico_vehiculo' } });
        expect(l.concepto).toMatch(/aceite/i);
        expect(l.listo_para_confirmar).toBe(true);
    });

    it('flota de dos y la factura no dice el vehículo: se pregunta (bloquea)', () => {
        const l = lectura(TALLER, DOS);
        expect(l.vehiculo).toBeNull();
        expect(l.dudosos).toContainEqual(expect.objectContaining({ campo: 'vehiculo', bloquea: true }));
        expect(l.flota).toEqual(['1234BCD', '5678FGH']);
        expect(l.listo_para_confirmar).toBe(false);
    });

    it('flota de dos y la factura trae una matrícula de la flota: se propone, para verificarla', () => {
        const l = lectura(TALLER + '\nMatrícula: 5678 FGH', DOS);
        expect(l.vehiculo).toMatchObject({ id: 'v2', como: 'leido_en_documento' });
        expect(l.listo_para_confirmar).toBe(true);
    });

    it('una matrícula que no es de la flota no se da por buena', () => {
        const l = lectura(TALLER + '\nMatrícula: 9999 XYZ', DOS);
        expect(l.vehiculo).toBeNull();
    });

    it('la persona dice "es del 5678": queda elegido', () => {
        const l = lectura(TALLER, DOS, { matricula: '5678FGH' });
        expect(l.vehiculo).toMatchObject({ id: 'v2', como: 'elegido' });
        expect(l.listo_para_confirmar).toBe(true);
    });

    it('IKEA no parece del taxi: se pregunta antes de nada', () => {
        const l = lectura(IKEA);
        expect(l.es_del_vehiculo).toBe(false);
        expect(l.dudosos).toContainEqual(expect.objectContaining({ campo: 'del_taxi', bloquea: true }));
        expect(l.listo_para_confirmar).toBe(false);
    });

    it('IKEA, si la persona dice que sí es un gasto del taxi, se puede confirmar', () => {
        const l = lectura(IKEA, UNO, { es_del_taxi: true });
        expect(l.es_del_vehiculo).toBe(true);
        expect(l.listo_para_confirmar).toBe(true);
    });

    it('la captura del banco: no es del taxi y NO propone "Seguro del vehículo"', () => {
        const p = analizarDocumentoVehiculo(BANCO);
        expect(p.tipo).toBe('DOCUMENTO_VEHICULO_SIN_CLASIFICAR');
        expect(p.mantenimientos_detectados).toEqual([]);
        expect(p.concepto).toBeUndefined();
        const l = lectura(BANCO);
        expect(l.es_del_vehiculo).toBe(false);
    });

    it('total que no cuadra con la base: se marca como dudoso, pero no bloquea (la persona lo ve)', () => {
        const raro = TALLER.replace('TOTAL FACTURA 145,90', 'TOTAL FACTURA 1459,00');
        const l = lectura(raro);
        expect(l.dudosos).toContainEqual(expect.objectContaining({ campo: 'importe', bloquea: false }));
        expect(l.listo_para_confirmar).toBe(true);
    });

    it('sin total leído: bloquea hasta que lo diga la persona; con su corrección, listo', () => {
        const sinTotal = TALLER.replace(/TOTAL FACTURA.*$/m, '');
        expect(lectura(sinTotal).dudosos).toContainEqual(expect.objectContaining({ campo: 'importe', bloquea: true }));
        const l = lectura(sinTotal, UNO, { importe: 145.9 });
        expect(l.importe).toBe(145.9);
        expect(l.listo_para_confirmar).toBe(true);
        expect(l.corregido).toEqual([]); // no contradice: el papel no traía total
    });

    it('corregir un dato que sí se leyó cuenta como corrección', () => {
        const l = lectura(TALLER, UNO, { importe: 154.9 });
        expect(l.importe).toBe(154.9);
        expect(l.corregido).toContain('importe');
    });

    it('fecha futura o muy antigua: aviso visible', () => {
        expect(lectura(TALLER.replace('12/11/2026', '12/11/2027')).dudosos).toContainEqual(expect.objectContaining({ campo: 'fecha', bloquea: false }));
        expect(lectura(TALLER.replace('12/11/2026', '12/11/2023')).dudosos).toContainEqual(expect.objectContaining({ campo: 'fecha', bloquea: false }));
    });

    it('ya archivado / en revisión / en la app: estado final, sin dudosos', () => {
        expect(lectura(TALLER, UNO, {}, { estadoDocumento: 'APLICADO' }).estado).toBe('ARCHIVADO');
        expect(lectura(TALLER, UNO, {}, { estadoDocumento: 'PENDIENTE_REVISION' }).estado).toBe('EN_REVISION');
        expect(lectura(TALLER, UNO, {}, { estadoDocumento: 'PENDIENTE_CONFIRMACION' }).estado).toBe('EN_LA_APP');
    });
});

describe('casos reales del 2026-11-20', () => {
    const COOP = `COOPERATIVA INDUSTRIAL DE AUTO - TAXIS\nFACTURA\nFecha: 04/11/2026\nREFERENCIA   DESCRIPCIÓN   UDS.  PRECIO  I.G.I.C.  IMPORTE\nFiltro aceite   1   20,00\n                                   SUBTOTAL           83,64\n                                   IMP. I.G.I.C.        3,21\n                                   TOTAL      €      86,85`;
    const DECA = `Transportes y Excavaciones S.L.\nDOCUMENTO ELECTRÓNICO DE CONTROL ADMINISTRATIVO\nDATOS DEL TRANSPORTE\nFECHA DE REALIZACIÓN\n23/09/2026\nMATRÍCULA TRACTORA / RÍGIDO\n3386JJH\nDESTINO\nCarretera Gral. La Cisnera Km3\nNATURALEZA DE LA MERCANCÍA\nPiedra`;

    it('el total con sangría y el € delante se lee (86,85)', () => {
        const l = lectura(COOP);
        expect(l.importe).toBe(86.85);
        expect(l.dudosos.find((d) => d.campo === 'importe')).toBeUndefined();
    });
    it('un DECA de camión no es una factura de taller: no parece del taxi', () => {
        const l = lectura(DECA);
        expect(l.tipo).toBe('DOCUMENTO_VEHICULO_SIN_CLASIFICAR');
        expect(l.es_del_vehiculo).toBe(false);
    });
    it('una matrícula que no es de su flota no se asigna a "tu único vehículo": se pregunta', () => {
        const l = lectura(TALLER + '\nMatrícula: 3386JJH');
        expect(l.vehiculo).toBeNull();
        expect(l.dudosos).toContainEqual(expect.objectContaining({ campo: 'vehiculo', bloquea: true, motivo: expect.stringMatching(/3386JJH, que no es de tu flota/) }));
        expect(lectura(TALLER + '\nMatrícula: 3386JJH', UNO, { matricula: '1234' }).vehiculo).toMatchObject({ id: 'v1', como: 'elegido' });
    });
    it('la matrícula propia con una letra mal leída (8053KXX por 8053KKX) es su vehículo, no una ajena', () => {
        const flota = [{ id: 'k', matricula: '8053KKX' }, { id: 'o', matricula: '1234BCD' }];
        const l = lectura(TALLER + '\nVehículo: 8053KXX', flota);
        expect(l.vehiculo).toMatchObject({ id: 'k', como: 'leido_en_documento' });
        expect(l.listo_para_confirmar).toBe(true);
        // pero con dos letras distintas ya es otra matrícula
        expect(lectura(TALLER + '\nVehículo: 8053KZZ', flota).vehiculo).toBeNull();
    });
});

describe('qué vehículo dice la persona', () => {
    it('exacto, con espacios o por las cifras', () => {
        expect(vehiculoPorTexto('5678 fgh', DOS)?.id).toBe('v2');
        expect(vehiculoPorTexto('el 5678', DOS)?.id).toBe('v2');
        expect(vehiculoPorTexto('1234', DOS)?.id).toBe('v1');
    });
    it('si no se puede saber, null (se vuelve a preguntar)', () => {
        expect(vehiculoPorTexto('el blanco', DOS)).toBeNull();
        expect(vehiculoPorTexto('9999', DOS)).toBeNull();
        expect(vehiculoPorTexto('12', DOS)).toBeNull();
    });
    it('matrículas de la flota en el texto, ignorando separadores', () => {
        expect(matriculasDeLaFlotaEnTexto('Vehículo 1234-BCD km 120000', DOS).map((v) => v.id)).toEqual(['v1']);
    });
});
