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

interface CrearParteInput {
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
  /** Si true, se crea/actualiza como BORRADOR (asalariado, antes de subir fotos). */
  borrador?: boolean;
}

/** POST /api/partes — Crea ENVIADO directo, o BORRADOR si borrador:true. */
export async function crearParte(data: CrearParteInput): Promise<ApiResponse<ParteDiario>> {
  return apiFetch('/api/partes', { method: 'POST', body: data });
}

/** PATCH /api/partes/:id/confirmar — Asalariado confirma BORRADOR. Backend valida fotos. */
export async function confirmarParte(id: string): Promise<ApiResponse<ParteDiario>> {
  return apiFetch(`/api/partes/${id}/confirmar`, { method: 'PATCH', body: {} });
}

/** GET /api/partes/borrador/actual — Devuelve BORRADOR del usuario para vehículo+fecha si existe. */
export async function getBorradorActual(vehiculo_id: string, fecha: string): Promise<ApiResponse<ParteDiario | null>> {
  const params = new URLSearchParams({ vehiculo_id, fecha });
  return apiFetch(`/api/partes/borrador/actual?${params.toString()}`);
}

/** DELETE /api/partes/:id — Solo permitido si estado BORRADOR. */
export async function descartarBorrador(id: string): Promise<{ status: string }> {
  return apiFetch(`/api/partes/${id}`, { method: 'DELETE' });
}
