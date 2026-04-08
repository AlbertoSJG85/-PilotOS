import { apiFetch } from './fetcher';
import type { ApiResponse, Gasto, GastoFijo, GastosResponse, GastosResumenResponse } from '@/types';

interface GastosFilters {
  vehiculo_id?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
}

export async function getGastos(filters?: GastosFilters): Promise<GastosResponse> {
  const params = new URLSearchParams();
  if (filters?.vehiculo_id) params.set('vehiculo_id', filters.vehiculo_id);
  if (filters?.tipo) params.set('tipo', filters.tipo);
  if (filters?.desde) params.set('desde', filters.desde);
  if (filters?.hasta) params.set('hasta', filters.hasta);
  const qs = params.toString();
  return apiFetch(`/api/gastos${qs ? `?${qs}` : ''}`);
}

export async function getGastosResumen(): Promise<GastosResumenResponse> {
  return apiFetch('/api/gastos/resumen');
}

export async function getGastosFijos(): Promise<ApiResponse<GastoFijo[]>> {
  return apiFetch('/api/gastos/fijos');
}

export async function crearGasto(data: {
  vehiculo_id?: string;
  tipo: string;
  descripcion: string;
  importe: number;
  fecha: string;
  forma_pago?: string;
  url_factura?: string;
}): Promise<ApiResponse<Gasto>> {
  return apiFetch('/api/gastos', { method: 'POST', body: data });
}
