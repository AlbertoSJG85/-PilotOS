/**
 * Tests de humo — envío de correo (2026-08-12).
 *
 * El correo es ahora el canal de recuperación de contraseña, así que lo que
 * se vigila aquí es que NUNCA lance (un fallo de SMTP no puede tumbar un
 * endpoint de auth) y que no se intente escribir a los buzones sintéticos
 * `telefono@pilotos.app` que creó el onboarding antiguo.
 */
import { describe, it, expect, vi } from 'vitest';
import { enviarEmail, esEmailEntregable, cuerpoCodigoRecuperacion } from '../src/services/email.service';

describe('esEmailEntregable', () => {
    it('un email normal sí', () => {
        expect(esEmailEntregable('alberto@nexostudios.digital')).toBe(true);
    });

    it('CLAVE: el sintético del onboarding antiguo no — ese buzón no existe', () => {
        expect(esEmailEntregable('+34600111222@pilotos.app')).toBe(false);
    });

    it('vacío, nulo o sin arroba, tampoco', () => {
        expect(esEmailEntregable('')).toBe(false);
        expect(esEmailEntregable(null)).toBe(false);
        expect(esEmailEntregable('esto-no-es-un-email')).toBe(false);
    });
});

describe('enviarEmail', () => {
    it('sin SMTP_URL no envía, pero lo dice en vez de fallar raro', async () => {
        const r = await enviarEmail('alguien@ejemplo.com', 'Asunto', 'Cuerpo', { smtpUrl: undefined });
        expect(r).toEqual({ ok: false, error: 'smtp_no_configurado' });
    });

    it('a un destinatario no entregable ni lo intenta', async () => {
        const transporte = { sendMail: vi.fn() };
        const r = await enviarEmail('+34600111222@pilotos.app', 'A', 'B', { smtpUrl: 'smtps://x', transporte });
        expect(r.ok).toBe(false);
        expect(transporte.sendMail).not.toHaveBeenCalled();
    });

    it('camino feliz: manda con el remitente configurado', async () => {
        const transporte = { sendMail: vi.fn().mockResolvedValue({ messageId: 'abc' }) };
        const r = await enviarEmail('alguien@ejemplo.com', 'Asunto', 'Cuerpo', {
            smtpUrl: 'smtps://x', remitente: 'PilotOS <info@nexostudios.digital>', transporte,
        });
        expect(r).toEqual({ ok: true, messageId: 'abc' });
        expect(transporte.sendMail).toHaveBeenCalledWith({
            from: 'PilotOS <info@nexostudios.digital>',
            to: 'alguien@ejemplo.com',
            subject: 'Asunto',
            text: 'Cuerpo',
        });
    });

    it('CLAVE: si el SMTP revienta, devuelve el fallo — no lanza', async () => {
        const transporte = { sendMail: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
        const r = await enviarEmail('alguien@ejemplo.com', 'A', 'B', { smtpUrl: 'smtps://x', transporte });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/ECONNREFUSED/);
    });
});

describe('cuerpoCodigoRecuperacion', () => {
    it('lleva el código y su caducidad, y avisa a quien no lo haya pedido', () => {
        const { asunto, cuerpo } = cuerpoCodigoRecuperacion('123456', 15);
        expect(asunto).toMatch(/contrase/i);
        expect(cuerpo).toContain('123456');
        expect(cuerpo).toContain('15 minutos');
        expect(cuerpo).toMatch(/si no has sido tú/i);
    });
});
