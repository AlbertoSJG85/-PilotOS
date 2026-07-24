/**
 * Utilidades de fechas — Fase 6 auditoria seguridad (2026-07-24).
 *
 * Antes, varias rutas calculaban "sumar N meses" como `N * 30 * 24 * 60 * 60 * 1000`
 * milisegundos. Eso no equivale a un calendario real (los meses no tienen 30
 * dias) y desplaza progresivamente fechas de ITV, seguro y mantenimientos.
 * sumarMeses() usa Date.setMonth(), que respeta el calendario real.
 */
export function sumarMeses(fecha: Date, meses: number): Date {
    const resultado = new Date(fecha);
    resultado.setMonth(resultado.getMonth() + meses);
    return resultado;
}

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Diferencia en dias completos entre dos fechas (fecha - referencia). Negativo si fecha es anterior a referencia. */
export function diferenciaDias(fecha: Date, referencia: Date): number {
    return Math.floor((fecha.getTime() - referencia.getTime()) / MS_POR_DIA);
}
