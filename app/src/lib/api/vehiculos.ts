import { apiFetch } from './fetcher';
import type { ApiResponse, Vehiculo } from '@/types';

export async function getVehiculos(): Promise<ApiResponse<Vehiculo[]>> {
  return apiFetch('/api/vehiculos');
}

export async function getVehiculo(id: string): Promise<ApiResponse<Vehiculo>> {
  return apiFetch(`/api/vehiculos/${id}`);
}
