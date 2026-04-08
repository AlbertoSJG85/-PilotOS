import { apiFetch } from './fetcher';
import type { ApiResponse, Onboarding } from '@/types';

/** POST /api/onboarding — Guardar datos de onboarding (upsert por telefono) */
export async function guardarOnboarding(data: Partial<Onboarding> & { telefono: string }): Promise<ApiResponse<Onboarding>> {
  return apiFetch('/api/onboarding', { method: 'POST', body: data, public: true });
}

/** POST /api/onboarding/:telefono/completar — Crear todas las entidades */
export async function completarOnboarding(telefono: string): Promise<ApiResponse<{
  cliente_id: string;
  patron_id: number;
  vehiculo_id: string;
  conductor_asalariado_id: string | null;
}>> {
  return apiFetch(`/api/onboarding/${telefono}/completar`, { method: 'POST', public: true });
}

/** GET /api/onboarding/:telefono — Obtener estado de onboarding */
export async function getOnboarding(telefono: string): Promise<ApiResponse<Onboarding>> {
  return apiFetch(`/api/onboarding/${telefono}`, { public: true });
}
