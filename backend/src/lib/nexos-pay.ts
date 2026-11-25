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
  /** Código de la asociación que recomendó PilotOS (PilotOS Partners). No es un descuento. */
  codigoPartner?: string | null;
}

export interface ResultadoAlta {
  ok: boolean;
  motivo?: string;
  clienteId?: string;
}

export interface EntitlementPilotOS {
  disponible: boolean;
  allowed: boolean;
  plan: string | null;
  estadoPago?: string;
  estadoAcceso?: string;
  limites: Record<string, number | boolean | null>;
  motivo?: string;
  /**
   * Solo si Pay exige contratación en PilotOS (Pay ADR-0020). `vigente` = hay
   * contratación preparada o activa; `pruebaFinAt` = fin de la prueba gratuita.
   */
  contratacion?: { vigente: boolean; pruebaFinAt: string | null };
  /** Exención de la suscripción en Pay (fase_prueba, cortesia_temporal…). */
  tipoExencion?: string | null;
}

export function estaActivo(): boolean {
  return process.env.NEXOS_PAY_ENABLED === 'true';
}

function config() {
  return {
    activo: estaActivo(),
    baseUrl: (process.env.NEXOS_PAY_URL || '').replace(/\/+$/, ''),
    token: process.env.NEXOS_PAY_INTERNAL_TOKEN || '',
    plan: process.env.NEXOS_PAY_PLAN_DEFECTO || 'pilotos_control',
    planPro: process.env.NEXOS_PAY_PLAN_PRO || 'pilotos_pro',
    exencion: process.env.NEXOS_PAY_EXENCION || 'fase_prueba',
  };
}

export function planPro(): string {
  return config().planPro;
}

export function enforceAccess(): boolean {
  return process.env.NEXOS_PAY_ENFORCE_ACCESS === 'true';
}

