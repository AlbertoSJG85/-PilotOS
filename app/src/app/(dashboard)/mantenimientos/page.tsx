'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getVehiculos, getMantenimientosVehiculo, resolverMantenimiento, updateMantenimientoVehiculo } from '@/lib/api';
import { formatKm, formatDate } from '@/lib/utils';
import { getSessionUser } from '@/lib/auth';
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
  const [user, setUser] = useState<ReturnType<typeof getSessionUser>>(null);

  // Estado para resolver
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resForm, setResForm] = useState({ importe: '', km_ejecucion: '', fecha_factura: new Date().toISOString().split('T')[0] });
  const [resLoading, setResLoading] = useState(false);

  // Estado para editar configuración
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  async function fetchData() {
    setLoading(true);
    setUser(getSessionUser());
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

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setResLoading(true);
    try {
      await updateMantenimientoVehiculo(editingId, editForm);
      setEditingId(null);
      setEditForm(null);
      await fetchData();
    } catch (err) {
      alert('Error al actualizar la configuración');
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

  const isPatron = user?.es_patron || user?.role === 'admin';

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
                  <Card key={m.id} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{m.catalogo.nombre}</span>
                          <Badge variant={ESTADO_BADGE[m.estado]}>{m.estado}</Badge>
                          {!m.activo && <Badge variant="danger">INACTIVO</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500">
                          <span>{m.catalogo.tipo}</span>
                          {m.proximo_km != null && <span>Próximo: {formatKm(m.proximo_km)}</span>}
                          {m.proxima_fecha && <span>Fecha: {formatDate(m.proxima_fecha)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {isPatron && editingId !== m.id && resolvingId !== m.id && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingId(m.id);
                            setEditForm({
                              activo: m.activo,
                              frecuencia_km_personalizada: m.frecuencia_km_personalizada,
                              frecuencia_meses_personalizada: m.frecuencia_meses_personalizada,
                              proximo_km: m.proximo_km,
                              proxima_fecha: m.proxima_fecha ? m.proxima_fecha.split('T')[0] : '',
                              ultima_ejecucion_km: m.ultima_ejecucion_km,
                              ultima_ejecucion_fecha: m.ultima_ejecucion_fecha ? m.ultima_ejecucion_fecha.split('T')[0] : ''
                            });
                          }}>
                            Editar
                          </Button>
                        )}
                        {resolvingId !== m.id && editingId !== m.id && (
                          <Button size="sm" variant="outline" onClick={() => setResolvingId(m.id)} className="border-pilot-lime text-pilot-lime hover:bg-pilot-lime/10">
                            Resolver
                          </Button>
                        )}
                      </div>
                    </div>

                    {resolvingId === m.id && (
                      <form onSubmit={(e) => handleResolver(e, m.id)} className="flex flex-col gap-2 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                        <p className="text-xs font-semibold text-pilot-lime mb-1">Cerrar Mantenimiento</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Importe €"
                            type="number" step="0.01" min="0"
                            className="w-full h-8 text-xs"
                            value={resForm.importe} onChange={(e) => setResForm({ ...resForm, importe: e.target.value })}
                          />
                          <Input
                            placeholder="Km Actuales"
                            type="number"
                            className="w-full h-8 text-xs"
                            value={resForm.km_ejecucion} onChange={(e) => setResForm({ ...resForm, km_ejecucion: e.target.value })}
                          />
                        </div>
                        <Input
                          type="date"
                          className="w-full h-8 text-xs"
                          value={resForm.fecha_factura} onChange={(e) => setResForm({ ...resForm, fecha_factura: e.target.value })}
                        />
                        <div className="flex gap-2 justify-end mt-1">
                          <Button size="sm" variant="ghost" onClick={() => setResolvingId(null)} disabled={resLoading} className="h-7 text-xs">Cancelar</Button>
                          <Button size="sm" type="submit" disabled={resLoading} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">Guardar</Button>
                        </div>
                      </form>
                    )}

                    {editingId === m.id && (
                      <form onSubmit={handleUpdate} className="flex flex-col gap-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                        <p className="text-xs font-semibold text-pilot-lime">Personalizar Configuración</p>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase">Estado</label>
                            <select 
                              className="w-full h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                              value={editForm.activo ? 'true' : 'false'}
                              onChange={(e) => setEditForm({ ...editForm, activo: e.target.value === 'true' })}
                            >
                              <option value="true">Activo</option>
                              <option value="false">Inactivo</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase">
                              {m.catalogo.tipo === 'POR_FECHA' ? 'Frecuencia (meses)' : 'Frecuencia (km)'}
                            </label>
                            <p className="text-[10px] text-zinc-400 italic">
                              Default: {m.catalogo.tipo === 'POR_FECHA' 
                                ? `${m.catalogo.frecuencia_meses || '?'} meses` 
                                : `${(m.catalogo.frecuencia_km || 0).toLocaleString('es-ES')} km`}
                            </p>
                            {m.catalogo.tipo === 'POR_FECHA' ? (
                              <select 
                                className="w-full h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                                value={editForm.frecuencia_meses_personalizada || ''}
                                onChange={(e) => {
                                  const val = e.target.value ? parseInt(e.target.value) : null;
                                  const fMeses = val || m.catalogo.frecuencia_meses;
                                  let next = editForm.proxima_fecha;
                                  if (editForm.ultima_ejecucion_fecha && fMeses) {
                                    const d = new Date(editForm.ultima_ejecucion_fecha);
                                    d.setMonth(d.getMonth() + fMeses);
                                    next = d.toISOString().split('T')[0];
                                  }
                                  setEditForm({ ...editForm, frecuencia_meses_personalizada: val, proxima_fecha: next });
                                }}
                              >
                                <option value="">Usar valor por defecto</option>
                                <option value="1">Mensual (1)</option>
                                <option value="3">Trimestral (3)</option>
                                <option value="6">Semestral (6)</option>
                                <option value="12">Anual (12)</option>
                                <option value="24">Bienal (24)</option>
                              </select>
                            ) : (
                              <Input
                                type="number" className="h-8 text-xs"
                                placeholder="Vacío para usar defecto"
                                value={editForm.frecuencia_km_personalizada || ''}
                                onChange={(e) => {
                                  const val = e.target.value ? parseInt(e.target.value) : null;
                                  const fKm = val || m.frecuencia_aprendida || m.catalogo.frecuencia_km;
                                  let next = editForm.proximo_km;
                                  if (editForm.ultima_ejecucion_km != null && fKm != null) {
                                    next = editForm.ultima_ejecucion_km + fKm;
                                  }
                                  setEditForm({ ...editForm, frecuencia_km_personalizada: val, proximo_km: next });
                                }}
                              />
                            )}
                            <p className="text-[9px] text-zinc-500">Déjalo vacío para usar la frecuencia del catálogo.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase">Próximo Cambio (km)</label>
                            <Input
                              type="number" className="h-8 text-xs"
                              value={editForm.proximo_km || ''}
                              onChange={(e) => setEditForm({ ...editForm, proximo_km: e.target.value ? parseInt(e.target.value) : null })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase">Próxima Fecha</label>
                            <Input
                              type="date" className="h-8 text-xs"
                              value={editForm.proxima_fecha || ''}
                              onChange={(e) => setEditForm({ ...editForm, proxima_fecha: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase">Último Cambio (km)</label>
                            <Input
                              type="number" className="h-8 text-xs"
                              value={editForm.ultima_ejecucion_km || ''}
                              onChange={(e) => {
                                const uKm = e.target.value ? parseInt(e.target.value) : null;
                                const fKm = editForm.frecuencia_km_personalizada || m.frecuencia_aprendida || m.catalogo.frecuencia_km;
                                let next = editForm.proximo_km;
                                if (uKm != null && fKm != null) next = uKm + fKm;
                                setEditForm({ ...editForm, ultima_ejecucion_km: uKm, proximo_km: next });
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 uppercase">Última Fecha</label>
                            <Input
                              type="date" className="h-8 text-xs"
                              value={editForm.ultima_ejecucion_fecha || ''}
                              onChange={(e) => {
                                const uFecha = e.target.value;
                                const fMeses = editForm.frecuencia_meses_personalizada || m.catalogo.frecuencia_meses;
                                let next = editForm.proxima_fecha;
                                if (uFecha && fMeses != null) {
                                  const d = new Date(uFecha);
                                  d.setMonth(d.getMonth() + fMeses);
                                  next = d.toISOString().split('T')[0];
                                }
                                setEditForm({ ...editForm, ultima_ejecucion_fecha: uFecha, proxima_fecha: next });
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end mt-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={resLoading} className="h-7 text-xs">Cancelar</Button>
                          <Button size="sm" type="submit" disabled={resLoading} className="h-7 text-xs bg-pilot-lime hover:bg-pilot-lime/90 text-black">Actualizar</Button>
                        </div>
                      </form>
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
