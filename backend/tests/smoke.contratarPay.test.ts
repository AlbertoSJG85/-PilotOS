// Contratación con tarjeta (Pay ADR-0019): PilotOS solo pide a Pay el enlace
// «Contratar» y lee el estado. Sin red ni base de datos reales.

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const usuario = vi.hoisted(() => ({ actual: { id: 42, es_patron: true, role: 'patron' } as Record<string, unknown> }));

vi.mock('../src/middleware/auth.middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.usuario = usuario.actual; next(); },
  requirePatron: (req: any, res: any, next: any) => {
    if (!req.usuario.es_patron && req.usuario.role !== 'admin') { res.status(403).json({ error: 'patron_required' }); return; }
    next();
  },
}));

const sync = vi.hoisted(() => ({ orden: [] as string[] }));
vi.mock('../src/services/billing-sync.service', () => ({
  sincronizarCantidadAsalariados: async (clienteId: string) => { sync.orden.push(`asalariados:${clienteId}`); },
  sincronizarCantidadVehiculos: async (clienteId: string) => { sync.orden.push(`vehiculos:${clienteId}`); },
}));

import { consultarContratacion, pedirEnlaceContratar } from '../src/lib/nexos-pay';
import { __clearBillingCacheForTests } from '../src/middleware/billing-access.middleware';
import suscripcionRoutes from '../src/routes/suscripcion.routes';

const fetchReal = globalThis.fetch;
let llamadas: Array<{ url: string; body: any }> = [];

/** Pay falso: responde según la ruta. */
function payFalso(respuestas: Record<string, { status: number; body: unknown }>) {
  llamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://pay.test')) return fetchReal(url, opts); // las llamadas de la prueba a la app
    llamadas.push({ url: u, body: opts?.body ? JSON.parse(String(opts.body)) : null });
    if (u.includes('/contrataciones/enlace')) sync.orden.push('enlace');
    const clave = Object.keys(respuestas).find((k) => u.includes(k))!;
    return new Response(JSON.stringify(respuestas[clave].body), { status: respuestas[clave].status });
  }));
}

let servidor: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/suscripcion', suscripcionRoutes);
  await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

beforeEach(() => {
  process.env.NEXOS_PAY_ENABLED = 'true';
  process.env.NEXOS_PAY_URL = 'https://pay.test';
  process.env.NEXOS_PAY_INTERNAL_TOKEN = 'test-token';
  process.env.APP_URL = 'https://pilotos.nexostudios.digital';
  usuario.actual = { id: 42, es_patron: true, role: 'patron' };
  delete process.env.NEXOS_PAY_ENFORCE_ACCESS;
  sync.orden = [];
  __clearBillingCacheForTests();
});

afterEach(() => vi.unstubAllGlobals());