export function enforcePlanGates(): boolean {
  return process.env.NEXOS_PAY_ENFORCE_PLAN_GATES === 'true';
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
    // Atribución a la asociación. Pay la procesa DESPUÉS del alta y un código
    // inválido no la bloquea: aquí solo se transporta.
    ...(datos.codigoPartner ? { codigo_partner: datos.codigoPartner } : {}),
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

/** Consulta read-only. Un fallo de red se distingue de una denegación explícita. */
export async function consultarEntitlement(externalId: string | number): Promise<EntitlementPilotOS> {
  const cfg = config();
  if (!cfg.activo || !cfg.baseUrl || !cfg.token) {
    return { disponible: false, allowed: true, plan: null, limites: {}, motivo: 'desactivado_o_sin_configurar' };
  }
  const query = new URLSearchParams({
    producto: 'pilotos', external_system: 'pilotos', external_id: String(externalId),
  });
  try {
    const response = await fetchConTimeout(
      `${cfg.baseUrl}/internal/billing/entitlements?${query.toString()}`,
      { headers: { 'x-internal-token': cfg.token } },
      2500,
    );
    if (!response.ok) {
      return { disponible: false, allowed: true, plan: null, limites: {}, motivo: `http_${response.status}` };
    }
    const body = await response.json() as any;
    return {
      disponible: true,
      allowed: body.acceso?.allowed !== false,
      plan: body.plan ?? null,
      estadoPago: body.estado_pago,
      estadoAcceso: body.estado_acceso,
      limites: body.limites ?? {},
      motivo: body.acceso?.reason,
      tipoExencion: body.suscripcion?.tipo_exencion ?? null,
      ...(body.contratacion
        ? { contratacion: { vigente: body.contratacion.vigente === true, pruebaFinAt: body.contratacion.prueba_fin_at ?? null } }
        : {}),
    };
  } catch (error) {
    return {
      disponible: false, allowed: true, plan: null, limites: {},
      motivo: error instanceof Error ? error.message : 'error_red',
    };
  }
}

/** Plan de la tarifa única (5,99 € + 2 € por asalariado + 3 € por vehículo adicional). */
export const PLAN_TARIFA_UNICA = 'pilotos_taxi';

/**
 * Claves de los componentes variables según el plan del cliente. Las tarifas
 * antiguas (Control/Pro) conservan su clave y su precio de 7,90 €: la tarifa
 * única usa claves nuevas para que ningún cliente existente cambie de precio.
 */
export function clavesComponentes(plan: string | null | undefined): { asalariados: string; vehiculos: string | null } {
  return plan === PLAN_TARIFA_UNICA
    ? { asalariados: 'asalariados_adicionales', vehiculos: 'vehiculos_adicionales' }
    : { asalariados: 'asalariados_facturables', vehiculos: null };
}

/**
 * Sincroniza el número ABSOLUTO de asalariados. El precio unitario no viaja:
 * NexOS Pay lo obtiene de su catálogo y deduplica por evento_id.
 */
export async function actualizarCantidadAsalariados(datos: {
  externalId: string | number;
  cantidad: number;
  eventoId: string;
  /** Clave del componente en el catálogo de Pay; por defecto la de las tarifas antiguas. */
  clave?: string;
}): Promise<{ ok: boolean; motivo?: string }> {
  const cfg = config();
  if (!cfg.activo) return { ok: false, motivo: 'desactivado' };
  if (!cfg.baseUrl || !cfg.token) return { ok: false, motivo: 'sin_configurar' };
  try {
    const response = await fetchConTimeout(
      `${cfg.baseUrl}/internal/billing/componentes/cantidad`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': cfg.token },
        body: JSON.stringify({
          producto: 'pilotos',
          external_system: 'pilotos',
          external_id: String(datos.externalId),
          clave: datos.clave ?? 'asalariados_facturables',
          cantidad: datos.cantidad,
          evento_id: datos.eventoId,
        }),
      },
      TIMEOUT_ALTA_MS,
    );
    if (!response.ok) return { ok: false, motivo: `http_${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, motivo: error instanceof Error ? error.message : 'error_red' };
  }
}

/** Mismo contrato para cualquier componente variable (asalariados, vehículos…). */
export const actualizarCantidadComponente = actualizarCantidadAsalariados;

// ─── Contratación con tarjeta (Pay ADR-0019) ────────────────────────────────
//
// PilotOS no pide datos fiscales, no enseña precios ni toca la tarjeta: pide a
// Pay el enlace «Contratar» y manda allí al patrón. Pay le enseña el precio
// real (tarifa + asalariados + vehículos), recoge sus datos y su «acepto» y
// abre la página de tarjeta. Pay convierte la suscripción de prueba que ya
// tiene: no se crea otra.

export interface EstadoContratacion {
  disponible: boolean;
  /** sin_contratar | prueba | pendiente_metodo_pago | preparada | activa | expirada | anulada */
  estado: string;
  pruebaFinAt?: string | null;
  inicioPagoAt?: string | null;
  tarjeta?: { marca: string | null; ultimos4: string | null } | null;
  motivo?: string;
}

function cuentaPilotOS(externalId: string | number) {
  return { producto: 'pilotos', external_system: 'pilotos', external_id: String(externalId) };
}

/** URL de la página «Contratar» de Pay para este patrón, o null con el motivo. Nunca lanza. */
export async function pedirEnlaceContratar(
  externalId: string | number,
  urlRetorno: string,
): Promise<{ url: string | null; motivo?: string }> {
  const cfg = config();
  if (!cfg.activo || !cfg.baseUrl || !cfg.token) return { url: null, motivo: 'desactivado' };
  try {
    const res = await fetchConTimeout(
      `${cfg.baseUrl}/internal/billing/contrataciones/enlace`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': cfg.token },
        body: JSON.stringify({ ...cuentaPilotOS(externalId), url_retorno: urlRetorno }),
      },
      TIMEOUT_ALTA_MS,
    );
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      console.warn('[nexos-pay] enlace de contratar rechazado', res.status, body.error);
      return { url: null, motivo: body.error || `http_${res.status}` };
    }
    return { url: body.url };
  } catch (err) {
    console.warn('[nexos-pay] enlace de contratar no disponible:', err instanceof Error ? err.message : String(err));
    return { url: null, motivo: 'error_red' };
  }
}

/** Estado de la contratación del patrón. Si Pay no responde, `disponible: false`. Nunca lanza. */
export async function consultarContratacion(externalId: string | number): Promise<EstadoContratacion> {
  const cfg = config();
  if (!cfg.activo || !cfg.baseUrl || !cfg.token) return { disponible: false, estado: 'desconocido', motivo: 'desactivado' };
  try {
    const res = await fetchConTimeout(
      `${cfg.baseUrl}/internal/billing/contrataciones/consulta`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': cfg.token },
        body: JSON.stringify(cuentaPilotOS(externalId)),
      },
      TIMEOUT_ALTA_MS,
    );
    const body = (await res.json().catch(() => ({}))) as any;
    if (res.status === 404 && body.error === 'sin_contratacion') return { disponible: true, estado: 'sin_contratar' };
    if (!res.ok) return { disponible: false, estado: 'desconocido', motivo: body.error || `http_${res.status}` };
    return {
      disponible: true,
      estado: body.estado,
      pruebaFinAt: body.prueba_fin_at ?? null,
      inicioPagoAt: body.inicio_pago_at ?? null,
      tarjeta: body.metodo_pago ? { marca: body.metodo_pago.marca ?? null, ultimos4: body.metodo_pago.ultimos4 ?? null } : null,
    };
  } catch (err) {
    return { disponible: false, estado: 'desconocido', motivo: err instanceof Error ? err.message : 'error_red' };
  }
}
