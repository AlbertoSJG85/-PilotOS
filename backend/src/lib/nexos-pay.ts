/**
 * Cliente de NexOS Pay para PilotOS.
 *
 * Norma del ecosistema: `docs/arquitectura/nexos-pay-integracion-obligatoria.md`.
 * Implementación de referencia: `RentOS/nexos-api/lib/nexos-pay-adapter.js`.
 *
 * REGLA PRINCIPAL: **NexOS Pay no puede romper PilotOS.** Si está caído, tarda
 * o responde mal, el patrón termina su alta igual y aquí solo queda constancia
 * en el log. Un problema de facturación nunca debe impedir que alguien empiece
 * a usar el producto.
 *
 * Apagado por defecto: sin `NEXOS_PAY_ENABLED=true` no se toca la red.
 */

/** Timeout de escritura. Corto y explícito: nunca dejar una petición colgando. */
const TIMEOUT_ALTA_MS = 4000;

export interface DatosAlta {
  /** Id del usuario en `minos.Users`. Es la clave de idempotencia. */
  externalId: string | number;
  email: string;
  nombre: string;
  telefono?: string | null;
  empresa?: string | null;
  /** Slug del plan. Por defecto, el de la variable de entorno. */
  plan?: string;
  rolExterno?: string;
}

export interface ResultadoAlta {
  ok: boolean;
  motivo?: string;
  clienteId?: string;
}

export function estaActivo(): boolean {
  return process.env.NEXOS_PAY_ENABLED === 'true';
}

function config() {
  return {
    activo: estaActivo(),
    baseUrl: (process.env.NEXOS_PAY_URL || '').replace(/\/+$/, ''),
    token: process.env.NEXOS_PAY_INTERNAL_TOKEN || '',
    plan: process.env.NEXOS_PAY_PLAN_DEFECTO || 'pilotos_autonomo',
    exencion: process.env.NEXOS_PAY_EXENCION || 'fase_prueba',
  };
}

async function fetchConTimeout(url: string, opciones: RequestInit, ms: number): Promise<Response> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: control.signal });
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Da de alta en NexOS Pay al patrón que acaba de completar el onboarding.
 *
 * Idempotente: llamarla dos veces con el mismo `externalId` no duplica nada.
 * Nunca lanza — devuelve siempre un resultado que el llamante puede ignorar.
 */
export async function provisionarCliente(datos: DatosAlta): Promise<ResultadoAlta> {
  const cfg = config();
  if (!cfg.activo) return { ok: false, motivo: 'desactivado' };
  if (!cfg.baseUrl || !cfg.token) return { ok: false, motivo: 'sin_configurar' };
  if (!datos.email || !datos.externalId) return { ok: false, motivo: 'faltan_datos' };

  const cuerpo = {
    producto: 'pilotos',
    external_system: 'pilotos',
    external_id: String(datos.externalId),
    external_email: datos.email,
    external_phone: datos.telefono || undefined,
    rol_externo: datos.rolExterno || 'patron',
    plan: datos.plan || cfg.plan,
    origen: 'registro_producto',
    cliente: {
      nombre: datos.nombre || datos.email,
      email: datos.email,
      telefono: datos.telefono || undefined,
      empresa: datos.empresa || undefined,
    },
    // Mientras el producto esté en pruebas, quien se registra no paga. Se marca
    // como exención y NO con un plan a 0 €: así NexOS Pay sigue sabiendo cuánto
    // ingresaría al terminar las pruebas.
    ...(cfg.exencion && cfg.exencion !== 'ninguna'
      ? { tipo_exencion: cfg.exencion, motivo_exencion: 'Alta automática desde PilotOS' }
      : {}),
  };

  try {
    const res = await fetchConTimeout(
      `${cfg.baseUrl}/internal/billing/provisioning`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': cfg.token },
        body: JSON.stringify(cuerpo),
      },
      TIMEOUT_ALTA_MS,
    );

    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      console.warn('[nexos-pay] alta rechazada', res.status, texto.slice(0, 200));
      return { ok: false, motivo: `http_${res.status}` };
    }

    const json = (await res.json()) as { cliente_id?: string; created?: unknown };
    console.log('[nexos-pay] cliente dado de alta', json.cliente_id, '| creado:', JSON.stringify(json.created));
    return { ok: true, clienteId: json.cliente_id };
  } catch (err) {
    console.warn('[nexos-pay] no se ha podido dar de alta:', err instanceof Error ? err.message : String(err));
    return { ok: false, motivo: 'error_red' };
  }
}
