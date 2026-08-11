import { apiFetch } from './fetcher';
import type { ApiResponse, Anomalia } from '@/types';

export async function getAnomalias(conductorId?: string): Promise<ApiResponse<Anomalia[]>> {
  const qs = conductorId ? `?conductor_id=${conductorId}` : '';
  return apiFetch(`/api/anomalias${qs}`);
}

/**
 * El patrón marca que ya ha visto/hablado esta anomalía (2026-08-11). El
 * WhatsApp puede no llegar o pasar desapercibido — la anomalía se queda en
 * rojo en el panel hasta que él, explícitamente, la marca como revisada.
 */
export async function marcarAnomaliaRevisada(id: string): Promise<ApiResponse<Anomalia>> {
  return apiFetch(`/api/anomalias/${id}/revisar`, { method: 'POST' });
}
