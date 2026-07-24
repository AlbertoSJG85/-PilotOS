/**
 * Tests de humo — Fase 1 (auth real con bcrypt).
 *
 * Cubren la logica pura de src/lib/password.ts, sin base de datos:
 *  - las cuentas con marcador antiguo nunca se aceptan como contrasena valida;
 *  - hash + verificacion redondean correctamente con bcrypt real;
 *  - la validacion de fortaleza rechaza contrasenas cortas.
 */
import { describe, it, expect } from 'vitest';
import {
    esPlaceholder,
    hashPassword,
    validarFortalezaPassword,
    verificarPassword,
    PLACEHOLDER_PASSWORD_HASHES,
} from '../src/lib/password';

describe('esPlaceholder', () => {
    it('reconoce los tres marcadores historicos', () => {
        for (const marcador of PLACEHOLDER_PASSWORD_HASHES) {
            expect(esPlaceholder(marcador)).toBe(true);
        }
    });

    it('null/undefined cuentan como placeholder (cuenta sin contrasena)', () => {
        expect(esPlaceholder(null)).toBe(true);
        expect(esPlaceholder(undefined)).toBe(true);
    });

    it('un hash bcrypt real no es un placeholder', async () => {
        const hash = await hashPassword('unaContrasenaValida123');
        expect(esPlaceholder(hash)).toBe(false);
    });
});

describe('hashPassword / verificarPassword', () => {
    it('un hash se verifica con la misma contrasena', async () => {
        const hash = await hashPassword('miContrasenaSegura1');
        expect(await verificarPassword('miContrasenaSegura1', hash)).toBe(true);
    });

    it('una contrasena incorrecta no verifica', async () => {
        const hash = await hashPassword('miContrasenaSegura1');
        expect(await verificarPassword('otraContrasena', hash)).toBe(false);
    });

    it('CRITICO: un marcador antiguo NUNCA verifica como contrasena valida (no debe lanzar ni aceptar)', async () => {
        for (const marcador of PLACEHOLDER_PASSWORD_HASHES) {
            await expect(verificarPassword('cualquier_password', marcador)).resolves.toBe(false);
        }
    });

    it('hash/verify vacios o nulos no lanzan y devuelven false', async () => {
        expect(await verificarPassword('', 'algo')).toBe(false);
        expect(await verificarPassword('algo', null)).toBe(false);
        expect(await verificarPassword('algo', undefined)).toBe(false);
    });
});

describe('validarFortalezaPassword', () => {
    it('rechaza contrasenas de menos de 8 caracteres', () => {
        expect(validarFortalezaPassword('abc123').valid).toBe(false);
    });

    it('acepta contrasenas de 8 o mas caracteres', () => {
        expect(validarFortalezaPassword('abcdefgh').valid).toBe(true);
    });
});
