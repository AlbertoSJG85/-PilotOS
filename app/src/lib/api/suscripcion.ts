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

/** Acceso a PilotOS según NexOS Pay (ADR-0020): cuenta atrás de la prueba y bloqueo. */
export interface EstadoAcceso {
  /** false = Pay no responde o no exige contratación: la app no enseña nada. */
  disponible: boolean;
  esPatron?: boolean;
  bloqueado?: boolean;
  motivo?: string | null;
  pruebaFinAt?: string | null;
  diasRestantes?: number | null;
  /** Quedan 5 días o menos y no ha contratado. */
  cuentaAtras?: boolean;
  contratada?: boolean;
  /** Solo para el patrón: sin_contratar | prueba | pendiente_metodo_pago | preparada | activa | expirada | anulada */
  estadoContratacion?: string | null;
  /** Tarifa con suplemento por asalariado y por vehículo adicional. */
  cobraExtras?: boolean;
  /** La prueba gratuita no ha terminado (no se cobra nada todavía). */
  enPrueba?: boolean;
}

export async function getEstadoAcceso(): Promise<ApiResponse<EstadoAcceso>> {
  return apiFetch('/api/suscripcion/acceso');
}
