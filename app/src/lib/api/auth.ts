import { apiFetch } from './fetcher';
import type { LoginResponse, MeResponse } from '@/types';

/** POST /api/auth/login — Solo telefono, sin password */
export async function login(telefono: string): Promise<LoginResponse> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: { telefono },
    public: true,
  });
}

/** GET /api/auth/me — Usuario + vehiculos + conductores */
export async function getMe(): Promise<MeResponse> {
  return apiFetch('/api/auth/me');
}
