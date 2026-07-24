/**
 * Utilidades de contraseña — Fase 1 auditoría seguridad (2026-07-24).
 *
 * Antes de esta fase, minos.Users.password_hash contenia marcadores sin uso real
 * ('CONDUCTOR_NUEVO', 'ONBOARDING_INITIAL_STEP', 'ONBOARDING_ASALARIADO_INITIAL')
 * y el login autenticaba solo con el telefono. Estas constantes identifican esos
 * marcadores para permitir el flujo de "primera contraseña" sin aceptarlos jamas
 * como una contraseña valida.
 */
import bcrypt from 'bcrypt';

export const PLACEHOLDER_PASSWORD_HASHES = [
    'CONDUCTOR_NUEVO',
    'ONBOARDING_INITIAL_STEP',
    'ONBOARDING_ASALARIADO_INITIAL',
] as const;

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export function esPlaceholder(hash: string | null | undefined): boolean {
    if (!hash) return true;
    return (PLACEHOLDER_PASSWORD_HASHES as readonly string[]).includes(hash);
}

export function validarFortalezaPassword(password: string): { valid: boolean; error?: string } {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return { valid: false, error: `La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` };
    }
    return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compara una contrasena contra un hash. Nunca lanza si el hash almacenado no
 * es un bcrypt valido (p.ej. un marcador antiguo): en ese caso devuelve false.
 */
export async function verificarPassword(password: string, hash: string | null | undefined): Promise<boolean> {
    if (!password || !hash || esPlaceholder(hash)) return false;
    try {
        return await bcrypt.compare(password, hash);
    } catch {
        return false;
    }
}
