import { apiFetch } from './fetcher';
import type { ApiResponse } from '@/types';

/**
 * Conexión con el Drive DEL CLIENTE. Los documentos van a su cuenta de
 * Google, no a una nuestra: él los ve en su Drive y los comparte con quien
 * quiera (la gestoría, por ejemplo) sin pedirnos nada.
 */
export interface EstadoDrive {
  /** false = la función no está habilitada en este entorno todavía. */
  disponible: boolean;
  conectado: boolean;
  email?: string | null;
  conectado_at?: string | null;
  ultimo_error?: string | null;
}

export async function getEstadoDrive(): Promise<ApiResponse<EstadoDrive>> {
  return apiFetch('/api/drive/estado');
}

/** Devuelve la URL de Google a la que hay que mandar al usuario. */
export async function conectarDrive(): Promise<{ status: string; authUrl?: string; message?: string }> {
  return apiFetch('/api/drive/conectar', { method: 'POST', body: {} });
}

export async function desconectarDrive(): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/drive/desconectar', { method: 'POST', body: {} });
}
