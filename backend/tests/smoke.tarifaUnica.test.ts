// PilotOS Partners — tarifa única: claves de componentes por plan, vehículos
// adicionales y código de asociación. Sin red ni base de datos reales.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clienteFind: vi.fn(),
  vehiculoCount: vi.fn(),
  conductorCount: vi.fn(),
  ledgerUpsert: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    cliente: { findUnique: mocks.clienteFind },
    vehiculo: { count: mocks.vehiculoCount },
    conductor: { count: mocks.conductorCount },
    ledgerEvento: { upsert: mocks.ledgerUpsert },
  },
}));

import {
  actualizarCantidadComponente,
  clavesComponentes,
  PLAN_TARIFA_UNICA,
  provisionarCliente,
} from '../src/lib/nexos-pay';
import { limpiarCodigoAsociacion } from '../src/lib/codigo-asociacion';
import { sincronizarCantidadAsalariados, sincronizarCantidadVehiculos } from '../src/services/billing-sync.service';

function enablePay(): void {
  process.env.NEXOS_PAY_ENABLED = 'true';
  process.env.NEXOS_PAY_URL = 'https://pay.test';
  process.env.NEXOS_PAY_INTERNAL_TOKEN = 'test-token';
}

/** Responde al entitlement con un plan y registra cada llamada de cantidad. */
function payFalso(plan: string | null) {
  const llamadas: Array<{ url: string; body: any }> = [];
  const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
    if (String(url).includes('/entitlements')) {
      return new Response(JSON.stringify({ status: 'OK', plan, estado_pago: 'al_dia', estado_acceso: 'acceso_activo', limites: {}, acceso: { allowed: true } }), { status: 200 });
    }
    llamadas.push({ url: String(url), body: opts?.body ? JSON.parse(String(opts.body)) : null });
    return new Response(JSON.stringify({ status: 'OK' }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return llamadas;
}

beforeEach(() => {
  enablePay();
  mocks.clienteFind.mockResolvedValue({ patron_id: 42 });
  mocks.conductorCount.mockResolvedValue(2);
  mocks.vehiculoCount.mockResolvedValue(3);
  mocks.ledgerUpsert.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.NEXOS_PAY_ENABLED;
  delete process.env.NEXOS_PAY_URL;
  delete process.env.NEXOS_PAY_INTERNAL_TOKEN;
});

describe('claves de componentes por plan', () => {
  it('la tarifa única usa claves nuevas; las antiguas conservan la suya', () => {
    expect(clavesComponentes(PLAN_TARIFA_UNICA)).toEqual({ asalariados: 'asalariados_adicionales', vehiculos: 'vehiculos_adicionales' });
    for (const plan of ['pilotos_control', 'pilotos_pro', 'pilotos_basic', null, undefined]) {
      expect(clavesComponentes(plan)).toEqual({ asalariados: 'asalariados_facturables', vehiculos: null });
    }
  });
});

describe('sincronización de asalariados', () => {
  it('con la tarifa única factura con la clave nueva', async () => {
    const llamadas = payFalso(PLAN_TARIFA_UNICA);
    await sincronizarCantidadAsalariados('c1', 'ev-1');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].body).toMatchObject({ clave: 'asalariados_adicionales', cantidad: 2, external_id: '42' });
    expect(llamadas[0].body).not.toHaveProperty('precio_unitario');
  });

  it('un cliente de las tarifas antiguas sigue con su clave de siempre (no cambia de precio)', async () => {
    const llamadas = payFalso('pilotos_pro');
    await sincronizarCantidadAsalariados('c1', 'ev-2');
    expect(llamadas[0].body).toMatchObject({ clave: 'asalariados_facturables', cantidad: 2 });
  });

  it('si Pay no responde al consultar el plan, usa la clave de siempre y Pay valida', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (String(url).includes('/entitlements')) throw new Error('timeout');
      return new Response(JSON.stringify({ status: 'OK', echo: JSON.parse(String(opts?.body)) }), { status: 200 });
    }));
    await sincronizarCantidadAsalariados('c1', 'ev-3');
    expect(mocks.ledgerUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('vehículos adicionales', () => {
  it('3 vehículos activos = 2 adicionales (el primero va incluido)', async () => {
    const llamadas = payFalso(PLAN_TARIFA_UNICA);
    await sincronizarCantidadVehiculos('c1', 'v-1');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].body).toMatchObject({ clave: 'vehiculos_adicionales', cantidad: 2 });
  });

  it('un solo vehículo = 0 adicionales (valor absoluto, así baja la cuota)', async () => {
    mocks.vehiculoCount.mockResolvedValue(1);
    const llamadas = payFalso(PLAN_TARIFA_UNICA);
    await sincronizarCantidadVehiculos('c1', 'v-2');
    expect(llamadas[0].body).toMatchObject({ clave: 'vehiculos_adicionales', cantidad: 0 });
  });

  it('sin vehículos activos nunca envía un número negativo', async () => {
    mocks.vehiculoCount.mockResolvedValue(0);
    const llamadas = payFalso(PLAN_TARIFA_UNICA);
    await sincronizarCantidadVehiculos('c1', 'v-3');
    expect(llamadas[0].body.cantidad).toBe(0);
  });

  it('con las tarifas antiguas NO se factura por vehículo: no envía nada', async () => {
    const llamadas = payFalso('pilotos_control');
    await sincronizarCantidadVehiculos('c1', 'v-4');
    expect(llamadas).toHaveLength(0);
    expect(mocks.ledgerUpsert).not.toHaveBeenCalled();
  });

  it('si Pay no responde al consultar el plan, no envía nada (sin plan no se sabe si procede)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    await sincronizarCantidadVehiculos('c1', 'v-5');
    expect(mocks.ledgerUpsert).not.toHaveBeenCalled();
  });

  it('con Pay desactivado no hace nada ni lanza', async () => {
    delete process.env.NEXOS_PAY_ENABLED;
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(sincronizarCantidadVehiculos('c1', 'v-6')).resolves.toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('contrato con Pay', () => {
  it('actualizarCantidadComponente envía la clave pedida y nunca precios', async () => {
    const llamadas = payFalso(null);
    const r = await actualizarCantidadComponente({ externalId: 7, cantidad: 4, eventoId: 'x', clave: 'vehiculos_adicionales' });
    expect(r.ok).toBe(true);
    expect(llamadas[0].body).toMatchObject({ producto: 'pilotos', clave: 'vehiculos_adicionales', cantidad: 4 });
    expect(llamadas[0].body).not.toHaveProperty('precio_unitario');
  });

  it('el alta lleva el código de asociación solo si hay uno', async () => {
    const llamadas = payFalso(null);
    await provisionarCliente({ externalId: 1, email: 'a@gmail.com', nombre: 'A', codigoPartner: 'ASOC-TAXI' });
    await provisionarCliente({ externalId: 2, email: 'b@gmail.com', nombre: 'B' });
    await provisionarCliente({ externalId: 3, email: 'c@gmail.com', nombre: 'C', codigoPartner: null });
    expect(llamadas[0].body.codigo_partner).toBe('ASOC-TAXI');
    expect(llamadas[1].body).not.toHaveProperty('codigo_partner');
    expect(llamadas[2].body).not.toHaveProperty('codigo_partner');
  });

  it('el código no cambia el plan ni añade exención o descuento', async () => {
    const llamadas = payFalso(null);
    await provisionarCliente({ externalId: 1, email: 'a@gmail.com', nombre: 'A', codigoPartner: 'ASOC' });
    expect(llamadas[0].body.plan).toBe('pilotos_control');
    expect(llamadas[0].body).not.toHaveProperty('precio_mensual_aplicado');
    expect(llamadas[0].body.tipo_exencion).toBe('fase_prueba');
  });
});

describe('código de asociación', () => {
  it.each([
    ['asoc-taxi', 'ASOC-TAXI'],
    ['  ASOC_1 ', 'ASOC_1'],
    ['T-ABCD', 'T-ABCD'],
  ])('acepta %s', (entrada, esperado) => {
    expect(limpiarCodigoAsociacion(entrada)).toBe(esperado);
  });

  it.each([[''], ['   '], ['con espacio'], ['ñandú'], ['x'.repeat(65)], ['<script>'], [null], [undefined], [42]])(
    'descarta %s sin lanzar',
    (entrada) => {
      expect(limpiarCodigoAsociacion(entrada)).toBeNull();
    },
  );
});
