const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** POST /api/upload — Subir foto (multipart/form-data) */
export async function uploadFoto(file: File): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  formData.append('foto', file);

  const token = typeof window !== 'undefined' ? localStorage.getItem('pilotos_token') : null;

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error('Error subiendo foto');
  return res.json();
}
