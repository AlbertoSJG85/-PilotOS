/**
 * Gestión de sesión client-side.
 * La sesión real vive en el backend (JWT). Esto es solo caché local.
 */

const TOKEN_KEY = 'pilotos_token';
const USER_KEY = 'pilotos_user';

export interface SessionUser {
  id: number;
  nombre: string;
  telefono: string;
  role: string;
  cliente_id: string | null;
  conductor_id: string | null;
  es_patron: boolean;
  /** True si el cliente tiene ≥1 conductor asalariado activo. */
  tiene_asalariados: boolean;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // Cookie para Next.js Middleware — el rol se extrae del payload JWT, no de cookie separada.
  //
  // PIL-03: 7 dias, los mismos que dura el token. Antes la cookie decia 30 dias
  // y el token tambien: un mes de sesion que nadie podia cortar. Si la cookie
  // sobreviviera al token, el middleware dejaria pasar a paginas que la API
  // luego rechaza, y el usuario veria pantallas rotas en vez de un login.
  const maxAge = 60 * 60 * 24 * 7;
  const seguro = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `pilotos_token=${token}; path=/; max-age=${maxAge}; samesite=lax${seguro}`;
}

/**
 * Cierra la sesion.
 *
 * PIL-03: avisa al servidor ANTES de borrar nada en local. Antes esto solo
 * vaciaba `localStorage`: si alguien habia copiado el token, seguia sirviendo
 * hasta un mes. Ahora el servidor corta todas las sesiones del usuario.
 *
 * Si la llamada falla —sin red, servidor caido— se limpia igualmente en local:
 * dejar la sesion abierta en un movil que el usuario acaba de cerrar seria peor
 * que no avisar al servidor. Queda anotado en consola.
 */
export async function clearSession(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.warn('[auth] No se pudo avisar al servidor del cierre de sesion:', error);
    }
  }

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  document.cookie = 'pilotos_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
