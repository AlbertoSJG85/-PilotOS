/**
 * Cliente HTTP base para PilotOS Backend.
 * Inyecta JWT automáticamente desde localStorage.
 * No contiene lógica de negocio — solo transporte.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Si true, no inyecta Authorization header */
  public?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message || code);
    this.name = 'ApiError';
  }
}

/** Limpia sesión y redirige a login. Solo en browser. */
function handleUnauthorized(): never {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pilotos_token');
    localStorage.removeItem('pilotos_user');
    document.cookie = 'pilotos_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'pilotos_es_patron=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/login';
  }
  throw new ApiError(401, 'unauthorized', 'Sesión expirada. Inicia sesión de nuevo.');
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { body, public: isPublic, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (!isPublic && typeof window !== 'undefined') {
    const token = localStorage.getItem('pilotos_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Token expirado o inválido → limpiar sesión y redirigir a login
  if (res.status === 401) {
    handleUnauthorized();
  }

  const json = await res.json().catch(() => ({ status: 'FAIL', error: 'invalid_response' }));

  if (!res.ok || json.status === 'FAIL') {
    throw new ApiError(res.status, json.error || 'unknown_error', json.message);
  }

  return json as T;
}
