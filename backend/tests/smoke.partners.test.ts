// PilotOS Partners (DT-041): cuentas de las asociaciones, correo de bienvenida,
// acceso con usuario y contraseña y panel. Sin red ni base de datos reales.

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// El límite de intentos se prueba aparte; aquí haría saltar las pruebas por IP.
vi.mock('express-rate-limit', () => ({ default: () => (_req: unknown, _res: unknown, next: () => void) => next() }));

type Cuenta = Record<string, any>;
const bd = vi.hoisted(() => ({ cuentas: [] as Record<string, any>[] }));

/** Lo justo de Prisma para `partnerCuenta`, en memoria. */
vi.mock('../src/lib/prisma', () => {
  const coincide = (c: Cuenta, where: Record<string, any> = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as any[]).some((w) => coincide(c, w));
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('not' in v) return c[k] !== v.not;
        if ('notIn' in v) return !v.notIn.includes(c[k]);
      }
      return c[k] === v;
    });
  const unico = (c: Cuenta, excepto?: Cuenta) => {
    for (const campo of ['codigo', 'usuario', 'token_hash']) {
      if (c[campo] != null && bd.cuentas.some((o) => o !== excepto && o[campo] === c[campo])) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
    }
  };
  return {
    prisma: {
      partnerCuenta: {
        findUnique: async ({ where }: any) => bd.cuentas.find((c) => coincide(c, where)) ?? null,
        findFirst: async ({ where }: any) => bd.cuentas.find((c) => coincide(c, where)) ?? null,
        create: async ({ data }: any) => {
          const c = { id: `c${bd.cuentas.length + 1}`, usuario: null, password_hash: null, activo: true, token_hash: null,
            token_tipo: null, token_expira: null, invitacion_enviada_at: null, invitacion_error: null,
            sesiones_validas_desde: new Date(Date.now() - 60_000), ultimo_acceso: null, ...data };
          unico(c); bd.cuentas.push(c); return c;
        },
        update: async ({ where, data }: any) => {
          const c = bd.cuentas.find((x) => coincide(x, where));
          if (!c) throw new Error('not found');
          unico({ ...c, ...data }, c); Object.assign(c, data); return { ...c };
        },
        updateMany: async ({ where, data }: any) => {
          const lista = bd.cuentas.filter((c) => coincide(c, where));
          lista.forEach((c) => Object.assign(c, data));
          return { count: lista.length };
        },
      },
    },
  };
});

const correo = vi.hoisted(() => ({ enviados: [] as Array<{ a: string; asunto: string; cuerpo: string; html?: string }>, falla: false }));
vi.mock('../src/services/email.service', async (original) => ({
  ...(await original<typeof import('../src/services/email.service')>()),
  enviarEmail: async (a: string, asunto: string, cuerpo: string, opciones: { html?: string } = {}) => {
    if (correo.falla) return { ok: false, error: 'smtp_no_configurado' };
    correo.enviados.push({ a, asunto, cuerpo, html: opciones.html });
    return { ok: true };
  },
}));

import { sincronizarPartners, huella } from '../src/services/partners.service';
import partnersRoutes from '../src/routes/partners.routes';

const fetchReal = globalThis.fetch;
let servidor: Server;
let base: string;

const ASOC = { codigo: 'TAXI-MALAGA', nombre: 'Asociación Taxi Málaga', email: 'secretaria@asoc.test', activo: true };
const RESUMEN = {
  status: 'OK',
  partner: { codigo: 'TAXI-MALAGA', nombre: 'Asociación Taxi Málaga', activo: true },
  tramos: [{ desde: 1, porcentaje: 10 }, { desde: 50, porcentaje: 15 }, { desde: 100, porcentaje: 20 }],
  socios: { total: 12, este_mes: 3 },
  mes_actual: { periodo: '2026-11', clientes_pagando: 9, porcentaje: 10, comision_estimada: 7.19, siguiente_tramo: { desde: 50, porcentaje: 15, faltan: 41 } },
  pendiente_de_liquidar: 7.19,
  historial: [],
  liquidaciones: [],
};

let payPartners: unknown = { status: 'OK', partners: [ASOC] };
let payCaido = false;

