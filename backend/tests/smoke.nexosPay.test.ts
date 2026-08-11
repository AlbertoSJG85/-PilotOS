import { afterEach, describe, expect, it, vi } from 'vitest';
import { actualizarCantidadAsalariados, consultarEntitlement } from '../src/lib/nexos-pay';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXOS_PAY_ENABLED;
  delete process.env.NEXOS_PAY_URL;
  delete process.env.NEXOS_PAY_INTERNAL_TOKEN;
});

function enablePay(): void {
  process.env.NEXOS_PAY_ENABLED = 'true';
  process.env.NEXOS_PAY_URL = 'https://pay.test';
  process.env.NEXOS_PAY_INTERNAL_TOKEN = 'test-token';
}

describe('NexOS Pay en PilotOS', () => {
  it('publica una cantidad absoluta sin enviar ni duplicar el precio comercial', async () => {
    enablePay();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'OK' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await actualizarCantidadAsalariados({
      externalId: 42, cantidad: 137, eventoId: 'asalariados-sync-1',
    });
    expect(result.ok).toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pay.test/internal/billing/componentes/cantidad');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      external_id: '42', clave: 'asalariados_facturables', cantidad: 137,
      evento_id: 'asalariados-sync-1',
    });
    expect(body).not.toHaveProperty('precio_unitario');
    expect(body).not.toHaveProperty('incremento');
  });

  it('distingue una suspensión explícita de una caída temporal de Pay', async () => {
    enablePay();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'OK', plan: 'pilotos_pro', estado_pago: 'impago', estado_acceso: 'suspendido_total',
      limites: { pilotos_proactividad: true }, acceso: { allowed: false, reason: 'access_suspended_total' },
    }), { status: 200 })));
    const suspended = await consultarEntitlement(42);
    expect(suspended).toMatchObject({ disponible: true, allowed: false, estadoAcceso: 'suspendido_total' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const unavailable = await consultarEntitlement(42);
    expect(unavailable).toMatchObject({ disponible: false, allowed: true });
  });
});
