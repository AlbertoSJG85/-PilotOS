import { apiFetch } from './fetcher';
import type { ApiResponse } from '@/types';

/** Avisos dirigidos al conductor (decisiones del dueño sobre sus partes). */
export interface NotificacionConductor {
  id: string;
  tipo: 'REHACER_PARTE' | 'PARTE_ACEPTADO';
  titulo: string;
  mensaje: string;
  entidad_tipo?: string | null;
  entidad_id?: string | null;
  leida_at?: string | null;
  created_at: string;
}

export async function getNotificaciones(soloNoLeidas = false): Promise<ApiResponse<NotificacionConductor[]>> {
  return apiFetch(`/api/notificaciones${soloNoLeidas ? '?solo_no_leidas=true' : ''}`);
}

export async function marcarNotificacionLeida(id: string): Promise<{ status: string; marcadas?: number }> {
  return apiFetch(`/api/notificaciones/${id}/leer`, { method: 'POST', body: {} });
}