function payFalso() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://pay.test')) return fetchReal(url, opts);
    if (payCaido) throw new Error('ECONNREFUSED');
    if (u.includes('/partners-portal/TAXI-MALAGA/resumen')) return new Response(JSON.stringify(RESUMEN), { status: 200 });
    if (u.includes('/partners-portal?producto=pilotos')) return new Response(JSON.stringify(payPartners), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
}

/** El enlace del último correo, como lo pulsaría la asociación. */
function tokenDelUltimoCorreo(): string {
  const ultimo = correo.enviados[correo.enviados.length - 1];
  const m = ultimo.cuerpo.match(/\/partners\/acceso\?token=([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('sin enlace');
  return m[1];
}

async function llamar(metodo: string, ruta: string, cuerpo?: unknown, cookie?: string) {
  const r = await fetch(`${base}/api/partners${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const setCookie = r.headers.get('set-cookie') ?? '';
  return { http: r.status, cookie: setCookie.split(';')[0], ...(await r.json()) } as any;
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/partners', partnersRoutes);
  await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

beforeEach(() => {
  process.env.NEXOS_PAY_ENABLED = 'true';
  process.env.NEXOS_PAY_URL = 'https://pay.test';
  process.env.NEXOS_PAY_INTERNAL_TOKEN = 'test-token';
  process.env.APP_URL = 'https://pilotos.nexostudios.digital';
  process.env.JWT_SECRET = 'secreto-de-prueba-partners';
  process.env.SESSION_COOKIE_INSECURE = 'true';
  bd.cuentas = [];
  correo.enviados = [];
  correo.falla = false;
  payCaido = false;
  payPartners = { status: 'OK', partners: [ASOC] };
  payFalso();
});

afterEach(() => vi.unstubAllGlobals());

describe('alta de una asociación', () => {
  it('Pay tiene una asociación nueva: se crea su cuenta y le llega la bienvenida', async () => {
    const r = await sincronizarPartners();
    expect(r).toMatchObject({ leidos: 1, creadas: 1, invitaciones: 1 });
    expect(correo.enviados).toHaveLength(1);
    const c = correo.enviados[0];
    expect(c.a).toBe('secretaria@asoc.test');
    expect(c.asunto).toBe('Asociación Taxi Málaga ya es partner de PilotOS');
    expect(c.cuerpo).toContain('Código de la asociación: TAXI-MALAGA');
    expect(c.cuerpo).toContain('https://pilotos.nexostudios.digital/onboarding?ref=TAXI-MALAGA');
    expect(c.cuerpo).toContain('https://pilotos.nexostudios.digital/partners');
    expect(c.html).toContain('Crear usuario y contraseña');
    // El enlace va en el correo; en la base solo su huella.
    expect(bd.cuentas[0].token_hash).toBe(huella(tokenDelUltimoCorreo()));
    expect(bd.cuentas[0].token_tipo).toBe('invitacion');
  });

  it('la segunda vuelta no repite el correo', async () => {
    await sincronizarPartners();
    await sincronizarPartners();
    expect(correo.enviados).toHaveLength(1);
  });

  it('si el correo no sale, se reintenta en la siguiente vuelta', async () => {
    correo.falla = true;
    await sincronizarPartners();
    expect(bd.cuentas[0].invitacion_error).toBe('smtp_no_configurado');
    correo.falla = false;
    await sincronizarPartners();
    expect(correo.enviados).toHaveLength(1);
    expect(bd.cuentas[0].invitacion_enviada_at).toBeInstanceOf(Date);
  });

  it('sin correo en Pay no se crea nada', async () => {
    payPartners = { status: 'OK', partners: [{ ...ASOC, email: null }] };
    await sincronizarPartners();
    expect(bd.cuentas).toHaveLength(0);
  });

  it('si cambia el correo antes de crear el acceso, la bienvenida va al nuevo', async () => {
    await sincronizarPartners();
    payPartners = { status: 'OK', partners: [{ ...ASOC, email: 'presidencia@asoc.test' }] };
    await sincronizarPartners();
    expect(correo.enviados.map((c) => c.a)).toEqual(['secretaria@asoc.test', 'presidencia@asoc.test']);
  });

  it('Pay caído: no se toca nada (no se cierra el acceso de nadie)', async () => {
    await sincronizarPartners();
    payCaido = true;
    expect(await sincronizarPartners()).toBeNull();
    expect(bd.cuentas[0].activo).toBe(true);
  });

  it('deja de ser partner en Pay: ya no puede entrar', async () => {
    await sincronizarPartners();
    payPartners = { status: 'OK', partners: [] };
    const r = await sincronizarPartners();
    expect(r?.desactivadas).toBe(1);
    expect(bd.cuentas[0].activo).toBe(false);
  });
});

describe('crear el acceso y entrar', () => {
  async function crearAcceso(usuario = 'taxi.malaga', password = 'unaclavelarga') {
    await sincronizarPartners();
    const token = tokenDelUltimoCorreo();
    return { token, r: await llamar('POST', '/acceso', { token, usuario, password }) };
  }

  it('el enlace dice a qué asociación es', async () => {
    await sincronizarPartners();
    const r = await llamar('GET', `/enlace?token=${tokenDelUltimoCorreo()}`);
    expect(r).toMatchObject({ http: 200, tipo: 'invitacion', nombre: 'Asociación Taxi Málaga', codigo: 'TAXI-MALAGA', usuario: null });
  });

  it('elige usuario y contraseña, queda dentro y ve su panel', async () => {
    const { r } = await crearAcceso('Taxi.Malaga');
    expect(r.http).toBe(200);
    expect(r.usuario).toBe('taxi.malaga');
    expect(r.cookie).toMatch(/^pilotos_partner=/);
    const panel = await llamar('GET', '/panel', undefined, r.cookie);
    expect(panel.http).toBe(200);
    expect(panel.cuenta).toEqual({ nombre: 'Asociación Taxi Málaga', codigo: 'TAXI-MALAGA', usuario: 'taxi.malaga' });
    expect(panel.mes_actual.clientes_pagando).toBe(9);
    expect(panel.socios.total).toBe(12);
  });

  it('el enlace solo sirve una vez', async () => {
    const { token } = await crearAcceso();
    const otra = await llamar('POST', '/acceso', { token, usuario: 'otro', password: 'otraclavelarga' });
    expect(otra.http).toBe(404);
  });

  it('enlace caducado', async () => {
    await sincronizarPartners();
    bd.cuentas[0].token_expira = new Date(Date.now() - 1000);
    const r = await llamar('POST', '/acceso', { token: tokenDelUltimoCorreo(), usuario: 'taxi', password: 'unaclavelarga' });
    expect(r.http).toBe(404);
  });

  it('contraseña corta o usuario no válido', async () => {
    await sincronizarPartners();
    const token = tokenDelUltimoCorreo();
    expect((await llamar('POST', '/acceso', { token, usuario: 'taxi', password: 'corta' })).error).toBe('password_debil');
    expect((await llamar('POST', '/acceso', { token, usuario: 'con espacio', password: 'unaclavelarga' })).error).toBe('usuario_no_valido');
  });

  it('usuario ya ocupado por otra asociación', async () => {
    payPartners = { status: 'OK', partners: [ASOC, { codigo: 'TAXI-SEVILLA', nombre: 'Taxi Sevilla', email: 'sev@asoc.test', activo: true }] };
    await sincronizarPartners();
    const [tMalaga, tSevilla] = correo.enviados.map((c) => c.cuerpo.match(/token=([A-Za-z0-9_-]+)/)![1]);
    await llamar('POST', '/acceso', { token: tMalaga, usuario: 'taxi', password: 'unaclavelarga' });
    const r = await llamar('POST', '/acceso', { token: tSevilla, usuario: 'taxi', password: 'unaclavelarga' });
    expect(r).toMatchObject({ http: 409, error: 'usuario_ocupado' });
  });

  it('login con usuario o con el correo; contraseña mala, mensaje genérico', async () => {
    await crearAcceso();
    expect((await llamar('POST', '/login', { usuario: 'TAXI.MALAGA', password: 'unaclavelarga' })).http).toBe(200);
    expect((await llamar('POST', '/login', { usuario: 'secretaria@asoc.test', password: 'unaclavelarga' })).http).toBe(200);
    const mala = await llamar('POST', '/login', { usuario: 'taxi.malaga', password: 'otra-cosa' });
    const noExiste = await llamar('POST', '/login', { usuario: 'nadie', password: 'otra-cosa' });
    expect(mala).toMatchObject({ http: 401, message: 'Usuario o contraseña incorrectos.' });
    expect(noExiste.message).toBe(mala.message);
  });

  it('una asociación desactivada no entra y su sesión deja de valer', async () => {
    const { r } = await crearAcceso();
    bd.cuentas[0].activo = false;
    expect((await llamar('POST', '/login', { usuario: 'taxi.malaga', password: 'unaclavelarga' })).http).toBe(401);
    expect((await llamar('GET', '/panel', undefined, r.cookie)).http).toBe(401);
  });

  it('sin sesión no hay panel, y la cookie de un taxista no sirve', async () => {
    expect((await llamar('GET', '/panel')).http).toBe(401);
    expect((await llamar('GET', '/panel', undefined, 'pilotos_token=lo-que-sea')).http).toBe(401);
  });

  it('desde otra web no se puede entrar', async () => {
    process.env.ALLOWED_ORIGINS = 'https://pilotos.nexostudios.digital';
    const r = await fetch(`${base}/api/partners/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://malo.test' },
      body: JSON.stringify({ usuario: 'x', password: 'y' }),
    });
    delete process.env.ALLOWED_ORIGINS;
    expect(r.status).toBe(403);
  });

  it('Pay no responde: el panel lo dice en vez de enseñar ceros', async () => {
    const { r } = await crearAcceso();
    payCaido = true;
    const panel = await llamar('GET', '/panel', undefined, r.cookie);
    expect(panel).toMatchObject({ http: 503, error: 'datos_no_disponibles' });
  });
});

