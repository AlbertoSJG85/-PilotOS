'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getVehiculos, getMantenimientosVehiculo, resolverMantenimiento, updateMantenimientoVehiculo, crearMantenimientoPersonalizado } from '@/lib/api';
import { formatKm, formatDate } from '@/lib/utils';
import { getSessionUser } from '@/lib/auth';
import type { Vehiculo, MantenimientoVehiculo } from '@/types';

/**
 * Cómo se etiqueta un mantenimiento en la lista (2026-08-12).
 *
 * El estado de la base de datos no se puede enseñar tal cual, y esto costó un
 * susto: Alberto subió la factura del kit de distribución, se aplicó bien
 * —fecha 13/05/2026, próximo a 342.133 km— y aun así dijo "el mantenimiento
 * de distribución no se ha resuelto". Tenía razón en lo que veía: la pantalla
 * lo seguía enseñando en "Pendientes" con el mismo badge amarillo que uno que
 * no se ha hecho nunca.
 *
 * Y es que un mantenimiento recurrente NUNCA queda 'RESUELTO' en la base de
 * datos: al hacerlo, arranca un ciclo nuevo y vuelve a 'PENDIENTE' con su
 * próxima cita. 'RESUELTO' se lo quedan solo los que no se repiten (un
 * embrague). Enseñar ese estado en crudo hace que "hecho hace tres meses" y
 * "sin hacer jamás" se vean exactamente igual.
 *
 * Así que la etiqueta se calcula por lo que le importa a quien lo lee:
 * ¿toca ya? ¿está al día? ¿o no se ha hecho nunca?
 */
function etiquetaDe(m: MantenimientoVehiculo): { texto: string; variant: 'success' | 'warning' | 'danger' } {
  if (m.vencido_real || m.estado === 'VENCIDO') return { texto: 'TOCA YA', variant: 'danger' };
  if (m.estado === 'RESUELTO') return { texto: 'HECHO', variant: 'success' };
  if (m.ultima_ejecucion_fecha) return { texto: 'AL DÍA', variant: 'success' };
  return { texto: 'SIN HACER', variant: 'warning' };
}

