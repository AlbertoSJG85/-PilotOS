/**
 * Código de la asociación que recomendó PilotOS (PilotOS Partners).
 *
 * Solo letras, números, guion y guion bajo (máx. 64), en mayúsculas. Lo que no
 * encaje se descarta en silencio: un código mal escrito no puede impedir el alta
 * (NexOS Pay avisa si no corresponde a ninguna asociación) y no es un descuento.
 */
export function limpiarCodigoAsociacion(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().toUpperCase();
  return /^[A-Z0-9_-]{1,64}$/.test(limpio) ? limpio : null;
}
