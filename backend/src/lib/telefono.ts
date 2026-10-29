/**
 * Teléfonos (2026-10-29).
 *
 * El teléfono es la clave de entrada de todo PilotOS: el login es por teléfono
 * y GlorIA reconoce a quien le escribe por el número de WhatsApp, que llega
 * como `34600123456`. Hasta hoy solo se aceptaba el mismo número con o sin "+";
 * si alguien se daba de alta escribiendo «600 12 34 56» (con espacios, o sin el
 * 34), después no lo reconocían ni el login ni GlorIA, y no había forma de
 * saber por qué.
 *
 * Dos funciones, con papeles distintos:
 *   · `normalizarTelefono` — la forma en que se GUARDA un número nuevo: solo
 *     cifras, sin "+" ni "00", y con el 34 delante si es un número español de
 *     9 cifras.
 *   · `variantesTelefono` — todas las formas en que ese mismo número puede
 *     estar escrito en la base de datos. Se usa para BUSCAR. Hay cuentas
 *     antiguas guardadas con 9 cifras o con "+34"; no se tocan, se reconocen.
 */

/** Solo cifras: sin espacios, puntos, guiones, paréntesis, "+" ni "00" inicial. */
export function normalizarTelefono(raw: string | null | undefined): string {
    let t = String(raw ?? '').trim().replace(/[^\d+]/g, '');
    t = t.replace(/^\+/, '').replace(/^00/, '').replace(/\D/g, '');
    // Móvil o fijo español sin prefijo: 9 cifras que empiezan por 6, 7, 8 o 9.
    if (/^[6-9]\d{8}$/.test(t)) t = '34' + t;
    return t;
}

/** ¿Tiene pinta de teléfono? (9 a 15 cifras ya normalizado). */
export function esTelefonoValido(raw: string | null | undefined): boolean {
    return /^\d{9,15}$/.test(normalizarTelefono(raw));
}

/** Todas las formas equivalentes de un número, para buscarlo en la base de datos. */
export function variantesTelefono(raw: string | null | undefined): string[] {
    const original = String(raw ?? '').trim();
    const canon = normalizarTelefono(original);
    const formas = new Set<string>();
    if (original) formas.add(original);
    if (canon) {
        formas.add(canon);
        formas.add('+' + canon);
        // Número español guardado sin el 34 (cuentas antiguas).
        if (/^34[6-9]\d{8}$/.test(canon)) formas.add(canon.slice(2));
    }
    return [...formas];
}
