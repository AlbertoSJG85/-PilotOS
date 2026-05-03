import { apiFetch } from './fetcher';
import type { ApiResponse } from '@/types';

// Ojo: los tipos exactos pueden variar, usar any temporalmente o Partial<type> si existe
export async function getUsuarios(): Promise<ApiResponse<any[]>> {
  return apiFetch('/api/usuarios');
}

export async function createConductor(data: any): Promise<ApiResponse<any>> {
  return apiFetch('/api/usuarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateConductor(id: string, data: any): Promise<ApiResponse<any>> {
  return apiFetch(`/api/usuarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
