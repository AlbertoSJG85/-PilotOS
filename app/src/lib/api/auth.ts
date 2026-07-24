import { apiFetch } from './fetcher';
import type { LoginResponse, MeResponse } from '@/types';

/** POST /api/auth/login — Telefono + contrasena (Fase 1 seguridad, 2026-07-24) */
export async function login(telefono: string, password: string): Promise<LoginResponse> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: { telefono, password },
    public: true,
  });
}

/**
 * POST /api/auth/establecer-password — Fija la primera contrasena de una cuenta
 * que todavia tiene el marcador placeholder. Inicia sesion automaticamente.
 */
export async function establecerPassword(telefono: string, password: string): Promise<LoginResponse> {
  return apiFetch('/api/auth/establecer-password', {
    method: 'POST',
    body: { telefono, password },
    public: true,
  });
}

/** POST /api/auth/cambiar-password — Cambia la contrasena de la cuenta autenticada */
export async function cambiarPassword(passwordActual: string, passwordNueva: string): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/auth/cambiar-password', {
    method: 'POST',
    body: { password_actual: passwordActual, password_nueva: passwordNueva },
  });
}

/** GET /api/auth/me — Usuario + vehiculos + conductores */
export async function getMe(): Promise<MeResponse> {
  return apiFetch('/api/auth/me');
}
