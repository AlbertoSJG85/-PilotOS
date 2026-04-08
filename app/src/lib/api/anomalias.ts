import { apiFetch } from './fetcher';
import type { ApiResponse, Anomalia } from '@/types';

export async function getAnomalias(conductorId?: string): Promise<ApiResponse<Anomalia[]>> {
  const qs = conductorId ? `?conductor_id=${conductorId}` : '';
  return apiFetch(`/api/anomalias${qs}`);
}
