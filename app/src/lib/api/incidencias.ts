import { apiFetch } from './fetcher';
import type { ApiResponse, Incidencia } from '@/types';

export async function getIncidencias(): Promise<ApiResponse<Incidencia[]>> {
  return apiFetch('/api/incidencias');
}

export async function cerrarIncidencia(id: string): Promise<ApiResponse<Incidencia>> {
  return apiFetch(`/api/incidencias/${id}/cerrar`, { method: 'PATCH' });
}
