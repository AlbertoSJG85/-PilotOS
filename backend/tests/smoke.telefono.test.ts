/**
 * Teléfonos: cómo se guardan y cómo se buscan (2026-10-29).
 *
 * El caso que lo motivó: alguien se da de alta escribiendo «600 12 34 56» y
 * luego ni el login ni GlorIA (que recibe 34600123456 de WhatsApp) la
 * reconocen. Y el caso contrario, que no se puede romper: en producción hay
 * cuentas guardadas con 9 cifras y con "+34"; tienen que seguir entrando.
 */
import { describe, it, expect } from 'vitest';
import { normalizarTelefono, variantesTelefono, esTelefonoValido } from '../src/lib/telefono';

describe('normalizarTelefono — cómo se guarda un número nuevo', () => {
    it.each([
        ['600 12 34 56', '34600123456'],
        ['600123456', '34600123456'],
        ['+34 600 12 34 56', '34600123456'],
        ['0034600123456', '34600123456'],
        ['(34) 600-123-456', '34600123456'],
        ['34600123456', '34600123456'],
        ['  922 51 42 33 ', '34922514233'],
    ])('%s → %s', (entrada, esperado) => {
        expect(normalizarTelefono(entrada)).toBe(esperado);
    });

    it('un número extranjero no se toca (solo se limpia)', () => {
        expect(normalizarTelefono('+44 7700 900123')).toBe('447700900123');
    });

    it('vacío o basura no revienta', () => {
        expect(normalizarTelefono('')).toBe('');
        expect(normalizarTelefono(null)).toBe('');
        expect(normalizarTelefono(undefined)).toBe('');
        expect(normalizarTelefono('hola')).toBe('');
    });
});

describe('esTelefonoValido', () => {
    it('acepta lo escrito de cualquier forma razonable', () => {
        expect(esTelefonoValido('600 12 34 56')).toBe(true);
        expect(esTelefonoValido('+34600123456')).toBe(true);
    });

    it('rechaza lo que no puede ser un teléfono', () => {
        expect(esTelefonoValido('12345')).toBe(false);
        expect(esTelefonoValido('mi movil')).toBe(false);
        expect(esTelefonoValido('')).toBe(false);
    });
});

describe('variantesTelefono — cómo se busca (todas las formas guardadas)', () => {
    it('WhatsApp manda 34600123456: reconoce las cuentas guardadas de cualquier forma', () => {
        const v = variantesTelefono('34600123456');
        expect(v).toEqual(expect.arrayContaining(['34600123456', '+34600123456', '600123456']));
    });

    it('quien escribe «600 12 34 56» en el login encuentra la cuenta guardada como 34600123456', () => {
        expect(variantesTelefono('600 12 34 56')).toContain('34600123456');
    });

    it('una cuenta antigua guardada con 9 cifras se sigue encontrando desde el 34', () => {
        expect(variantesTelefono('+34600123456')).toContain('600123456');
    });

    it('conserva lo escrito tal cual (por si la cuenta se guardó así)', () => {
        expect(variantesTelefono('600 12 34 56')).toContain('600 12 34 56');
    });

    it('no mezcla números distintos', () => {
        expect(variantesTelefono('34600123456')).not.toContain('600123457');
    });
});
