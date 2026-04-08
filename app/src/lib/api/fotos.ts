import { apiFetch } from './fetcher';

/** POST /api/fotos — Vincular foto a parte con OCR */
export async function vincularFoto(data: {
  parte_diario_id: string;
  tipo: 'TICKET_TAXIMETRO' | 'TICKET_GASOIL';
  url: string;
}): Promise<{ status: string; data: unknown; legible: boolean }> {
  return apiFetch('/api/fotos', { method: 'POST', body: data });
}
