/**
 * Un documento confirmado desde Gastos (2026-10-29): el tipo de gasto y la
 * forma de pago los elige una persona, así que solo pasan los valores
 * conocidos.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

import { sanearExtrasGasto } from '../src/services/aplicarDocumento.service';

describe('sanearExtrasGasto', () => {
    it('deja pasar tipo, forma de pago y descripción válidos', () => {
        expect(sanearExtrasGasto({ tipo_gasto: 'OTRO', forma_pago: 'TARJETA', descripcion: '  Espejo retrovisor ' }))
            .toEqual({ tipo_gasto: 'OTRO', forma_pago: 'TARJETA', descripcion: 'Espejo retrovisor' });
    });

    it('descarta valores desconocidos y lo que no es texto', () => {
        expect(sanearExtrasGasto({ tipo_gasto: 'LO_QUE_SEA', forma_pago: 7, descripcion: '   ', importe: 1 })).toEqual({});
        expect(sanearExtrasGasto(undefined)).toEqual({});
    });

    it('recorta descripciones enormes', () => {
        expect(sanearExtrasGasto({ descripcion: 'x'.repeat(500) }).descripcion).toHaveLength(200);
    });
});