export default function MantenimientosPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Record<string, MantenimientoVehiculo[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedVehiculo, setSelectedVehiculo] = useState<string | null>(null);
  const [user, setUser] = useState<ReturnType<typeof getSessionUser>>(null);
  const [tab, setTab] = useState<'caducado' | 'al_dia' | 'sin_configurar'>('caducado');

  // Estado para resolver
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resForm, setResForm] = useState({ importe: '', km_ejecucion: '', fecha_factura: new Date().toISOString().split('T')[0] });
  const [resLoading, setResLoading] = useState(false);

  // Estado para editar configuración
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  // Estado para añadir un mantenimiento propio (2026-08-13): lo que exige un
  // ayuntamiento no tiene por qué aplicarle a otro cliente, así que esto no
  // toca el catálogo global — crea uno visible solo para este cliente.
  const [addingCustom, setAddingCustom] = useState(false);
  const [customForm, setCustomForm] = useState({ nombre: '', tipo: 'POR_FECHA' as 'POR_KILOMETRAJE' | 'POR_FECHA' | 'SEGUN_USO', frecuencia_km: '', frecuencia_meses: '' });
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

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

  async function handleCrearCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVehiculo) return;
    setCustomError(null);
    if (!customForm.nombre.trim()) { setCustomError('Falta el nombre.'); return; }
    if (customForm.tipo === 'POR_KILOMETRAJE' && !customForm.frecuencia_km) {
      setCustomError('Indica cada cuántos km.'); return;
    }
    if (customForm.tipo === 'POR_FECHA' && !customForm.frecuencia_meses) {
      setCustomError('Indica cada cuántos meses.'); return;
    }
    setCustomLoading(true);
    try {
      const r = await crearMantenimientoPersonalizado(selectedVehiculo, {
        nombre: customForm.nombre.trim(),
        tipo: customForm.tipo,
        frecuencia_km: customForm.frecuencia_km ? parseInt(customForm.frecuencia_km, 10) : undefined,
        frecuencia_meses: customForm.frecuencia_meses ? parseInt(customForm.frecuencia_meses, 10) : undefined,
      });
      if (r.status !== 'OK') {
        setCustomError(r.error === 'ya_existe' ? 'Ya tienes un mantenimiento con ese nombre.' : 'No se pudo crear.');
        return;
      }
      setAddingCustom(false);
      setCustomForm({ nombre: '', tipo: 'POR_FECHA', frecuencia_km: '', frecuencia_meses: '' });
      await fetchData();
    } catch {
      setCustomError('No se pudo crear.');
    } finally {
      setCustomLoading(false);
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
  // Tres estados, no dos (2026-08-13, C-072: Alberto lo pidió por pestañas).
  // "Pendiente" en la base de datos no es ninguno de los tres tal cual (ver
  // etiquetaDe) — lo que separa las listas es si hay algo que hacer y por
  // qué, no el estado crudo:
  //   CADUCADO      → venció, hay que resolverlo ya.
  //   SIN CONFIGURAR → nunca se ha hecho Y no hay ninguna fecha/km calculado
  //                    (ni km ni meses de periodicidad) — no hay nada que
  //                    vigilar todavía porque no se sabe cada cuánto toca.
  //   AL DÍA        → todo lo demás: tiene una fecha/km futuro vigilado, o
  //                    ya se resolvió alguna vez y no toca de nuevo aún.
  const caducados = currentMants.filter((m) => m.vencido_real === true || m.estado === 'VENCIDO');
  const sinConfigurar = currentMants.filter(
    (m) => !caducados.includes(m) && !m.ultima_ejecucion_fecha && m.proximo_km == null && !m.proxima_fecha,
  );
  const alDia = currentMants.filter((m) => !caducados.includes(m) && !sinConfigurar.includes(m));

  const PESTAÑAS = [
    { id: 'caducado' as const, etiqueta: 'Caducado', lista: caducados },
    { id: 'al_dia' as const, etiqueta: 'Al día', lista: alDia },
    { id: 'sin_configurar' as const, etiqueta: 'Sin configurar', lista: sinConfigurar },
  ];
  const pestañaActual = PESTAÑAS.find((p) => p.id === tab) ?? PESTAÑAS[0];

  const isPatron = user?.es_patron || user?.role === 'admin';

  return (
    <>
      <PageHeader title="Mantenimientos" description="Seguimiento de revisiones, vencimientos y obligaciones" />

      {vehiculos.length === 0 ? (
        <Card className="py-8 text-center text-zinc-500">Sin vehiculos registrados</Card>
      ) : (
        <>
          {/* Vehicle selector + añadir mantenimiento propio */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {vehiculos.length > 1 ? (
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
            ) : <div />}

            {isPatron && selectedVehiculo && !addingCustom && (
              <Button size="sm" variant="outline" onClick={() => setAddingCustom(true)}>
                + Añadir mantenimiento
              </Button>
            )}
          </div>

          {/* Alta de un mantenimiento propio del cliente (2026-08-13): lo que
              exige un ayuntamiento no tiene por qué exigirlo otro. No toca el
              catálogo global, solo el de este cliente. */}
          {addingCustom && (
            <Card className="mb-6 flex flex-col gap-3">
              <p className="text-sm font-semibold text-pilot-lime">Nuevo mantenimiento (solo para ti)</p>
              <form onSubmit={handleCrearCustom} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] uppercase text-zinc-500">Nombre</label>
                    <Input
                      className="h-9 text-sm"
                      placeholder="p. ej. Inspección técnica autotaxi"
                      value={customForm.nombre}
                      onChange={(e) => setCustomForm({ ...customForm, nombre: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-zinc-500">Tipo</label>
                    <select
                      className="h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100"
                      value={customForm.tipo}
                      onChange={(e) => setCustomForm({ ...customForm, tipo: e.target.value as typeof customForm.tipo })}
                    >
                      <option value="POR_FECHA">Por fecha</option>
                      <option value="POR_KILOMETRAJE">Por kilometraje</option>
                      <option value="SEGUN_USO">Según uso</option>
                    </select>
                  </div>
                </div>

                {customForm.tipo === 'POR_FECHA' && (
                  <div className="w-40 space-y-1">
                    <label className="text-[10px] uppercase text-zinc-500">Cada cuántos meses</label>
                    <Input
                      type="number" className="h-9 text-sm" placeholder="12"
                      value={customForm.frecuencia_meses}
                      onChange={(e) => setCustomForm({ ...customForm, frecuencia_meses: e.target.value })}
                    />
                  </div>
                )}
                {customForm.tipo === 'POR_KILOMETRAJE' && (
                  <div className="w-40 space-y-1">
                    <label className="text-[10px] uppercase text-zinc-500">Cada cuántos km</label>
                    <Input
                      type="number" className="h-9 text-sm" placeholder="15000"
                      value={customForm.frecuencia_km}
                      onChange={(e) => setCustomForm({ ...customForm, frecuencia_km: e.target.value })}
                    />
                  </div>
                )}

                {customError && <p className="text-xs text-red-400">{customError}</p>}

                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" type="button" disabled={customLoading} onClick={() => { setAddingCustom(false); setCustomError(null); }}>
                    Cancelar
                  </Button>
                  <Button size="sm" type="submit" disabled={customLoading} className="bg-pilot-lime text-black hover:bg-pilot-lime/90">
                    Guardar
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Pestañas: caducado / al día / sin configurar (2026-08-13, C-072) */}
          <div className="mb-4 flex gap-1 border-b border-zinc-800">
            {PESTAÑAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTab(p.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === p.id
                    ? 'border-pilot-lime text-pilot-lime'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p.etiqueta} ({p.lista.length})
              </button>
            ))}
          </div>

          {pestañaActual.lista.length > 0 && (
            <div className="mb-6">
              <div className="space-y-2">
                {pestañaActual.lista.map((m) => (
                  <Card key={m.id} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{m.catalogo.nombre}</span>
                          <Badge variant={etiquetaDe(m).variant}>{etiquetaDe(m).texto}</Badge>
                          {!m.activo && <Badge variant="danger">INACTIVO</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500">
                          <span>{m.catalogo.tipo}</span>
                          {m.proximo_km != null && <span>Próximo: {formatKm(m.proximo_km)}</span>}
                          {m.proxima_fecha && <span>Fecha: {formatDate(m.proxima_fecha)}</span>}
                          {/* Cuándo se hizo la última vez. Sin esto, uno hecho
                              hace tres meses y uno sin hacer nunca se leen igual. */}
                          {m.ultima_ejecucion_fecha && (
                            <span className="text-emerald-400/80">
                              Hecho el {formatDate(m.ultima_ejecucion_fecha)}
                              {m.ultima_ejecucion_km != null && ` · ${formatKm(m.ultima_ejecucion_km)}`}
                            </span>
                          )}
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

          {currentMants.length === 0 ? (
            <Card className="py-8 text-center text-zinc-500">Sin mantenimientos registrados para este vehiculo</Card>
          ) : pestañaActual.lista.length === 0 && (
            <Card className="py-8 text-center text-zinc-500">
              {tab === 'caducado' && 'Nada caducado. Al día con todo.'}
              {tab === 'al_dia' && 'Nada al día todavía.'}
              {tab === 'sin_configurar' && 'Todo tiene una periodicidad configurada.'}
            </Card>
          )}
        </>
      )}
    </>
  );
}
