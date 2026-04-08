/**
 * Tipos de respuesta API — Formato NexOS estandar.
 * Alineados con contratos reales del backend PilotOS.
 */

export interface ApiResponse<T = unknown> {
  status: 'OK' | 'FAIL';
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total?: number;
  page?: number;
  limit?: number;
}

/** Respuesta real de POST /api/auth/login */
export interface LoginResponse {
  status: 'OK' | 'FAIL';
  token?: string;
  user?: {
    id: number;
    nombre: string;
    telefono: string;
    role: string;
  };
  context?: {
    cliente_id: string;
    conductor_id: string | null;
    es_patron: boolean;
    tipo_actividad: string;
  } | null;
  error?: string;
  message?: string;
  action?: string;
}

/** Respuesta real de GET /api/auth/me */
export interface MeResponse {
  status: 'OK' | 'FAIL';
  user?: {
    id: number;
    nombre: string;
    telefono: string;
    role: string;
    cliente_id: string | null;
    conductor_id: string | null;
    es_patron: boolean;
  };
  vehiculos?: Array<{
    id: string;
    matricula: string;
    marca: string;
    modelo: string;
    km_actuales: number;
  }>;
  conductores?: Array<{
    id: string;
    nombre: string;
    telefono: string;
    es_patron: boolean;
  }>;
  error?: string;
}

/** Respuesta real de GET /api/gastos con totales */
export interface GastosResponse {
  status: 'OK' | 'FAIL';
  data?: import('./models').Gasto[];
  totales?: Array<{ tipo: string; _sum: { importe: number | null } }>;
}

/** Respuesta real de GET /api/gastos/resumen */
export interface GastosResumenResponse {
  status: 'OK' | 'FAIL';
  porTipo?: Array<{ tipo: string; _sum: { importe: number | null }; _count: { id: number } }>;
  total?: { importe: number; cantidad: number };
}
