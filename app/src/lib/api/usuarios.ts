import { apiFetch } from './fetcher';
import type { Conductor, ApiResponse } from '@/types';

interface CreateConductorInput {
  nombre?: string;
  telefono?: string;
  email?: string;
  vehiculo_id?: string;
  porcentaje_conductor?: number;
  modelo_reparto?: string;
}

interface UpdateConductorInput {
  nombre?: string;
  telefono?: string;
  activo?: boolean;
}

export async function getUsuarios(): Promise<ApiResponse<Conductor[]>> {
  return apiFetch('/api/usuarios');
}

export async function createConductor(data: CreateConductorInput): Promise<ApiResponse<Conductor>> {
  return apiFetch('/api/usuarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateConductor(id: string, data: UpdateConductorInput): Promise<ApiResponse<Conductor>> {
  return apiFetch(`/api/usuarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
