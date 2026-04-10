'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getVehiculos, getMantenimientosVehiculo, resolverMantenimiento } from '@/lib/api';
import { formatKm, formatDate } from '@/lib/utils';
import type { Vehiculo, MantenimientoVehiculo } from '@/types';

const ESTADO_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  PENDIENTE: 'warning',
  VENCIDO: 'danger',
  RESUELTO: 'success',
};

export default function MantenimientosPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Record<string, MantenimientoVehiculo[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedVehiculo, setSelectedVehiculo] = useState<string | null>(null);

  // Estado para resolver
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resForm, setResForm] = useState({ importe: '', km_ejecucion: '', fecha_factura: new Date().toISOString().split('T')[0] });
  const [resLoading, setResLoading] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const r = await getVehiculos();
      if (!r.data || r.data.length === 0) return;
      setVehiculos(r.data);
      if (!selectedVehiculo) setSelectedVehiculo(r.data[0].id);

      const entries = await Promise.all(
        r.data.map(async (v) => {
          try {
            const mRes = await getMantenimientosVehiculo(v.id);
            return [v.id, mRes.data || []] as const;
          } catch {
            return [v.id, []] as const;
          }
        }),
      );
      setMantenimientos(Object.fromEntries(entries));
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleResolver(e: React.FormEvent, id: string) {
    e.preventDefault();
    setResLoading(true);
    try {
      await resolverMantenimiento(id, {
        importe: resForm.importe ? parseFloat(resForm.importe) : undefined,
        km_ejecucion: resForm.km_ejecucion ? parseInt(resForm.km_ejecucion, 10) : undefined,
        fecha_factura: resForm.fecha_factura,
      });
      setResolvingId(null);
      setResForm({ importe: '', km_ejecucion: '', fecha_factura: new Date().toISOString().split('T')[0] });
      await fetchData(); // Refetch data to update lists
    } catch (err) {
      alert('Error al resolver el mantenimiento');
    } finally {
      setResLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Mantenimientos" description="Seguimiento de revisiones, vencimientos y obligaciones" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </>
    );
  }

  const currentMants = selectedVehiculo ? (mantenimientos[selectedVehiculo] || []) : [];
  const pendientes = currentMants.filter((m) => m.estado !== 'RESUELTO');
  const resueltos = currentMants.filter((m) => m.estado === 'RESUELTO');

  return (
    <>
      <PageHeader title="Mantenimientos" description="Seguimiento de revisiones, vencimientos y obligaciones" />

      {vehiculos.length === 0 ? (
        <Card className="py-8 text-center text-zinc-500">Sin vehiculos registrados</Card>
      ) : (
        <>
          {/* Vehicle selector */}
          {vehiculos.length > 1 && (
            <div className="mb-4">
              <select
                className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-pilot-lime focus:outline-none"
                value={selectedVehiculo || ''}
                onChange={(e) => setSelectedVehiculo(e.target.value)}
              >
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.matricula} — {v.marca} {v.modelo}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pending / overdue */}
          {pendientes.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-zinc-100">
                Pendientes ({pendientes.length})
              </h2>
              <div className="space-y-2">
                {pendientes.map((m) => (
                  <Card key={m.id} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-100">{m.catalogo.nombre}</span>
                        <Badge variant={ESTADO_BADGE[m.estado]}>{m.estado}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500">
                        <span>{m.catalogo.tipo}</span>
                        {m.proximo_km != null && <span>Proximo: {formatKm(m.proximo_km)}</span>}
                        {m.proxima_fecha && <span>Fecha: {formatDate(m.proxima_fecha)}</span>}
                      </div>
                    </div>
                    {resolvingId === m.id ? (
                      <form onSubmit={(e) => handleResolver(e, m.id)} className="shrink-0 flex flex-col gap-2 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Importe € (Opcional)"
                            type="number" step="0.01" min="0"
                            className="w-32 h-8 text-xs"
                            value={resForm.importe} onChange={(e) => setResForm({ ...resForm, importe: e.target.value })}
                          />
                          <Input
                            placeholder="Km Actuales (Opcional)"
                            type="number"
                            className="w-36 h-8 text-xs"
                            value={resForm.km_ejecucion} onChange={(e) => setResForm({ ...resForm, km_ejecucion: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="date"
                            className="w-full h-8 text-xs"
                            value={resForm.fecha_factura} onChange={(e) => setResForm({ ...resForm, fecha_factura: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2 justify-end mt-1">
                          <Button size="sm" variant="ghost" onClick={() => setResolvingId(null)} disabled={resLoading} className="h-7 text-xs">Cancelar</Button>
                          <Button size="sm" type="submit" disabled={resLoading} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700">Guardar</Button>
                        </div>
                      </form>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setResolvingId(m.id)}>
                        Resolver
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Resolved */}
          {resueltos.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-zinc-100">
                Resueltos ({resueltos.length})
              </h2>
              <div className="space-y-2">
                {resueltos.map((m) => (
                  <Card key={m.id} className="flex items-center justify-between gap-4 opacity-60">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-100">{m.catalogo.nombre}</span>
                        <Badge variant="success">RESUELTO</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500">
                        {m.ultima_ejecucion_km != null && <span>Ultimo: {formatKm(m.ultima_ejecucion_km)}</span>}
                        {m.ultima_ejecucion_fecha && <span>{formatDate(m.ultima_ejecucion_fecha)}</span>}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {currentMants.length === 0 && (
            <Card className="py-8 text-center text-zinc-500">Sin mantenimientos registrados para este vehiculo</Card>
          )}
        </>
      )}
    </>
  );
}
