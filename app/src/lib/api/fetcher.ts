/**
 * Cliente HTTP base para PilotOS Backend.
 *
 * PIL-04: ya no inyecta ningún JWT. La sesión va en una cookie `HttpOnly` que
 * este código no puede leer y que el navegador manda sola — solo hay que
 * pedirlo con `credentials: 'include'`. No contiene lógica de negocio, solo
 * transporte.
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
    public details?: unknown,
  ) {
    super(message || code);
    this.name = 'ApiError';
  }
}

/**
 * Limpia sesión y redirige a login. Solo en browser.
 *
 * No se llama a `/api/auth/logout`: si estamos aquí es porque el servidor ya ha
 * dicho que la sesión no vale, así que no hay nada que cerrar y la llamada
 * respondería otro 401. Solo se limpia lo local; la cookie caduca sola.
 */
function handleUnauthorized(): never {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pilotos_user');
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

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers,
    // La cookie de sesión solo viaja si se pide. `include` y no `same-origin`
    // porque en desarrollo la app (3000) y el backend (3001) son orígenes
    // distintos; en producción `NEXT_PUBLIC_API_URL` va vacía y todo pasa por
    // el proxy de Next, así que es el mismo origen. `include` cubre los dos.
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  // Token expirado o inválido → limpiar sesión y redirigir a login
  if (res.status === 401) {
    handleUnauthorized();
  }

  const json = await res.json().catch(() => ({ status: 'FAIL', error: 'invalid_response' }));

  if (!res.ok || json.status === 'FAIL') {
    throw new ApiError(res.status, json.error || 'unknown_error', json.message, json);
  }

  return json as T;
}
