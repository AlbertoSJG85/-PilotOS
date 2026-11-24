import { prisma } from '../lib/prisma';
import { actualizarCantidadComponente, clavesComponentes, consultarEntitlement } from '../lib/nexos-pay';

/**
 * Plan del cliente en Pay, para saber con qué claves se factura. Si Pay no
 * responde o no lo conoce se devuelve null: se usan las claves de siempre, que
 * Pay valida (un plan que no corresponde se rechaza con 409, sin cobrar nada).
 */
async function planDeCliente(patronId: string | number): Promise<string | null> {
  const e = await consultarEntitlement(patronId);
  return e.disponible ? e.plan : null;
}

async function registrar(
  tipo: 'ASALARIADOS' | 'VEHICULOS',
  clienteId: string,
  patronId: string | number,
  cantidad: number,
  eventoId: string,
  result: { ok: boolean; motivo?: string },
): Promise<void> {
  const dedupe = `billing-${tipo.toLowerCase()}-${eventoId}-${result.ok ? 'ok' : 'fail'}`;
  await prisma.ledgerEvento.upsert({
    where: { dedupe_key: dedupe },
    create: {
      tipo_evento: result.ok ? `BILLING_${tipo}_SYNCED` : `BILLING_${tipo}_SYNC_FAILED`,
      source: 'PILOTOS',
      dedupe_key: dedupe,
      estado: result.ok ? 'OK' : 'WARN',
      datos: { cliente_id: clienteId, patron_id: patronId, cantidad, evento_id: eventoId, motivo: result.motivo },
    },
    update: {},
  });
}

/**
 * Publica en Pay la foto absoluta de asalariados activos. No incrementa ni
 * decrementa contadores: si se reintenta, el resultado económico es el mismo.
 */
export async function sincronizarCantidadAsalariados(clienteId: string, eventoId: string): Promise<void> {
  const [cliente, cantidad] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId }, select: { patron_id: true } }),
    prisma.conductor.count({ where: { cliente_id: clienteId, es_patron: false, activo: true } }),
  ]);
  if (!cliente) return;

  const claves = clavesComponentes(await planDeCliente(cliente.patron_id));
  const result = await actualizarCantidadComponente({
    externalId: cliente.patron_id,
    cantidad,
    eventoId,
    clave: claves.asalariados,
  });
  await registrar('ASALARIADOS', clienteId, cliente.patron_id, cantidad, eventoId, result);
}

/**
 * Publica en Pay los vehículos ADICIONALES (activos menos el primero, que va
 * incluido en la cuota). Solo existe en la tarifa única: con las tarifas
 * antiguas no se factura por vehículo y no se envía nada.
 */
export async function sincronizarCantidadVehiculos(clienteId: string, eventoId: string): Promise<void> {
  const [cliente, activos] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId }, select: { patron_id: true } }),
    prisma.vehiculo.count({ where: { cliente_id: clienteId, activo: true } }),
  ]);
  if (!cliente) return;

  const claves = clavesComponentes(await planDeCliente(cliente.patron_id));
  if (!claves.vehiculos) return;

  const adicionales = Math.max(0, activos - 1);
  const result = await actualizarCantidadComponente({
    externalId: cliente.patron_id,
    cantidad: adicionales,
    eventoId,
    clave: claves.vehiculos,
  });
  await registrar('VEHICULOS', clienteId, cliente.patron_id, adicionales, eventoId, result);
}
