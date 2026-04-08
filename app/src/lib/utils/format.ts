/**
 * Formateo de moneda EUR.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formateo de fecha corta (dd/mm/yyyy).
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Formateo de kilómetros con separador de miles.
 */
export function formatKm(km: number): string {
  return `${new Intl.NumberFormat('es-ES').format(km)} km`;
}