describe('enlace «Contratar» de Pay', () => {
  it('pide el enlace con la cuenta del patrón y la vuelta al panel', async () => {
    payFalso({ '/contrataciones/enlace': { status: 200, body: { status: 'OK', url: 'https://pay.test/contratar/abc.def' } } });
    const r = await fetch(`${base}/api/suscripcion/contratar`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((await r.json()).url).toBe('https://pay.test/contratar/abc.def');
    expect(llamadas[0].body).toEqual({
      producto: 'pilotos', external_system: 'pilotos', external_id: '42',
      url_retorno: 'https://pilotos.nexostudios.digital/admin?contratacion=vuelta',
    });
  });

  it('PilotOS no manda precios ni datos fiscales: eso es de Pay', async () => {
    payFalso({ '/contrataciones/enlace': { status: 200, body: { url: 'https://pay.test/contratar/x' } } });
    await pedirEnlaceContratar(42, 'https://pilotos.nexostudios.digital/admin');
    expect(Object.keys(llamadas[0].body).sort()).toEqual(['external_id', 'external_system', 'producto', 'url_retorno']);
  });

  it('si Pay no puede, responde 503 con un mensaje humano y no rompe nada', async () => {
    payFalso({ '/contrataciones/enlace': { status: 503, body: { error: 'tarjeta_desactivada' } } });
    const r = await fetch(`${base}/api/suscripcion/contratar`, { method: 'POST' });
    expect(r.status).toBe(503);
    expect((await r.json()).message).toMatch(/Inténtalo/);
  });

  it('un conductor no puede contratar', async () => {
    usuario.actual = { id: 7, es_patron: false, role: 'conductor' };
    payFalso({});
    expect((await fetch(`${base}/api/suscripcion/contratar`, { method: 'POST' })).status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  it('con Pay apagado no se llama a la red', async () => {
    process.env.NEXOS_PAY_ENABLED = 'false';
    payFalso({});
    expect(await pedirEnlaceContratar(42, 'https://x')).toEqual({ url: null, motivo: 'desactivado' });
    expect(llamadas).toHaveLength(0);
  });
});

describe('estado de la contratación', () => {
  it('sin contratación en Pay: sin_contratar (se ofrece contratar)', async () => {
    payFalso({ '/contrataciones/consulta': { status: 404, body: { status: 'ERROR', error: 'sin_contratacion' } } });
    expect(await consultarContratacion(42)).toEqual({ disponible: true, estado: 'sin_contratar' });
  });

  it('activa con su tarjeta', async () => {
    payFalso({ '/contrataciones/consulta': { status: 200, body: { status: 'OK', estado: 'activa', prueba_fin_at: null, inicio_pago_at: '2026-12-01T00:00:00.000Z', metodo_pago: { estado: 'tarjeta_activa', marca: 'visa', ultimos4: '4242' } } } });
    const r = await fetch(`${base}/api/suscripcion`);
    expect((await r.json()).data).toMatchObject({ disponible: true, estado: 'activa', tarjeta: { marca: 'visa', ultimos4: '4242' } });
  });

  it('Pay caído: disponible false (la app no enseña nada), nunca un error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await consultarContratacion(42)).toMatchObject({ disponible: false });
  });
});

// ─── Pay ADR-0020: cuenta atrás de 5 días y corte al terminar la prueba ─────

const DIA = 24 * 60 * 60 * 1000;
function entitlement(allowed: boolean, finEnMs: number | null, vigente = false, reason = 'subscription_active') {
  return {
    status: 200,
    body: {
      status: 'OK', plan: 'pilotos_taxi', limites: {},
      acceso: { allowed, reason },
      contratacion: { obligatoria: true, vigente, prueba_fin_at: finEnMs === null ? null : new Date(Date.now() + finEnMs).toISOString() },
    },
  };
}
const sinContratar = { status: 404, body: { status: 'ERROR', error: 'sin_contratacion' } };
const acceso = async () => (await (await fetch(`${base}/api/suscripcion/acceso`)).json()).data;

describe('acceso: cuenta atrás y bloqueo', () => {
  it('a 3 días del fin: cuenta atrás con los días que quedan y el estado de la contratación', async () => {
    payFalso({ '/entitlements': entitlement(true, 2.5 * DIA), '/contrataciones/consulta': sinContratar });
    expect(await acceso()).toMatchObject({ disponible: true, bloqueado: false, diasRestantes: 3, cuentaAtras: true, contratada: false, estadoContratacion: 'sin_contratar', cobraExtras: true, enPrueba: true });
  });

  it('a 5 días empieza la cuenta atrás; a 6 todavía no', async () => {
    payFalso({ '/entitlements': entitlement(true, 4.5 * DIA), '/contrataciones/consulta': sinContratar });
    expect((await acceso()).cuentaAtras).toBe(true);
    __clearBillingCacheForTests();
    payFalso({ '/entitlements': entitlement(true, 5.5 * DIA), '/contrataciones/consulta': sinContratar });
    expect(await acceso()).toMatchObject({ diasRestantes: 6, cuentaAtras: false });
  });

  it('con la tarjeta ya puesta no hay cuenta atrás', async () => {
    payFalso({ '/entitlements': entitlement(true, 2 * DIA, true) });
    expect(await acceso()).toMatchObject({ contratada: true, diasRestantes: null, cuentaAtras: false });
  });

  it('una cortesía con fecha usa la misma cuenta atrás, como «periodo gratuito»', async () => {
    const e = entitlement(true, 2.5 * DIA);
    (e.body as any).suscripcion = { tipo_exencion: 'cortesia_temporal' };
    payFalso({ '/entitlements': e, '/contrataciones/consulta': sinContratar });
    expect(await acceso()).toMatchObject({ cuentaAtras: true, diasRestantes: 3, gratisPor: 'cortesia' });
  });

  it('prueba terminada sin contratar: bloqueado, con el motivo de Pay', async () => {
    process.env.NEXOS_PAY_ENFORCE_ACCESS = 'true';
    payFalso({ '/entitlements': entitlement(false, -60_000, false, 'trial_ended_contract_required'), '/contrataciones/consulta': sinContratar });
    expect(await acceso()).toMatchObject({ bloqueado: true, motivo: 'trial_ended_contract_required', diasRestantes: null, estadoContratacion: 'sin_contratar', enPrueba: false });
  });

  it('lo bloqueado se vuelve a preguntar a Pay sin caché: quien acaba de pagar entra al momento', async () => {
    process.env.NEXOS_PAY_ENFORCE_ACCESS = 'true';
    payFalso({ '/entitlements': entitlement(false, -60_000, false, 'trial_ended_contract_required'), '/contrataciones/consulta': sinContratar });
    expect((await acceso()).bloqueado).toBe(true);
    payFalso({ '/entitlements': entitlement(true, -60_000, true) });
    expect((await acceso()).bloqueado).toBe(false);
  });

  it('Pay caído: no se bloquea a nadie', async () => {
    process.env.NEXOS_PAY_ENFORCE_ACCESS = 'true';
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (String(url).startsWith('https://pay.test')) throw new Error('ECONNREFUSED');
      return fetchReal(url, opts);
    }));
    expect(await acceso()).toEqual({ disponible: false });
  });

  it('el patrón bloqueado recibe el estado de su contratación (para «Añadir tarjeta» o «confirmando»)', async () => {
    process.env.NEXOS_PAY_ENFORCE_ACCESS = 'true';
    payFalso({ '/entitlements': entitlement(false, -60_000, false, 'trial_ended_contract_required'), '/contrataciones/consulta': sinContratar });
    const d = await acceso();
    expect(d.esPatron).toBe(true);
    expect(llamadas.some((l) => l.url.includes('/contrataciones/consulta'))).toBe(true);
  });
});

describe('contratar con lo último activo', () => {
  it('antes de pedir el enlace manda a Pay los asalariados y vehículos de hoy', async () => {
    usuario.actual = { id: 42, es_patron: true, role: 'patron', cliente_id: 'cli-1' };
    payFalso({ '/contrataciones/enlace': { status: 200, body: { url: 'https://pay.test/contratar/x' } } });
    expect((await fetch(`${base}/api/suscripcion/contratar`, { method: 'POST' })).status).toBe(200);
    expect(sync.orden).toEqual(['asalariados:cli-1', 'vehiculos:cli-1', 'enlace']);
  });
});
