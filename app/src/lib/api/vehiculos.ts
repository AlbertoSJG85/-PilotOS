import { apiFetch } from './fetcher';
import type { ApiResponse, Vehiculo } from '@/types';

export async function getVehiculos(): Promise<ApiResponse<Vehiculo[]>> {
  return apiFetch('/api/vehiculos');
}

export async function getVehiculo(id: string): Promise<ApiResponse<Vehiculo>> {
  return apiFetch(`/api/vehiculos/${id}`);
}

export async function createVehiculo(data: Partial<Vehiculo>): Promise<ApiResponse<Vehiculo>> {
  return apiFetch('/api/vehiculos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateVehiculo(id: string, data: Partial<Vehiculo>): Promise<ApiResponse<Vehiculo>> {
  return apiFetch(`/api/vehiculos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function assignVehiculoConductor(vehiculo_id: string, conductor_ids: string[]): Promise<ApiResponse<void>> {
  return apiFetch(`/api/vehiculos/${vehiculo_id}/conductores`, {
    method: 'POST',
    body: JSON.stringify({ conductor_ids }),
  });
}
