import { apiFetch } from './fetcher';

export interface VincularFotoResponse {
  status: string;
  data: { id: string; estado: string; tipo: string };
  legible: boolean;
  duplicado?: boolean;
  motivo?: string;
}

/**
 * POST /api/fotos — Vincular foto a parte con OCR.
 * Devuelve `legible` (false si el OCR no la entendió) y `duplicado` (si reutilizó documento existente).
 */
export async function vincularFoto(data: {
  parte_diario_id: string;
  tipo: 'TICKET_TAXIMETRO' | 'TICKET_GASOIL' | 'TICKET_COMBUSTIBLE';
  url: string;
  hash_sha256?: string | null;
}): Promise<VincularFotoResponse> {
  return apiFetch('/api/fotos', { method: 'POST', body: data });
}
