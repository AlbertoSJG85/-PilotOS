/**
 * Tests de humo — la vuelta de Google no puede pedir sesión (2026-08-13, C-066).
 *
 * EL FALLO QUE PROTEGEN. `GET /api/drive/callback` lo llama el navegador del
 * cliente cuando Google lo devuelve, y esa petición NO lleva nuestra cookie
 * ni nuestra cabecera `Authorization` — viene de accounts.google.com. Lo que
 * la autentica es el `state` firmado con HMAC.
 *
 * El router siempre estuvo bien: el callback nunca tuvo `requireAuth`. Lo que
 * estaba mal era el ORDEN en que se montaba en `index.ts`, debajo del guardia
 * global `app.use('/api', requireAuth, ...)`. Express ejecuta por orden de
 * registro, así que el guardia se comía la petición antes de llegar al router
 * y Alberto recibía un `{"error":"auth_required"}` en crudo justo al volver de
 * Google, con la conexión a medias.
 *
 * Por eso hay dos tests y hacen cosas distintas: uno mira el router (que ya
 * era correcto) y el otro mira el CABLEADO (que es lo que falló). Ninguna
 * prueba del router solo habría detectado esto.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../src/lib/prisma', () => ({
    prisma: { documento: {}, cliente: {}, clienteDrive: {} },
}));

const { default: driveRoutes } = await import('../src/routes/drive.routes');

describe('el router de Drive', () => {
    it('el callback no lleva ningún middleware de sesión delante', () => {
        const capa = (driveRoutes as any).stack.find(
            (c: any) => c.route?.path === '/callback' && c.route?.methods?.get,
        );
        expect(capa, 'no existe GET /callback').toBeDefined();

        // Un solo manejador: el que atiende. Si alguien mete requireAuth
        // delante, aquí habría dos y la conexión con Drive dejaría de
        // completarse para todo el mundo.
        expect(capa.route.stack).toHaveLength(1);
        expect(capa.route.stack.map((s: any) => s.name)).not.toContain('requireAuth');
    });

    it('los demás endpoints SÍ exigen sesión (no se abre nada de más)', () => {
        for (const ruta of ['/estado', '/conectar', '/desconectar']) {
            const capa = (driveRoutes as any).stack.find((c: any) => c.route?.path === ruta);
            expect(capa, `no existe ${ruta}`).toBeDefined();
            const nombres = capa.route.stack.map((s: any) => s.name);
            expect(nombres, `${ruta} sin requireAuth`).toContain('requireAuth');
        }
    });
});

/**
 * Este test lee el fichero de arranque en vez de ejecutarlo, y es a propósito:
 * `index.ts` abre el puerto al importarse, así que no se puede montar en una
 * prueba. Lo que se comprueba es un invariante de cableado —quién va antes que
 * quién— que es exactamente lo que se rompió.
 */
describe('el cableado de index.ts', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

    it('/api/drive se monta una sola vez', () => {
        const veces = fuente.split("app.use('/api/drive'").length - 1;
        expect(veces, 'el router de Drive está montado más de una vez').toBe(1);
    });

    it('CLAVE: /api/drive se monta ANTES del guardia global de /api', () => {
        const drive = fuente.indexOf("app.use('/api/drive'");
        const guardiaGlobal = fuente.indexOf("app.use('/api', requireAuth");

        expect(drive, "no se encuentra el montaje de /api/drive").toBeGreaterThan(-1);
        expect(guardiaGlobal, 'no se encuentra el guardia global de /api').toBeGreaterThan(-1);
        expect(
            drive,
            'Drive se monta DESPUÉS del requireAuth global: el callback de Google morirá en un 401',
        ).toBeLessThan(guardiaGlobal);
    });
});
