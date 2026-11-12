import { apiFetch } from './fetcher';
import type { ApiResponse } from '@/types';

export interface FotoEnRevision {
  id: string;
  tipo: string;
  url: string;
  created_at: string;
  parte_id: string;
  fecha_trabajada: string;
  matricula: string | null;
  conductor: string | null;
}

export interface AvisoSinVer {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  created_at: string;
  enviado: boolean;
  error_envio: string | null;
}

export interface Revisiones {
  fotos: FotoEnRevision[];
  avisos: AvisoSinVer[];
}

/** Todo lo que espera una decisión del patrón (2026-11-12). */
export async function getRevisiones(): Promise<ApiResponse<Revisiones>> {
  return apiFetch('/api/revisiones');
}

/** VERIFICADA → la foto vale. NO_VERIFICADA → pasa a ilegible y se le pide al asalariado otra. */
export async function verificarFoto(id: string, resultado: 'VERIFICADA' | 'NO_VERIFICADA'): Promise<ApiResponse<{ estado: string }>> {
  return apiFetch(`/api/revisiones/fotos/${id}`, { method: 'POST', body: { resultado } });
}

export async function marcarAvisoVisto(id: string): Promise<ApiResponse<{ marcados: number }>> {
  return apiFetch(`/api/revisiones/avisos/${id}/visto`, { method: 'POST' });
}
