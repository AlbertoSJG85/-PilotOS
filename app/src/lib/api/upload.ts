import { ApiError } from './fetcher';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface UploadResult {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  hash_sha256: string | null;
}

/**
 * POST /api/upload — Subir foto (multipart/form-data).
 * Convierte códigos HTTP comunes en mensajes específicos para el usuario.
 */
export async function uploadFoto(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('foto', file);

  const token = typeof window !== 'undefined' ? localStorage.getItem('pilotos_token') : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (e) {
    throw new ApiError(0, 'network_error', 'Sin conexión, reintenta cuando vuelvas.');
  }

  if (res.status === 413) {
    throw new ApiError(413, 'file_too_large', 'El archivo supera 5 MB. Reduce la imagen e inténtalo de nuevo.');
  }
  if (res.status === 415) {
    throw new ApiError(415, 'invalid_mime', 'Formato no soportado. Usa JPG o PNG.');
  }
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pilotos_token');
      window.location.href = '/login';
    }
    throw new ApiError(401, 'unauthorized', 'Sesión expirada. Inicia sesión de nuevo.');
  }
  if (!res.ok) {
    let msg = 'Error del servidor al subir la foto. Reintenta.';
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, 'upload_failed', msg);
  }

  return res.json();
}
