// Límite de intentos por IP y cuenta (2026-11-25). Reproduce lo medido en
// producción: por la app todos llegan con la misma IP.

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claveDeIntento, cuentaDeLaPeticion, PROXIES_DE_CONFIANZA } from '../src/lib/limite-intentos';

let servidor: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', PROXIES_DE_CONFIANZA);
  app.use(express.json());
  const limite = rateLimit({ windowMs: 60_000, limit: 3, keyGenerator: claveDeIntento, standardHeaders: 'draft-7', legacyHeaders: false });
  app.post('/login', limite, (_req, res) => { res.json({ ok: true }); });
  app.get('/ip', (req, res) => { res.json({ ip: req.ip, protocolo: req.protocol }); });
  await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

const login = (cuerpo: object, xff?: string) => fetch(`${base}/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
  body: JSON.stringify(cuerpo),
});

describe('límite de intentos', () => {
  it('un taxista que se pasa de intentos no bloquea a los demás (misma IP)', async () => {
    for (let i = 0; i < 3; i++) expect((await login({ telefono: '34600000001' })).status).toBe(200);
    expect((await login({ telefono: '34600000001' })).status).toBe(429);
    expect((await login({ telefono: '34600000002' })).status).toBe(200);
  });

  it('el mismo teléfono escrito de otra forma cuenta como la misma cuenta', async () => {
    for (let i = 0; i < 3; i++) await login({ telefono: '+34 600 000 003' });
    expect((await login({ telefono: '600000003' })).status).toBe(429);
  });

  it('usuario de partner y enlace también identifican la cuenta', () => {
    expect(cuentaDeLaPeticion({ body: { usuario: 'Taxi.Malaga' }, query: {} } as any)).toBe('usr:taxi.malaga');
    expect(cuentaDeLaPeticion({ body: {}, query: { token: 'abc' } } as any)).toMatch(/^tok:[0-9a-f]{16}$/);
    expect(cuentaDeLaPeticion({ body: {}, query: {} } as any)).toBe('');
  });

  it('detrás del proxy interno, req.ip y https salen bien', async () => {
    const r = await (await fetch(`${base}/ip`, { headers: { 'x-forwarded-for': '198.51.100.7', 'x-forwarded-proto': 'https' } })).json();
    expect(r).toEqual({ ip: '198.51.100.7', protocolo: 'https' });
  });
});
