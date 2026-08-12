/**
 * Tests del lector por visión dentro de PilotOS (2026-08-13, C-068).
 *
 * El módulo en sí está probado en `NexOS/core/ocr-vision`. Lo que se protege
 * AQUÍ es el enganche, que es donde puede hacer daño:
 *
 *   1. Que esté APAGADO sin clave. Nadie debe empezar a pagar por accidente,
 *      y el entorno de tests no puede llamar a un proveedor externo.
 *   2. Que un fallo del lector NO deje a PilotOS sin leer. Tesseract sigue
 *      detrás — un proveedor externo caído no puede impedir que un ticket
 *      entre en el sistema.
 *   3. Que una duda declarada por el modelo baje la confianza, para que el
 *      documento pase por ojos humanos en vez de colarse como bueno.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

const transcribirMock = vi.fn();
vi.mock('../src/vendor/nexos-ocr-vision', () => ({
    transcribirImagen: (...args: unknown[]) => transcribirMock(...args),
    lectorDisponible: (k?: string) => typeof k === 'string' && k.trim().length > 0,
}));

const { extraerTextoImagen } = await import('../src/services/ocr.service');

const TICKET = path.join(__dirname, 'fixtures', 'ticket-taximetro-2026-08-10.jpg');

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OCR_VISION_ENABLED;
});
afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OCR_VISION_ENABLED;
});

describe('el lector por visión está apagado si no se ha configurado', () => {
    it('CLAVE: sin OPENAI_API_KEY no se llama al proveedor', async () => {
        await extraerTextoImagen(TICKET, 'ticket');
        expect(transcribirMock).not.toHaveBeenCalled();
    }, 120_000);

    it('con clave pero OCR_VISION_ENABLED=false, tampoco', async () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        process.env.OCR_VISION_ENABLED = 'false';
        await extraerTextoImagen(TICKET, 'ticket');
        expect(transcribirMock).not.toHaveBeenCalled();
    }, 120_000);
});

describe('cuando sí está configurado', () => {
    beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test'; });

    it('lee con visión y ni siquiera arranca Tesseract', async () => {
        transcribirMock.mockResolvedValue({
            texto: 'FECHA: 12/08/26\nBorrados: 298\nTotal: 92,55',
            legible: true, dudas: [], modelo: 'gpt-4.1-mini',
        });

        const r = await extraerTextoImagen(TICKET, 'ticket de taxímetro');

        expect(r.tuberia).toBe('vision');
        expect(r.texto).toContain('Borrados: 298');
        expect(r.legible).toBe(true);
        expect(r.modelo).toBe('gpt-4.1-mini');
    }, 120_000);

    it('el contexto del documento llega al lector (le dice qué está mirando)', async () => {
        transcribirMock.mockResolvedValue({ texto: 'algo', legible: true, dudas: [], modelo: 'm' });
        await extraerTextoImagen(TICKET, 'ticket de taxímetro');

        const [, mime, contexto] = transcribirMock.mock.calls[0];
        expect(mime).toBe('image/jpeg');
        expect(contexto).toBe('ticket de taxímetro');
    }, 120_000);

    it('CLAVE: una duda declarada baja la confianza por debajo de "legible"', async () => {
        // Preferimos que un humano lo mire a que un número dudoso entre como
        // bueno. Es la lección de C-056, aplicada al lector nuevo.
        transcribirMock.mockResolvedValue({
            texto: 'Borrados: 29?', legible: false,
            dudas: ['el último dígito de "Borrados"'], modelo: 'gpt-4.1-mini',
        });

        const r = await extraerTextoImagen(TICKET, 'ticket');

        expect(r.legible).toBe(false);
        expect(r.confianza).toBeLessThan(60);
        expect(r.dudas).toEqual(['el último dígito de "Borrados"']);
    }, 120_000);
});

describe('CLAVE: si el lector nuevo falla, PilotOS sigue leyendo', () => {
    beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test'; });

    it('el proveedor devuelve null → se lee con Tesseract, como siempre', async () => {
        transcribirMock.mockResolvedValue(null);

        const r = await extraerTextoImagen(TICKET, 'ticket');

        expect(transcribirMock).toHaveBeenCalled();
        expect(r.tuberia).not.toBe('vision');
        // Y lee de verdad: es la foto real del ticket del 10/08.
        expect(r.texto.length).toBeGreaterThan(100);
    }, 180_000);

    it('el proveedor lanza una excepción → tampoco rompe nada', async () => {
        transcribirMock.mockRejectedValue(new Error('OpenAI caído'));

        // No debe propagarse: el ticket tiene que entrar igual.
        const r = await extraerTextoImagen(TICKET, 'ticket');
        expect(r.texto.length).toBeGreaterThan(100);
    }, 180_000);
});
