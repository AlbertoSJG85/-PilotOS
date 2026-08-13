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

export async function updateMantenimientoVehiculo(id: string, data: Partial<MantenimientoVehiculo>): Promise<ApiResponse<MantenimientoVehiculo>> {
  return apiFetch(`/api/mantenimientos/${id}`, { method: 'PUT', body: data });
}

// 2026-08-13: el catálogo global es el mismo para todos, pero el papeleo del
// taxi varía por ayuntamiento. Esto crea un mantenimiento SOLO para el
// cliente autenticado y lo engancha al vehículo indicado — no aparece para
// nadie más. Para quitar uno que no aplica, usa updateMantenimientoVehiculo
// con { activo: false } sobre el mantenimiento del vehículo (global o propio).
export async function crearMantenimientoPersonalizado(vehiculoId: string, data: {
  nombre: string;
  tipo: 'POR_KILOMETRAJE' | 'POR_FECHA' | 'SEGUN_USO';
  frecuencia_km?: number;
  frecuencia_meses?: number;
}): Promise<ApiResponse<MantenimientoVehiculo>> {
  return apiFetch(`/api/mantenimientos/vehiculo/${vehiculoId}/personalizado`, { method: 'POST', body: data });
}
