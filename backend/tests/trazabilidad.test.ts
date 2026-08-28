/**
 * Fase 6 — Trazabilidad: identificador de peticion y registro JSON.
 *
 * Mismo contrato en todo el ecosistema. Lo que se prueba no es "que escriba un
 * log": es que el identificador SOBREVIVA al salto entre servicios, que es lo
 * unico que convierte varios logs sueltos en una historia seguible.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { trazabilidad, cabecerasSalientes, esRuido, CABECERA } from '../src/middleware/trazabilidad';

function montar(lineas: string[]) {
  const app = express();
  app.use(trazabilidad({ servicio: 'prueba', escribir: (l) => lineas.push(l) }));
  app.get('/ok', (req, res) => { res.json({ id: (req as any).idPeticion }); });
  app.get('/roto', (_req, res) => { res.status(500).json({ e: 1 }); });
  app.get('/health', (_req, res) => { res.json({ ok: true }); });
  return app;
}
function levantar(app: express.Express): Promise<{ s: Server; url: string }> {
  return new Promise((res) => {
    const s = app.listen(0, () => res({ s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` }));
  });
}

describe('Fase 6 — trazabilidad', () => {
  it('RESPETA el identificador que llega de otro servicio', async () => {
    const l: string[] = []; const { s, url } = await levantar(montar(l));
    const r = await fetch(`${url}/ok`, { headers: { [CABECERA]: 'venido-de-gloria' } });
    const c = await r.json() as { id: string }; s.close();
    expect(c.id).toBe('venido-de-gloria');
    expect(r.headers.get(CABECERA)).toBe('venido-de-gloria');
    expect(JSON.parse(l[0]).request_id).toBe('venido-de-gloria');
  });

  it('genera uno cuando no viene', async () => {
    const l: string[] = []; const { s, url } = await levantar(montar(l));
    const r = await fetch(`${url}/ok`); const c = await r.json() as { id: string }; s.close();
    expect(c.id).toBeTruthy();
    expect(r.headers.get(CABECERA)).toBe(c.id);
  });

  it('el registro es JSON con los campos que permiten filtrar', async () => {
    const l: string[] = []; const { s, url } = await levantar(montar(l));
    await fetch(`${url}/ok`); s.close();
    const j = JSON.parse(l[0]);
    for (const k of ['ts','nivel','servicio','request_id','metodo','ruta','status','ms']) expect(j).toHaveProperty(k);
    expect(j.nivel).toBe('info');
  });

  it('un 500 se registra con nivel error', async () => {
    const l: string[] = []; const { s, url } = await levantar(montar(l));
    await fetch(`${url}/roto`); s.close();
    expect(JSON.parse(l[0]).nivel).toBe('error');
  });

  it('NO registra las sondas de salud', async () => {
    const l: string[] = []; const { s, url } = await levantar(montar(l));
    await fetch(`${url}/health`); s.close();
    expect(l.length).toBe(0);
  });

  it('descarta un identificador entrante absurdamente largo', async () => {
    const l: string[] = []; const { s, url } = await levantar(montar(l));
    const r = await fetch(`${url}/ok`, { headers: { [CABECERA]: 'x'.repeat(5000) } });
    const c = await r.json() as { id: string }; s.close();
    expect(c.id.length).toBeLessThanOrEqual(200);
  });

  it('propaga a salientes y no inventa cabecera si falta', () => {
    expect(cabecerasSalientes({ idPeticion: 'abc' } as any)[CABECERA]).toBe('abc');
    expect(CABECERA in cabecerasSalientes({} as any)).toBe(false);
  });

  it('CONTROL: esRuido distingue sondas de rutas reales', () => {
    expect(esRuido('/health')).toBe(true);
    expect(esRuido('/ready')).toBe(true);
    expect(esRuido('/api/algo')).toBe(false);
  });
});
