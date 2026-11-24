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

import { consultarContratacion, pedirEnlaceContratar } from '../src/lib/nexos-pay';
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
    const clave = Object.keys(respuestas).find((k) => u.endsWith(k))!;
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
