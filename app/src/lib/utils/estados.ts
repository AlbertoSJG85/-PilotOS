/** Nombre que ve la persona para cada estado de un parte. El código interno no se enseña nunca. */
const ESTADO_PARTE: Record<string, string> = {
  BORRADOR: 'Borrador',
  ENVIADO: 'Enviado',
  PENDIENTE_VALIDACION: 'Pendiente de revisión',
  FOTO_ILEGIBLE: 'Foto ilegible',
  FOTO_SUSTITUIDA: 'Foto sustituida',
  VALIDADO: 'Validado',
  CON_INCIDENCIA: 'Con incidencia',
};

export function etiquetaEstadoParte(estado: string): string {
  return ESTADO_PARTE[estado] ?? estado.replace(/_/g, ' ').toLowerCase();
}
