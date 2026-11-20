/**
 * Fotos por WhatsApp (2026-11-20): corregir, confirmar, descartar, pasar a la app y purgar.
 * Prisma en memoria (solo lo que tocan estas operaciones).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Fila = Record<string, any>;
const db = { documentos: [] as Fila[], gastos: [] as Fila[] };
const usuarios = [
    { id: 1, telefono: '34600000001' }, // patrón
    { id: 2, telefono: '34600000002' }, // conductor asalariado
    { id: 3, telefono: '34600000003' }, // patrón de OTRA empresa
];

function coincide(f: Fila, where: Fila = {}): boolean {
    return Object.entries(where).every(([k, v]) => {
        if (k === 'NOT') return !coincide(f, v as Fila);
        if (v && typeof v === 'object' && 'not' in v) return f[k] !== (v as any).not;
        if (v && typeof v === 'object' && 'lt' in v) return f[k] < (v as any).lt;
        if (v && typeof v === 'object' && 'in' in v) return (v as any).in.includes(f[k]);
        if (k === 'vehiculo') return true;
        return f[k] === v;
    });
}

const prismaMock: any = {
    minosUser: { findFirst: vi.fn(async ({ where }: any) => usuarios.find((u) => where.telefono.in.includes(u.telefono)) ?? null) },
    conductor: {
        findFirst: vi.fn(async ({ where }: any) => (where.usuario_id === 2 ? { id: 'c2', cliente_id: 'cliA', es_patron: false } : null)),
    },
    cliente: {
        findFirst: vi.fn(async ({ where }: any) => (where.patron_id === 1 ? { id: 'cliA' } : where.patron_id === 3 ? { id: 'cliB' } : null)),
    },
    vehiculo: {
        findMany: vi.fn(async ({ where }: any) => (where.cliente_id === 'cliA'
            ? [{ id: 'v1', matricula: '1234BCD' }, { id: 'v2', matricula: '5678FGH' }]
            : [{ id: 'vB', matricula: '0000BBB' }])),
    },
    vehiculoConductor: { findMany: vi.fn(async () => [{ vehiculo_id: 'v2' }]) },
    documento: {
        findUnique: vi.fn(async ({ where }: any) => db.documentos.find((d) => d.id === where.id) ?? null),
        findFirst: vi.fn(async ({ where }: any) => db.documentos.find((d) => coincide(d, where)) ?? null),
        findMany: vi.fn(async ({ where }: any) => db.documentos.filter((d) => coincide(d, where))),
        create: vi.fn(async ({ data }: any) => { const f = { id: `d${db.documentos.length + 1}`, created_at: new Date(), aplicado_at: null, ...data }; db.documentos.push(f); return f; }),
        update: vi.fn(async ({ where, data }: any) => { const f = db.documentos.find((d) => d.id === where.id)!; Object.assign(f, data); return f; }),
        updateMany: vi.fn(async ({ where, data }: any) => { const fs = db.documentos.filter((d) => coincide(d, where)); fs.forEach((f) => Object.assign(f, data)); return { count: fs.length }; }),
        deleteMany: vi.fn(async ({ where }: any) => { const antes = db.documentos.length; db.documentos = db.documentos.filter((d) => !coincide(d, where)); return { count: antes - db.documentos.length }; }),
    },
    gasto: { findMany: vi.fn(async ({ where }: any) => db.gastos.filter((g) => g.cliente_id === where.cliente_id && g.fecha.getTime() === where.fecha.getTime())) },
};
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/ocr.service', () => ({ analizarImagen: vi.fn(), extraerTextoImagen: vi.fn(), normalizarNumerosOcr: (t: string) => t }));
const aplicarMock = vi.fn(async () => ({ mantenimientos_actualizados: ['Cambio de aceite y filtro'], gasto_id: 'g1', avisos: [] }));
vi.mock('../src/services/aplicarDocumento.service', async (orig) => ({ ...(await orig<any>()), aplicarDocumentoConfirmado: aplicarMock }));
const unlinkMock = vi.fn(async () => undefined);
vi.mock('fs', async (orig) => { const real = await orig<any>(); return { ...real, default: { ...real, promises: { ...real.promises, unlink: unlinkMock } } }; });

const svc = await import('../src/services/borradorWhatsapp.service');
const { analizarDocumentoVehiculo } = await import('../src/services/ocrDocumentoVehiculo.service');

const TALLER = `TALLERES LOPEZ\nFACTURA 118\nFecha: 12/11/2026\nCambio de aceite y filtro\nmano de obra\nBase imponible 120,58\nTOTAL FACTURA 145,90 €`;

function borradorLeido(usuario: number, vehiculo_id: string | null = null, texto = TALLER): Fila {
    const f: Fila = {
        id: `d${db.documentos.length + 1}`, tipo: 'FACTURA_TALLER', url: 'https://x/uploads/foto.jpg', hash_sha256: 'h',
        estado: 'BORRADOR_WHATSAPP', estado_ocr: 'COMPLETADO', ocr_texto: texto,
        ocr_datos_extraidos: analizarDocumentoVehiculo(texto), vehiculo_id, subido_por_usuario_id: usuario,
        datos_confirmados: null, created_at: new Date(), aplicado_at: null,
    };
    db.documentos.push(f);
    return f;
}

beforeEach(() => { db.documentos = []; aplicarMock.mockClear(); unlinkMock.mockClear(); });

describe('quién puede tocar un borrador', () => {
    it('otro teléfono (otra empresa) no lo ve: como si no existiera', async () => {
        const b = borradorLeido(1);
        expect(await svc.verBorrador(b.id, '34600000003')).toBe('borrador_no_encontrado');
        expect(await svc.confirmarBorrador(b.id, '34600000003')).toBe('borrador_no_encontrado');
        expect(await svc.descartarBorrador(b.id, '34600000003')).toBe('borrador_no_encontrado');
        expect(db.documentos).toHaveLength(1);
    });
    it('un teléfono que no es de PilotOS', async () => {
        expect(await svc.verBorrador('d1', '34999999999')).toBe('usuario_no_encontrado');
    });
});

describe('posible duplicado', () => {
    it('como la ITV real (49,26 € leídos, 50 € apuntados): factura de 145,90 € y gasto de 150 € el mismo día → se avisa', async () => {
        db.gastos = [{ cliente_id: 'cliA', fecha: new Date(Date.UTC(2026, 10, 12)), importe: 150, descripcion: 'Aceite (apuntado a mano)' }];
        const b = borradorLeido(1, 'v1');
        const l = await svc.verBorrador(b.id, '34600000001');
        expect(l).toMatchObject({ duplicado: { motivo: 'gasto_parecido', importe: 150, descripcion: 'Aceite (apuntado a mano)' } });
        db.gastos = [];
    });
    it('importe parecido: margen de 1 € o 5 %', () => {
        expect(svc.importeParecido(49.26, 50)).toBe(true);
        expect(svc.importeParecido(145.9, 150)).toBe(true);
        expect(svc.importeParecido(145.9, 160)).toBe(false);
        expect(svc.importeParecido(10, 12)).toBe(false);
    });
});

describe('patrón con dos vehículos', () => {
    it('sin vehículo no se puede confirmar; tras decir "el 5678", sí, y se archiva', async () => {
        const b = borradorLeido(1);
        const sin = await svc.confirmarBorrador(b.id, '34600000001');
        expect(sin).toMatchObject({ fallo: 'no_listo' });
        expect(aplicarMock).not.toHaveBeenCalled();

        const corregida = await svc.corregirBorrador(b.id, '34600000001', { matricula: 'el 5678' });
        expect(corregida).toMatchObject({ vehiculo: { id: 'v2', como: 'elegido' }, listo_para_confirmar: true });

        const ok = await svc.confirmarBorrador(b.id, '34600000001');
        expect(ok).toMatchObject({ estado: 'ARCHIVADO', gasto_id: 'g1' });
        expect(aplicarMock).toHaveBeenCalledTimes(1);
        const [, datos, usuario, cliente] = aplicarMock.mock.calls[0] as any[];
        expect(datos).toMatchObject({ fecha: '12/11/2026', importe: 145.9, matricula: '5678FGH' });
        expect([usuario, cliente]).toEqual([1, 'cliA']);
        expect(db.documentos[0]).toMatchObject({ vehiculo_id: 'v2', corregido: false });
    });

    it('un segundo "sí" no vuelve a archivar', async () => {
        const b = borradorLeido(1, 'v1');
        await svc.confirmarBorrador(b.id, '34600000001');
        b.estado = 'APLICADO';
        expect(await svc.confirmarBorrador(b.id, '34600000001')).toBe('ya_cerrado');
        expect(aplicarMock).toHaveBeenCalledTimes(1);
    });

    it('una corrección imposible se rechaza y no cambia nada', async () => {
        const b = borradorLeido(1);
        expect(await svc.corregirBorrador(b.id, '34600000001', { importe: 'mucho' })).toBe('cambio_invalido');
        expect(await svc.corregirBorrador(b.id, '34600000001', { matricula: '9999ZZZ' })).toBe('cambio_invalido');
        expect(await svc.corregirBorrador(b.id, '34600000001', { fecha: '31/02' })).toBe('cambio_invalido');
        expect(b.datos_confirmados).toBeNull();
    });

    it('corregir el concepto cambia el mantenimiento que se pone al día', async () => {
        const b = borradorLeido(1, 'v1');
        await svc.corregirBorrador(b.id, '34600000001', { concepto: 'Cambio de neumáticos' });
        await svc.confirmarBorrador(b.id, '34600000001');
        const [, datos] = aplicarMock.mock.calls[0] as any[];
        expect(datos.mantenimientos).toEqual(['Neumaticos']);
        expect(datos.descripcion).toBe('Cambio de neumáticos');
    });
});

describe('conductor asalariado', () => {
    it('solo elige entre sus coches asignados', async () => {
        const quien = await svc.resolverRemitente('34600000002');
        expect(quien).toMatchObject({ esPatron: false, flota: [{ id: 'v2', matricula: '5678FGH' }] });
    });
    it('si contradice al papel, va a revisión del dueño y no se aplica', async () => {
        const b = borradorLeido(2, 'v2');
        await svc.corregirBorrador(b.id, '34600000002', { importe: 100 });
        const r = await svc.confirmarBorrador(b.id, '34600000002');
        expect(r).toMatchObject({ estado: 'EN_REVISION' });
        expect(aplicarMock).not.toHaveBeenCalled();
        expect(db.documentos[0]).toMatchObject({ estado: 'PENDIENTE_REVISION', corregido: true });
    });
    it('si acepta lo leído, se aplica', async () => {
        const b = borradorLeido(2, 'v2');
        expect(await svc.confirmarBorrador(b.id, '34600000002')).toMatchObject({ estado: 'ARCHIVADO' });
    });
});

describe('descartar, pasar a la app y purga', () => {
    it('descartar borra la fila y la foto', async () => {
        const b = borradorLeido(1);
        expect(await svc.descartarBorrador(b.id, '34600000001')).toEqual({ ok: true });
        expect(db.documentos).toHaveLength(0);
        expect(unlinkMock).toHaveBeenCalledTimes(1);
    });
    it('a la app: necesita vehículo; con él, queda pendiente de confirmar en Documentos', async () => {
        const b = borradorLeido(1);
        expect(await svc.borradorALaApp(b.id, '34600000001')).toMatchObject({ fallo: 'no_listo' });
        await svc.corregirBorrador(b.id, '34600000001', { matricula: '1234' });
        expect(await svc.borradorALaApp(b.id, '34600000001')).toEqual({ ok: true });
        expect(db.documentos[0]).toMatchObject({ estado: 'PENDIENTE_CONFIRMACION', vehiculo_id: 'v1' });
    });
    it('a los 7 días se borran los borradores sin respuesta, y solo esos', async () => {
        const viejo = borradorLeido(1); viejo.created_at = new Date(Date.now() - 8 * 86400000);
        const nuevo = borradorLeido(1); nuevo.created_at = new Date(Date.now() - 2 * 86400000);
        const archivado = borradorLeido(1); archivado.estado = 'APLICADO'; archivado.created_at = new Date(Date.now() - 30 * 86400000);
        expect(await svc.purgarBorradoresWhatsapp()).toBe(1);
        expect(db.documentos.map((d) => d.id)).toEqual([nuevo.id, archivado.id]);
    });
});
