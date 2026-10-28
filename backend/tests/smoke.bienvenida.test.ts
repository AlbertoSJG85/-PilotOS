/**
 * Correos con marca: activación y bienvenida.
 * Se vigila que lleven la marca, que lo que escribe el usuario no se cuele como
 * HTML, que el texto plano siga existiendo, y que un fallo de correo nunca
 * tumbe un alta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const emailMock = {
    enviarEmail: vi.fn(),
    esEmailEntregable: (e: string | null | undefined) => !!e && e.includes('@') && !e.endsWith('@pilotos.app'),
};
vi.mock('../src/services/email.service', () => emailMock);

const {
    plantillaCodigoActivacion, plantillaBienvenidaPatron, plantillaBienvenidaAsalariado,
} = await import('../src/services/email-plantillas');
const { enviarBienvenidasOnboarding, enviarBienvenidaAsalariado } = await import('../src/services/bienvenida.service');

beforeEach(() => {
    vi.clearAllMocks();
    emailMock.enviarEmail.mockResolvedValue({ ok: true });
});

describe('plantillas', () => {
    it('activación: lleva marca, código y aviso; y también texto plano', () => {
        const p = plantillaCodigoActivacion('123456', 15);
        expect(p.html).toContain('123456');
        expect(p.html).toContain('#FFB703');
        expect(p.html).toContain('/branding/pilotos/logo-full.png');
        expect(p.html).toContain('15 minutos');
        expect(p.cuerpo).toContain('Tu código es: 123456');
        expect(p.asunto).toBe('Tu código para activar tu cuenta de PilotOS');
    });

    it('bienvenida patrón: enlace a /login, teléfono y equipo', () => {
        const p = plantillaBienvenidaPatron({ nombre: 'Ana', telefono: '600111222', asalariados: ['Luis'] });
        expect(p.html).toContain('/login');
        expect(p.html).toContain('600111222');
        expect(p.html).toContain('Luis');
        expect(p.cuerpo).toContain('600111222');
    });

    it('bienvenida asalariado: dice quién lo ha dado de alta', () => {
        const p = plantillaBienvenidaAsalariado({ nombre: 'Luis', telefono: '611222333', responsable: 'Ana' });
        expect(p.asunto).toBe('Ana te ha dado de alta en PilotOS');
        expect(p.html).toContain('611222333');
    });

    it('CLAVE: lo que escribe el usuario no se cuela como HTML', () => {
        const p = plantillaBienvenidaAsalariado({
            nombre: '<script>alert(1)</script>', telefono: '1', responsable: '"><img src=x onerror=1>',
        });
        expect(p.html).not.toContain('<script>');
        expect(p.html).not.toContain('<img src=x');
        expect(p.html).toContain('&lt;script&gt;');
    });
});

describe('envío de bienvenidas', () => {
    it('onboarding: manda uno al patrón y uno a cada asalariado, con HTML', async () => {
        await enviarBienvenidasOnboarding(
            { nombre: 'Ana', email: 'ana@gmail.com', telefono: '600111222' },
            [{ nombre: 'Luis', email: 'luis@gmail.com', telefono: '611222333' }],
        );
        const destinos = emailMock.enviarEmail.mock.calls.map((c) => c[0]).sort();
        expect(destinos).toEqual(['ana@gmail.com', 'luis@gmail.com']);
        for (const c of emailMock.enviarEmail.mock.calls) expect(c[3].html).toContain('<html');
    });

    it('un email sintético (@pilotos.app) no se intenta', async () => {
        const ok = await enviarBienvenidaAsalariado({ nombre: 'X', email: '600@pilotos.app', telefono: '600' }, 'Ana');
        expect(ok).toBe(false);
        expect(emailMock.enviarEmail).not.toHaveBeenCalled();
    });

    it('CLAVE: si el correo falla o revienta, no lanza', async () => {
        emailMock.enviarEmail.mockRejectedValue(new Error('SMTP caído'));
        await expect(enviarBienvenidasOnboarding(
            { nombre: 'Ana', email: 'ana@gmail.com', telefono: '1' }, [],
        )).resolves.toBeUndefined();
        emailMock.enviarEmail.mockResolvedValue({ ok: false, error: 'x' });
        await expect(enviarBienvenidaAsalariado({ email: 'a@b.com' }, 'Ana')).resolves.toBe(false);
    });
});
