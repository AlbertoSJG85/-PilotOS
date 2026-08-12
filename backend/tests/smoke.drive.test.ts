/**
 * Tests de humo — conexión con el Drive del cliente (2026-08-12).
 *
 * Lo que se protege aquí:
 *   · Los tokens NUNCA se guardan en claro, y el cifrado detecta manipulación.
 *   · Sin configuración, la función está apagada y no revienta nada.
 *   · El `state` de OAuth va firmado: nadie puede enganchar su Drive a la
 *     cuenta de otro completando la vuelta de Google con un cliente_id ajeno.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CLAVE = 'a'.repeat(64); // 32 bytes en hexadecimal

describe('cifrado de los tokens de Drive', () => {
    beforeEach(() => { process.env.DRIVE_ENCRYPTION_KEY = CLAVE; });
    afterEach(() => { delete process.env.DRIVE_ENCRYPTION_KEY; });

    it('ida y vuelta: lo que se cifra se recupera igual', async () => {
        const { cifrar, descifrar } = await import('../src/lib/cifrado');
        const token = 'ya29.a0AfH6SMB-token-de-google-de-ejemplo';
        expect(descifrar(cifrar(token))).toBe(token);
    });

    it('CLAVE: el texto cifrado no contiene el token', async () => {
        const { cifrar } = await import('../src/lib/cifrado');
        const token = 'ya29.token-secreto';
        expect(cifrar(token)).not.toContain('token-secreto');
    });

    it('dos cifrados del mismo token son distintos (cada uno con su IV)', async () => {
        const { cifrar } = await import('../src/lib/cifrado');
        expect(cifrar('mismo')).not.toBe(cifrar('mismo'));
    });

    it('CLAVE: si alguien manipula el dato guardado, el descifrado falla en el acto', async () => {
        const { cifrar, descifrar } = await import('../src/lib/cifrado');
        const guardado = cifrar('ya29.token');
        const [iv, etiqueta, cifrado] = guardado.split(':');
        // Cambiamos un byte del texto cifrado, como haría alguien con acceso a la BD.
        const manipulado = `${iv}:${etiqueta}:${cifrado.slice(0, -2)}${cifrado.slice(-2) === 'ff' ? '00' : 'ff'}`;
        expect(() => descifrar(manipulado)).toThrow();
    });

    it('con otra clave no se puede descifrar', async () => {
        const { cifrar, descifrar } = await import('../src/lib/cifrado');
        const guardado = cifrar('ya29.token');
        process.env.DRIVE_ENCRYPTION_KEY = 'b'.repeat(64);
        expect(() => descifrar(guardado)).toThrow();
    });

    it('sin clave configurada lanza en vez de guardar en claro', async () => {
        const { cifrar } = await import('../src/lib/cifrado');
        delete process.env.DRIVE_ENCRYPTION_KEY;
        expect(() => cifrar('ya29.token')).toThrow(/DRIVE_ENCRYPTION_KEY/);
    });

    it('una clave de longitud incorrecta se rechaza (no se cifra con basura)', async () => {
        const { cifrar } = await import('../src/lib/cifrado');
        process.env.DRIVE_ENCRYPTION_KEY = 'abcd';
        expect(() => cifrar('x')).toThrow(/32 bytes/);
    });
});

describe('disponibilidad de la función', () => {
    afterEach(() => {
        delete process.env.GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_SECRET;
        delete process.env.GOOGLE_DRIVE_REDIRECT_URI;
        delete process.env.DRIVE_ENCRYPTION_KEY;
    });

    it('sin credenciales, Drive está apagado y se sabe', async () => {
        const { driveDisponible, urlDeConsentimiento } = await import('../src/services/drive.service');
        expect(driveDisponible()).toBe(false);
        expect(urlDeConsentimiento('estado')).toBeNull();
    });

    it('con todo configurado, la URL pide el permiso MÍNIMO y offline', async () => {
        process.env.GOOGLE_CLIENT_ID = 'id-de-prueba';
        process.env.GOOGLE_CLIENT_SECRET = 'secreto';
        process.env.GOOGLE_DRIVE_REDIRECT_URI = 'https://api.pilotos.test/api/drive/callback';
        process.env.DRIVE_ENCRYPTION_KEY = CLAVE;

        const { driveDisponible, urlDeConsentimiento } = await import('../src/services/drive.service');
        expect(driveDisponible()).toBe(true);

        const url = urlDeConsentimiento('mi-state')!;
        // drive.file = solo los ficheros que crea la propia app. Nunca el
        // Drive entero del cliente: ni sus fotos ni sus documentos privados.
        expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/drive.file'));
        expect(url).not.toContain('auth%2Fdrive&');
        expect(url).toContain('access_type=offline');
        expect(url).toContain('state=mi-state');
    });
});

/**
 * Cuando Google dice que no (2026-08-13, C-067).
 *
 * El día que Alberto conectó su Drive de verdad, la primera subida devolvió
 * un 403 y el sistema guardó exactamente eso: `403`. Con ese número no se
 * puede hacer nada — un 403 de Drive significa como mínimo tres cosas
 * distintas, con tres arreglos distintos:
 *
 *   · `accessNotConfigured`    → la Drive API no está habilitada en el proyecto
 *   · `insufficientPermissions`→ el token no tiene el scope
 *   · el cliente revocó el acceso desde su cuenta de Google
 *
 * Hubo que entrar en el contenedor de producción y repetir la llamada a mano
 * para leer el motivo, que venía en el cuerpo de la respuesta y se tiraba a
 * la basura. Estos tests protegen que no se vuelva a tirar.
 */
