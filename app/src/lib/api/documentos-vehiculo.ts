import { apiFetch } from './fetcher';
import type { ApiResponse } from '@/types';

/**
 * Documentación del taxi: ITV, facturas de taller, póliza. NO son los tickets
 * del parte diario (esos van por `fotos.ts`).
 */

export interface PropuestaDocumento {
  tipo: 'CERTIFICADO_ITV' | 'FACTURA_TALLER' | 'POLIZA_SEGURO' | 'TARJETA_TRANSPORTE' | 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR';
  fecha?: string;
  valida_hasta?: string;
  importe?: number;
  matricula?: string;
  km_documento?: number;
  mantenimientos_detectados: string[];
  faltantes: string[];
}

export interface DocumentoVehiculo {
  id: string;
  tipo: string;
  url: string;
  estado: string;
  created_at: string;
  aplicado_at?: string | null;
  corregido?: boolean;
  gasto_id?: string | null;
  ocr_datos_extraidos?: PropuestaDocumento | null;
  datos_confirmados?: Record<string, unknown> | null;
  vehiculo?: { matricula: string };
}

/** Datos que una persona confirma o corrige sobre el documento. */
export interface DatosDocumento {
  fecha?: string;
  valida_hasta?: string;
  importe?: number;
  matricula?: string;
  km_documento?: number;
  mantenimientos?: string[];
  descripcion?: string;
}

export async function getDocumentosVehiculo(filtros?: { vehiculo_id?: string; estado?: string }): Promise<ApiResponse<DocumentoVehiculo[]>> {
  const params = new URLSearchParams();
  if (filtros?.vehiculo_id) params.set('vehiculo_id', filtros.vehiculo_id);
  if (filtros?.estado) params.set('estado', filtros.estado);
  const qs = params.toString();
  return apiFetch(`/api/documentos-vehiculo${qs ? `?${qs}` : ''}`);
}

/** Registra el documento ya subido y devuelve la propuesta del OCR. */
export async function registrarDocumentoVehiculo(
  url: string,
  vehiculo_id: string,
  tipo?: string,
): Promise<ApiResponse<DocumentoVehiculo> & { propuesta?: PropuestaDocumento }> {
  return apiFetch('/api/documentos-vehiculo', { method: 'POST', body: { url, vehiculo_id, tipo } });
}

/**
 * `acepta_ocr: true` = "lo que dice el documento es correcto". Si es false,
 * `datos` lleva lo que la persona dice que pone de verdad — y si quien
 * corrige es el asalariado, el backend lo manda a revisión del dueño.
 */
export async function confirmarDocumento(
  id: string,
  acepta_ocr: boolean,
  datos?: DatosDocumento,
): Promise<{ status: string; aplicado?: boolean; pendiente_revision?: boolean; mantenimientos_actualizados?: string[]; gasto_id?: string | null; avisos?: string[]; message?: string }> {
  return apiFetch(`/api/documentos-vehiculo/${id}/confirmar`, { method: 'POST', body: { acepta_ocr, datos } });
}

/**
 * Vuelve a leer el fichero ya subido (2026-08-13, C-070) — no hace falta
 * resubir la foto. Solo tiene sentido mientras el documento sigue pendiente
 * de confirmar. `tipo_forzado` opcional, por si ya sabes qué es y el lector
 * también se equivocó en eso.
 */
export async function reprocesarDocumento(
  id: string,
  tipo_forzado?: string,
): Promise<ApiResponse<DocumentoVehiculo>> {
  return apiFetch(`/api/documentos-vehiculo/${id}/reprocesar`, { method: 'POST', body: { tipo_forzado } });
}

/** Solo el dueño: cierra un documento que el asalariado corrigió. */
export async function revisarDocumento(
  id: string,
  aprobar: boolean,
  datos?: DatosDocumento,
): Promise<{ status: string; aplicado?: boolean; mantenimientos_actualizados?: string[]; gasto_id?: string | null }> {
  return apiFetch(`/api/documentos-vehiculo/${id}/revisar`, { method: 'POST', body: { aprobar, datos } });
}
