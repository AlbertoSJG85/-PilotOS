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
  usuario: Pick<Usuario, 'nombre' | 'telefono'>;
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
  estado: 'ENVIADO' | 'FOTO_ILEGIBLE' | 'FOTO_SUSTITUIDA' | 'VALIDADO' | 'CON_INCIDENCIA';
  conductor?: Conductor;
  vehiculo?: Vehiculo;
  calculo?: CalculoParte;
  documentos?: any[];
  incidencias?: Incidencia[];
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
  tipo: string;
  descripcion: string;
  notificada: boolean;
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

  asalariados: any[] | null;  // [{ nombre, telefono, modelo_reparto, porcentaje_conductor }]
  gastos_fijos: any[] | null; // [{ descripcion, importe, periodicidad }]

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
