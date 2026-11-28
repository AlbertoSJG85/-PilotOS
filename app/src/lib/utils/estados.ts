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

const TIPO_MANTENIMIENTO: Record<string, string> = {
  POR_FECHA: 'Por fecha',
  POR_KILOMETRAJE: 'Por kilometraje',
  SEGUN_USO: 'Según uso',
};

export function etiquetaTipoMantenimiento(tipo: string): string {
  return TIPO_MANTENIMIENTO[tipo] ?? tipo.replace(/_/g, ' ').toLowerCase();
}
