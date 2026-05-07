/**
 * Tipos de dominio PilotOS — reflejan los modelos del backend Prisma.
 * Alineados con contratos reales verificados en backend/src/routes/*.
 */

export interface Usuario {
  id: number;
  nombre: string;
  telefono: string;
  role: string;
}

export interface Cliente {
  id: string;
  patron_id: number;
  nombre_comercial: string | null;
  tipo_actividad: string;
  activo: boolean;
}

export interface Conductor {
  id: string;
  usuario_id: number;
  cliente_id: string;
  es_patron: boolean;
  activo: boolean;
  usuario: Pick<Usuario, 'nombre' | 'telefono'> & { id?: number; role?: string };
  vehiculosAsignados?: { vehiculo: Pick<Vehiculo, 'id' | 'matricula'> }[];
}

export interface Vehiculo {
  id: string;
  cliente_id: string;
  matricula: string;
  marca: string;
  modelo: string;
  km_actuales: number;
  activo: boolean;
  tipo_combustible?: string;
  tipo_transmision?: string;
  fecha_matriculacion?: string;
  conductores?: { conductor: { id: string; es_patron: boolean; usuario: { nombre: string } }; activo: boolean }[];
}

export interface DatosTaximetro {
  fecha?: string;
  hora?: string;
  licencia?: string;
  acum_num_servicios?: number;
  acum_carreras?: number;
  acum_suplementos?: number;
  acum_total?: number;
  acum_dist_total?: number;
  acum_dist_ocupado?: number;
  acum_dist_libre?: number;
  acum_dist_off?: number;
  acum_tiempo_ocupado?: number;
  acum_tiempo_on?: number;
  acum_borrados?: number;
  parc_num_servicios?: number;
  parc_carreras?: number;
  parc_suplementos?: number;
  parc_total?: number;
  parc_dist_total?: number;
  parc_dist_ocupado?: number;
  parc_dist_libre?: number;
  parc_dist_off?: number;
  parc_tiempo_ocupado?: number;
  parc_tiempo_on?: number;
  importe?: number;
  valido: boolean;
  errores: string[];
}

export interface DocumentoEnlace {
  id: string;
  documento_id: string;
  entidad_tipo: string;
  entidad_id: string;
  documento: Documento;
}

export interface Documento {
  id: string;
  tipo: string;
  url: string;
  estado: string;
  ocr_texto?: string | null;
  ocr_confianza?: number | null;
  ocr_datos_extraidos?: DatosTaximetro | Record<string, unknown> | null;
  ocr_error?: string | null;
  estado_ocr?: string | null;
  intentos_reemplazo: number;
  created_at?: string;
}

export interface ParteDiario {
  id: string;
  conductor_id: string;
  vehiculo_id: string;
  fecha_trabajada: string;
  km_inicio: number;
  km_fin: number;
  ingreso_bruto: number;
  ingreso_datafono: number;
  combustible: number | null;
  varios: number | null;
  concepto_varios: string | null;
  estado: 'BORRADOR' | 'ENVIADO' | 'FOTO_ILEGIBLE' | 'FOTO_SUSTITUIDA' | 'VALIDADO' | 'CON_INCIDENCIA';
  conductor?: Conductor;
  vehiculo?: Vehiculo;
  calculo?: CalculoParte;
  documentos?: DocumentoEnlace[];
  incidencias?: Incidencia[];
  anomalias?: Anomalia[];
}

export interface CalculoParte {
  id: string;
  parte_diario_id: string;
  bruto_diario: number;
  combustible: number;
  neto_diario: number;
  parte_conductor: number;
  parte_patron: number;
  varios: number;
}

export interface Gasto {
  id: string;
  cliente_id: string;
  vehiculo_id: string | null;
  tipo: string;
  descripcion: string;
  importe: number;
  fecha: string;
  estado: string;
  forma_pago?: string | null;
  url_factura?: string | null;
}

export interface GastoFijo {
  id: string;
  cliente_id: string;
  vehiculo_id: string | null;
  tipo: string;
  descripcion: string;
  importe: number;
  periodicidad: string;
  activo: boolean;
  vehiculo?: { matricula: string };
}

export interface MantenimientoVehiculo {
  id: string;
  vehiculo_id: string;
  estado: 'PENDIENTE' | 'VENCIDO' | 'RESUELTO';
  proximo_km: number | null;
  proxima_fecha: string | null;
  ultima_ejecucion_km: number | null;
  ultima_ejecucion_fecha: string | null;
  frecuencia_aprendida: number | null;
  activo: boolean;
  frecuencia_km_personalizada: number | null;
  frecuencia_meses_personalizada: number | null;
  catalogo: {
    nombre: string;
    tipo: string;
    frecuencia_km: number | null;
    frecuencia_meses: number | null;
  };
}

export interface Incidencia {
  id: string;
  parte_diario_id: string;
  que_ocurrio: string;
  decision_tomada: string;
  justificacion: string;
  estado: 'CREADA' | 'CERRADA';
  autorizador_id: string;
  created_at: string;
  closed_at: string | null;
  parteDiario?: ParteDiario;
}

export interface Anomalia {
  id: string;
  conductor_id: string;
  tipo: 'NORMAL' | 'CRITICA';
  descripcion: string;
  notificada: boolean;
  parte_diario_id?: string | null;
  documento_id?: string | null;
  estado: 'ACTIVA' | 'RESUELTA';
  created_at: string;
  conductor?: { usuario: { nombre: string } };
}

export interface Onboarding {
  id: string;
  telefono: string;
  nombre_patron: string | null; // Mantenemos nombre interno pero UI dirá Propietario
  email_patron: string | null;
  nif_cif: string | null;
  nombre_comercial: string | null;
  tipo_actividad: string;

  asalariados: { nombre: string; telefono: string; modelo_reparto?: string; porcentaje_conductor?: number }[] | null;
  gastos_fijos: { descripcion: string; importe: number; periodicidad: string }[] | null;

  matricula: string | null;
  marca_modelo: string | null;
  fecha_matriculacion: string | null;
  tipo_combustible: string | null;
  tipo_transmision: string | null;
  km_actuales: number | null;
  seguro_vigencia: string | null;

  preferencias_avisos: string | null;
  completado: boolean;
}