describe('un fallo de Drive tiene que poder diagnosticarse', () => {
    const original = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = original;
        delete process.env.GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_SECRET;
        delete process.env.GOOGLE_DRIVE_REDIRECT_URI;
        delete process.env.DRIVE_ENCRYPTION_KEY;
    });

    it('CLAVE: el error guardado dice POR QUÉ, no solo el número', async () => {
        process.env.GOOGLE_CLIENT_ID = 'id';
        process.env.GOOGLE_CLIENT_SECRET = 'secreto';
        process.env.GOOGLE_DRIVE_REDIRECT_URI = 'https://api.pilotos.test/api/drive/callback';
        process.env.DRIVE_ENCRYPTION_KEY = CLAVE;

        vi.resetModules();
        const guardado: Record<string, unknown> = {};
        vi.doMock('../src/lib/prisma', () => ({
            prisma: {
                conexionDrive: {
                    findUnique: async () => ({
                        cliente_id: 'cli-1',
                        access_token: (await import('../src/lib/cifrado')).cifrar('ya29.token'),
                        refresh_token: null,
                        expira_at: new Date(Date.now() + 3_600_000),
                        revocado_at: null,
                    }),
                    updateMany: async ({ data }: any) => { Object.assign(guardado, data); return { count: 1 }; },
                },
            },
        }));

        // Google responde lo mismo que respondió en producción el 2026-08-13.
        globalThis.fetch = (async () => ({
            ok: false,
            status: 403,
            json: async () => ({
                error: {
                    code: 403,
                    message: 'Google Drive API has not been used in project 472381664007 before or it is disabled.',
                    errors: [{ reason: 'accessNotConfigured' }],
                },
            }),
        })) as unknown as typeof fetch;

        const { subirDocumentoADrive } = await import('../src/services/drive.service');
        const r = await subirDocumentoADrive('cli-1', __filename, 'documento', 'FACTURA_TALLER', new Date());

        expect(r.ok).toBe(false);
        // El motivo de Google, no un "403" pelado.
        expect(r.error).toContain('accessNotConfigured');
        // Y queda anotado para que la pantalla lo pueda decir: sin esto, el
        // cliente ve "Drive conectado" para siempre y no llega ni un archivo.
        expect(String(guardado.ultimo_error)).toContain('accessNotConfigured');
    });
});
