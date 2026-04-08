import { apiFetch } from './fetcher';
import type { ApiResponse, MantenimientoVehiculo } from '@/types';

export async function getMantenimientosVehiculo(vehiculoId: string): Promise<ApiResponse<MantenimientoVehiculo[]>> {
  return apiFetch(`/api/mantenimientos/vehiculo/${vehiculoId}`);
}

export async function getMantenimientosProximos(vehiculoId: string): Promise<ApiResponse<MantenimientoVehiculo[]> & { km_actuales?: number }> {
  return apiFetch(`/api/mantenimientos/vehiculo/${vehiculoId}/proximos`);
}

export async function resolverMantenimiento(id: string, data: {
  km_ejecucion?: number;
  fecha_factura?: string;
  url_factura?: string;
  importe?: number;
}): Promise<ApiResponse<MantenimientoVehiculo>> {
  return apiFetch(`/api/mantenimientos/${id}/resolver`, { method: 'POST', body: data });
}