describe('contraseña olvidada', () => {
  it('manda un enlace, la cambia y cierra las sesiones anteriores', async () => {
    await sincronizarPartners();
    const acceso = await llamar('POST', '/acceso', { token: tokenDelUltimoCorreo(), usuario: 'taxi.malaga', password: 'unaclavelarga' });
    // La sesión anterior es de «antes» del cambio.
    bd.cuentas[0].sesiones_validas_desde = new Date(Date.now() - 120_000);
    const vieja = acceso.cookie;
    await new Promise((ok) => setTimeout(ok, 1100));

    const pedir = await llamar('POST', '/recuperar', { usuario: 'taxi.malaga' });
    expect(pedir.http).toBe(200);
    const ultimo = correo.enviados[correo.enviados.length - 1];
    expect(ultimo.asunto).toBe('Nueva contraseña de PilotOS Partners');
    expect(ultimo.cuerpo).toContain('Usuario de la asociación: taxi.malaga');

    const enlace = await llamar('GET', `/enlace?token=${tokenDelUltimoCorreo()}`);
    expect(enlace).toMatchObject({ tipo: 'recuperacion', usuario: 'taxi.malaga' });
    const cambio = await llamar('POST', '/acceso', { token: tokenDelUltimoCorreo(), password: 'clave-nueva-larga' });
    expect(cambio.http).toBe(200);
    expect(bd.cuentas[0].usuario).toBe('taxi.malaga'); // el usuario no cambia

    expect((await llamar('GET', '/panel', undefined, vieja)).http).toBe(401);
    expect((await llamar('GET', '/panel', undefined, cambio.cookie)).http).toBe(200);
    expect((await llamar('POST', '/login', { usuario: 'taxi.malaga', password: 'unaclavelarga' })).http).toBe(401);
  });

  it('si aún no creó el acceso, se le reenvía la bienvenida', async () => {
    await sincronizarPartners();
    await llamar('POST', '/recuperar', { usuario: 'secretaria@asoc.test' });
    expect(correo.enviados).toHaveLength(2);
    expect(correo.enviados[1].asunto).toBe('Asociación Taxi Málaga ya es partner de PilotOS');
  });

  it('responde lo mismo aunque no exista', async () => {
    const r = await llamar('POST', '/recuperar', { usuario: 'nadie' });
    expect(r.http).toBe(200);
    expect(correo.enviados).toHaveLength(0);
  });
});
