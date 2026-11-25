/**
 * PilotOS Partners (DT-041): llamadas del panel de las asociaciones.
 *
 * No usa `apiFetch` a propósito: ante un 401 aquel manda al login de los
 * taxistas. Aquí la sesión es otra (cookie `pilotos_partner`) y quien la pierde
 * vuelve a /partners.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export class ErrorPartners extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function llamar<T>(ruta: string, metodo: 'GET' | 'POST' = 'GET', cuerpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/partners${ruta}`, {
      method: metodo,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorPartners(0, 'sin_conexion', 'No hay conexión. Comprueba internet y vuelve a probar.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === 'FAIL') {
    throw new ErrorPartners(res.status, json.error || 'error', json.message || 'Algo ha fallado. Vuelve a probar.');
  }
  return json as T;
}

export interface Tramo { desde: number; porcentaje: number }

export interface PanelPartner {
  cuenta: { nombre: string; codigo: string; usuario: string };
  tramos: Tramo[];
  socios: { total: number; este_mes: number };
  mes_actual: {
    periodo: string;
    clientes_pagando: number;
    porcentaje: number;
    comision_estimada: number;
    siguiente_tramo: { desde: number; porcentaje: number; faltan: number } | null;
  };
  pendiente_de_liquidar: number;
  historial: Array<{ periodo: string; clientes_pagando: number; porcentaje: number; comision: number; liquidado: boolean }>;
  liquidaciones: Array<{
    periodo: string;
    trimestre: string | null;
    importe: number;
    fecha: string | null;
    meses: Array<{ periodo: string; clientes_pagando: number; porcentaje: number; comision: number }>;
  }>;
}

export interface EnlacePartner {
  tipo: 'invitacion' | 'recuperacion';
  nombre: string;
  codigo: string;
  usuario: string | null;
}

export const partnersApi = {
  login: (usuario: string, password: string) => llamar<{ status: 'OK' }>('/login', 'POST', { usuario, password }),
  recuperar: (usuario: string) => llamar<{ message: string }>('/recuperar', 'POST', { usuario }),
  enlace: (token: string) => llamar<EnlacePartner>(`/enlace?token=${encodeURIComponent(token)}`),
  acceso: (token: string, password: string, usuario?: string) =>
    llamar<{ usuario: string }>('/acceso', 'POST', { token, password, ...(usuario ? { usuario } : {}) }),
  panel: () => llamar<PanelPartner>('/panel'),
  salir: () => llamar<{ status: 'OK' }>('/salir', 'POST'),
};
