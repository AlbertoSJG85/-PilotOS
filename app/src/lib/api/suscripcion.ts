import { apiFetch } from './fetcher';
import type { ApiResponse } from '@/types';

/** Estado de la contratación del patrón, tal como lo cuenta NexOS Pay. */
export interface EstadoSuscripcion {
  /** false = Pay no responde o no está activo en este entorno. */
  disponible: boolean;
  /** sin_contratar | prueba | pendiente_metodo_pago | preparada | activa | expirada | anulada */
  estado: string;
  pruebaFinAt?: string | null;
  inicioPagoAt?: string | null;
  tarjeta?: { marca: string | null; ultimos4: string | null } | null;
}

export async function getEstadoSuscripcion(): Promise<ApiResponse<EstadoSuscripcion>> {
  return apiFetch('/api/suscripcion');
}

/** Devuelve la URL de la página «Contratar» de NexOS Pay. */
export async function contratarSuscripcion(): Promise<{ status: string; url?: string; message?: string }> {
  return apiFetch('/api/suscripcion/contratar', { method: 'POST', body: {} });
}
