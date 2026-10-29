import { apiFetch } from './fetcher';
import type { Conductor, ApiResponse } from '@/types';

export type ModeloReparto = 'PORCENTAJE' | 'FIJO_DIARIO';

export interface CreateConductorInput {
  nombre: string;
  telefono: string;
  /** Suyo de verdad: ahí recibe el código para activar su cuenta. */
  email: string;
  vehiculo_id?: string;
  /** Porcentaje del conductor, o euros al día si el modelo es FIJO_DIARIO. */
  porcentaje_conductor: number;
  modelo_reparto: ModeloReparto;
}

export interface UpdateConductorInput {
  /** Nombre y teléfono solo se pueden corregir antes de que active la cuenta. */
  nombre?: string;
  telefono?: string;
  activo?: boolean;
  modelo_reparto?: ModeloReparto;
  porcentaje_conductor?: number;
  /** Cuota mensual de la Seguridad Social; '' o null la quita. */
  cuota_ss_mensual?: number | string | null;
}

/**
 * `incluirInactivos` trae también a los conductores que se quitaron (no se
 * borran: conservan su historial), para poder reactivarlos.
 */
export async function getUsuarios(opciones?: { incluirInactivos?: boolean }): Promise<ApiResponse<Conductor[]>> {
  return apiFetch(`/api/usuarios${opciones?.incluirInactivos ? '?incluir_inactivos=1' : ''}`);
}

// OJO: `apiFetch` ya hace JSON.stringify del cuerpo. Pasarle un cuerpo ya
// serializado lo codifica dos veces y el servidor responde 400 (era el motivo
// de que crear, editar o quitar un conductor desde Flota no funcionara nunca).
export async function createConductor(data: CreateConductorInput): Promise<ApiResponse<Conductor>> {
  return apiFetch('/api/usuarios', {
    method: 'POST',
    body: data,
  });
}

export async function updateConductor(id: string, data: UpdateConductorInput): Promise<ApiResponse<Conductor>> {
  return apiFetch(`/api/usuarios/${id}`, {
    method: 'PATCH',
    body: data,
  });
}
