import { prisma } from '../lib/prisma';
import { actualizarCantidadAsalariados } from '../lib/nexos-pay';

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

  const result = await actualizarCantidadAsalariados({
    externalId: cliente.patron_id,
    cantidad,
    eventoId,
  });
  await prisma.ledgerEvento.upsert({
    where: { dedupe_key: `billing-asalariados-${eventoId}-${result.ok ? 'ok' : 'fail'}` },
    create: {
      tipo_evento: result.ok ? 'BILLING_ASALARIADOS_SYNCED' : 'BILLING_ASALARIADOS_SYNC_FAILED',
      source: 'PILOTOS',
      dedupe_key: `billing-asalariados-${eventoId}-${result.ok ? 'ok' : 'fail'}`,
      estado: result.ok ? 'OK' : 'WARN',
      datos: { cliente_id: clienteId, patron_id: cliente.patron_id, cantidad, evento_id: eventoId, motivo: result.motivo },
    },
    update: {},
  });
}
