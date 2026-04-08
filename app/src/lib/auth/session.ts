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

  // Set cookies for Next.js Middleware (Server-Side checking)
  // Max-age: 7 days
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `pilotos_token=${token}; path=/; max-age=${maxAge}; samesite=lax`;
  document.cookie = `pilotos_es_patron=${user.es_patron.toString()}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  document.cookie = "pilotos_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = "pilotos_es_patron=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
