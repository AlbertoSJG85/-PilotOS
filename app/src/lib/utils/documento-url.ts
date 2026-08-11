/**
 * Convierte la URL guardada de un documento en una ruta del MISMO origen.
 *
 * Por qué hace falta (2026-08-11): el backend guarda las fotos con URL
 * absoluta hacia `api.pilotos.nexostudios.digital` (construida con su
 * `PUBLIC_BASE_URL`). Pero `/uploads` está protegido: exige el token, y lo
 * acepta por cabecera `Authorization` o por la cookie `pilotos_token`.
 *
 * Una etiqueta `<img src="...">` del navegador **no manda cabeceras**, solo
 * cookies. Y la cookie se pone en `pilotos.nexostudios.digital`, que es un
 * host distinto de `api.pilotos.nexostudios.digital`, así que tampoco viaja.
 * Resultado: 401 y la imagen no se ve nunca.
 *
 * `next.config.ts` ya proxea `/uploads/:path*` al backend. Si pedimos la foto
 * por la ruta del propio dominio, la petición es del mismo origen, la cookie
 * sí viaja, y el proxy la lleva al backend con todo en orden.
 *
 * Se queda con el `pathname`, así que arregla también las fotos ya guardadas
 * sin tener que tocar ninguna fila.
 */
export function urlDocumento(url: string | null | undefined): string {
  if (!url) return '';
  // Ya es relativa: nada que hacer.
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    // Solo se reescribe lo que cuelga de /uploads. Cualquier otra cosa
    // (un enlace externo, un PDF en Drive el día que exista) se deja igual.
    return u.pathname.startsWith('/uploads/') ? u.pathname + u.search : url;
  } catch {
    return url;
  }
}
