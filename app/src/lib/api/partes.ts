import { apiFetch } from './fetcher';
import type { ApiResponse, ParteDiario } from '@/types';

interface PartesFilters {
  vehiculo_id?: string;
  conductor_id?: string;
  desde?: string;
  hasta?: string;
}

export async function getPartes(filters?: PartesFilters): Promise<ApiResponse<ParteDiario[]>> {
  const params = new URLSearchParams();
  if (filters?.vehiculo_id) params.set('vehiculo_id', filters.vehiculo_id);
  if (filters?.conductor_id) params.set('conductor_id', filters.conductor_id);
  if (filters?.desde) params.set('desde', filters.desde);
  if (filters?.hasta) params.set('hasta', filters.hasta);
  const qs = params.toString();
  return apiFetch(`/api/partes${qs ? `?${qs}` : ''}`);
}

export async function getParte(id: string): Promise<ApiResponse<ParteDiario>> {
  return apiFetch(`/api/partes/${id}`);
}

/** POST /api/partes — Contrato real del backend */
export async function crearParte(data: {
  vehiculo_id: string;
  conductor_id: string;
  fecha_trabajada: string;
  km_inicio: number;
  km_fin: number;
  ingreso_bruto: number;
  ingreso_datafono: number;
  combustible?: number;
  varios?: number;
  concepto_varios?: string;
}): Promise<ApiResponse<ParteDiario>> {
  return apiFetch('/api/partes', { method: 'POST', body: data });
}
