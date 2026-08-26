/**
 * Gestión de sesión client-side.
 *
 * PIL-04 — aquí ya NO hay token.
 *
 * Antes el JWT se guardaba en `localStorage` y este fichero escribía además una
 * cookie con `document.cookie`, para que el middleware de Next pudiera leerla.
 * Las dos cosas son legibles por cualquier script del origen: `localStorage`
 * por definición, y una cookie escrita desde JavaScript no puede ser
 * `HttpOnly`. Un XSS, una dependencia comprometida o una extensión se llevaban
 * la sesión entera — y con la de un patrón van la flota, los partes y la
 * economía del tenant.
 *
 * Ahora la pone el servidor, `HttpOnly`, y este código no puede leerla. Lo
 * único que queda aquí es quién es el usuario, para pintar la interfaz: si
 * alguien lo manipula, verá menús que el backend le seguirá negando.
 */

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

/**
 * PIL-04: solo el usuario. La sesión llegó en la cookie `HttpOnly` que puso el
 * backend en la respuesta del login, y este código no la ve ni la escribe.
 *
 * La cookie que se escribía aquí a mano no podía ser `HttpOnly` —ninguna
 * escrita desde JavaScript puede serlo—, así que era una segunda copia del
 * token igual de expuesta que `localStorage`, y con su propia caducidad que
 * podía divergir de la del token.
 */
export function setSession(user: SessionUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
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
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    // PIL-04: la cookie va sola, pero solo si se pide. El servidor corta todas
    // las sesiones del usuario y retira la cookie de este dispositivo.
    await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.warn('[auth] No se pudo avisar al servidor del cierre de sesion:', error);
  }

  localStorage.removeItem(USER_KEY);
}

/**
 * Pista, no autoridad. La sesión vive en una cookie que este código no puede
 * leer, así que lo único disponible aquí es si hay usuario pintado. Sirve para
 * decidir a qué pantalla llevar a alguien; quién entra lo decide el backend en
 * cada petición, y el middleware de Next lee la cookie en el servidor.
 */
export function isAuthenticated(): boolean {
  return !!getSessionUser();
}
