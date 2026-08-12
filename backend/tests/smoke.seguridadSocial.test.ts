/**
 * Tests de humo — Seguridad Social del asalariado (F4, 2026-08-12).
 *
 * La regla la cerró Alberto el 2026-08-11 y lo que más se presta a
 * "arreglarlo" por error es el mes incompleto: NO se prorratea. Si el
 * asalariado estuvo de alta un solo día del mes, se le descuenta la cuota
 * entera. Estos tests están para que nadie lo "mejore" sin querer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock: any = {
    conductor: { findMany: vi.fn() },
    parteDiario: { findFirst: vi.fn() },
};
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const {
    calcularSeguridadSocial, mesesDelRango, limitesDelMes, esUltimoParteDelMes, normalizarModo,
} = await import('../src/services/seguridadSocial.service');

describe('meses que toca un periodo', () => {
    it('un rango dentro del mismo mes toca un mes', () => {
        expect(mesesDelRango(new Date('2026-08-01'), new Date('2026-08-31'))).toHaveLength(1);
    });

    it('CLAVE: un rango a caballo entre dos meses toca DOS, y por tanto se deben dos cuotas', () => {
        // Del 20 de julio al 5 de agosto son dos meses naturales: cada uno
        // devenga su cuota completa. No se prorratea por los días de cada uno.
        expect(mesesDelRango(new Date('2026-07-20'), new Date('2026-08-05'))).toHaveLength(2);
    });

    it('un rango de un solo día toca un mes', () => {
        expect(mesesDelRango(new Date('2026-08-12'), new Date('2026-08-12'))).toHaveLength(1);
    });

    it('los límites del mes cubren desde el día 1 hasta el último', () => {
        const { inicio, fin } = limitesDelMes(new Date('2026-08-12'));
        expect(inicio.toISOString().slice(0, 10)).toBe('2026-08-01');
        expect(fin.toISOString().slice(0, 10)).toBe('2026-08-31');
    });
});

describe('calcularSeguridadSocial', () => {
    beforeEach(() => vi.clearAllMocks());

    it('CLAVE: cuota COMPLETA aunque el periodo sean tres días del mes', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([
            { id: 'c1', cuota_ss_mensual: 60, activo: true, updated_at: new Date('2026-01-01'), usuario: { nombre: 'Carlos' } },
        ]);

        const r = await calcularSeguridadSocial('cli-1', new Date('2026-08-10'), new Date('2026-08-12'));

        expect(r.total).toBe(60);
        expect(r.detalle[0]).toMatchObject({ nombre: 'Carlos', cuota_mensual: 60, meses: 1, total: 60 });
    });

    it('dos meses tocados, dos cuotas', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([
            { id: 'c1', cuota_ss_mensual: 60, activo: true, updated_at: new Date('2026-01-01'), usuario: { nombre: 'Carlos' } },
        ]);

        const r = await calcularSeguridadSocial('cli-1', new Date('2026-07-20'), new Date('2026-08-05'));

        expect(r.total).toBe(120);
        expect(r.detalle[0].meses).toBe(2);
    });

    it('varios asalariados: cada uno con SU cuota, no una del cliente', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([
            { id: 'c1', cuota_ss_mensual: 60, activo: true, updated_at: new Date('2026-01-01'), usuario: { nombre: 'Carlos' } },
            { id: 'c2', cuota_ss_mensual: 95.5, activo: true, updated_at: new Date('2026-01-01'), usuario: { nombre: 'Ana' } },
        ]);

        const r = await calcularSeguridadSocial('cli-1', new Date('2026-08-01'), new Date('2026-08-31'));

        expect(r.total).toBe(155.5);
        expect(r.detalle).toHaveLength(2);
    });

    it('sin asalariados con cuota puesta, no hay descuento', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([]);
        const r = await calcularSeguridadSocial('cli-1', new Date('2026-08-01'), new Date('2026-08-31'));
        expect(r.total).toBe(0);
        expect(r.detalle).toEqual([]);
    });

    it('un asalariado dado de baja antes del periodo no devenga', async () => {
        prismaMock.conductor.findMany.mockResolvedValue([
            { id: 'c1', cuota_ss_mensual: 60, activo: false, updated_at: new Date('2026-06-15'), usuario: { nombre: 'Antiguo' } },
        ]);
        const r = await calcularSeguridadSocial('cli-1', new Date('2026-08-01'), new Date('2026-08-31'));
        expect(r.total).toBe(0);
    });
});

describe('dónde cae el descuento en modo "parte"', () => {
    beforeEach(() => vi.clearAllMocks());

    it('el último parte del mes lo lleva entero', async () => {
        prismaMock.parteDiario.findFirst.mockResolvedValue(null); // no hay ninguno posterior
        expect(await esUltimoParteDelMes('c1', new Date('2026-08-31'))).toBe(true);
    });

    it('un parte con otro posterior en el mismo mes no lo lleva', async () => {
        prismaMock.parteDiario.findFirst.mockResolvedValue({ id: 'posterior' });
        expect(await esUltimoParteDelMes('c1', new Date('2026-08-10'))).toBe(false);
    });

    it('"último" se mide por fecha trabajada, dentro de ESE mes', async () => {
        prismaMock.parteDiario.findFirst.mockResolvedValue(null);
        await esUltimoParteDelMes('c1', new Date('2026-08-15'));

        const where = prismaMock.parteDiario.findFirst.mock.calls[0][0].where;
        expect(where.conductor_id).toBe('c1');
        // El límite superior es fin de mes: un parte de septiembre no cuenta
        // como "posterior" a efectos de la cuota de agosto.
        expect(where.fecha_trabajada.lte.toISOString().slice(0, 7)).toBe('2026-08');
    });
});

describe('modo de descuento', () => {
    it('por defecto es "cierre", y cualquier valor raro cae ahí', () => {
        expect(normalizarModo(null)).toBe('cierre');
        expect(normalizarModo('loquesea')).toBe('cierre');
        expect(normalizarModo('parte')).toBe('parte');
    });
});
