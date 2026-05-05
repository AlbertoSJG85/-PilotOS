import { apiFetch } from './fetcher';

export interface VincularFotoResponse {
  status: string;
  data: { id: string; estado: string; tipo: string };
  legible: boolean;
  duplicado?: boolean;
  motivo?: string;
}

/** POST /api/fotos — Vincular foto a parte con OCR. */
export async function vincularFoto(data: {
  parte_diario_id: string;
  tipo: 'TICKET_TAXIMETRO' | 'TICKET_GASOIL' | 'TICKET_COMBUSTIBLE';
  url: string;
  hash_sha256?: string | null;
}): Promise<VincularFotoResponse> {
  return apiFetch('/api/fotos', { method: 'POST', body: data });
}

/** POST /api/fotos/:id/reemplazar — Sustituir fichero físico (máx 2 veces). */
export async function reemplazarFoto(docId: string, data: {
  url: string;
  hash_sha256?: string | null;
}): Promise<VincularFotoResponse> {
  return apiFetch(`/api/fotos/${docId}/reemplazar`, { method: 'POST', body: data });
}

/** POST /api/fotos/:id/reintentar-ocr — Re-procesar OCR sin sustituir fichero. */
export async function reintentarOcr(docId: string): Promise<VincularFotoResponse> {
  return apiFetch(`/api/fotos/${docId}/reintentar-ocr`, { method: 'POST' });
}

/** DELETE /api/fotos/:id — Desvincular documento de un parte (solo BORRADOR). */
export async function eliminarFoto(docId: string, parteId: string): Promise<{ status: string }> {
  return apiFetch(`/api/fotos/${docId}`, { method: 'DELETE', body: { parte_id: parteId } });
}
