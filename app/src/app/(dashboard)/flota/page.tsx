'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getVehiculos, createVehiculo, updateVehiculo, assignVehiculoConductor, getUsuarios, createConductor, updateConductor } from '@/lib/api';
import { formatKm } from '@/lib/utils';
import type { Vehiculo } from '@/types';

interface ConductorInfo {
  id: string;
  cliente_id: string;
  usuario_id: number;
  es_patron: boolean;
  activo: boolean;
  usuario: {
    id: number;
    nombre: string;
    telefono: string;
    role: string;
  };
  vehiculosAsignados: {
    vehiculo: {
      id: string;
      matricula: string;
    };
  }[];
}

export default function FlotaPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [conductores, setConductores] = useState<ConductorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showVehiculoForm, setShowVehiculoForm] = useState(false);
  const [showConductorForm, setShowConductorForm] = useState(false);
  const [formVehiculo, setFormVehiculo] = useState<Partial<Vehiculo>>({});
  const [formConductor, setFormConductor] = useState<any>({});

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getVehiculos().then((r) => { if (r.data) setVehiculos(r.data); }),
      getUsuarios().then((r) => { if (r.data) setConductores(r.data); }),
    ])
      .then(() => setError(null))
      .catch((err) => setError(err.message || 'Error al cargar los datos de la flota.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveVehiculo = async () => {
    try {
      if (formVehiculo.id) {
        await updateVehiculo(formVehiculo.id, formVehiculo);
      } else {
        await createVehiculo(formVehiculo);
      }
      setShowVehiculoForm(false);
      setFormVehiculo({});
      loadData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const handleToggleVehiculoActivo = async (v: Vehiculo) => {
    if (confirm(`¿Estás seguro de ${v.activo ? 'desactivar' : 'activar'} este vehículo?`)) {
      try {
        await updateVehiculo(v.id, { activo: !v.activo });
        loadData();
      } catch (e: any) {
        alert('Error: ' + e.message);
      }
    }
  };

  const handleSaveConductor = async () => {
    try {
      if (formConductor.id) {
        await updateConductor(formConductor.id, formConductor);
      } else {
        await createConductor(formConductor);
      }
      setShowConductorForm(false);
      setFormConductor({});
      loadData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const handleToggleConductorActivo = async (c: ConductorInfo) => {
    if (confirm(`¿Estás seguro de ${c.activo ? 'desactivar' : 'activar'} este conductor?`)) {
      try {
        await updateConductor(c.id, { activo: !c.activo });
        loadData();
      } catch (e: any) {
        alert('Error: ' + e.message);
      }
    }
  };

  const handleAssignVehiculo = async (vehiculo_id: string, conductor_ids: string[]) => {
    try {
      await assignVehiculoConductor(vehiculo_id, conductor_ids);
      loadData();
    } catch(e: any) {
      alert('Error: ' + e.message);
    }
  };

  if (loading && vehiculos.length === 0) {
    return (
      <>
        <PageHeader title="Flota" description="Gestión de vehículos y conductores" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Flota" description="Gestión de vehículos y conductores" />

      {error && (
        <Card className="mb-6 py-6 text-center border-red-500/20 bg-red-500/5">
          <p className="text-red-400 font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadData}>Reintentar</Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* === SECCIÓN VEHÍCULOS === */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">Vehículos</h2>
            <Button size="sm" onClick={() => { setFormVehiculo({}); setShowVehiculoForm(true); }}>
              Añadir vehículo
            </Button>
          </div>

          {showVehiculoForm && (
            <Card className="mb-4 space-y-4 p-4 border border-blue-500/30">
              <h3 className="font-medium text-white">{formVehiculo.id ? 'Editar' : 'Añadir'} Vehículo</h3>
              <Input placeholder="Matrícula" value={formVehiculo.matricula || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, matricula: e.target.value })} />
              <Input placeholder="Marca" value={formVehiculo.marca || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, marca: e.target.value })} />
              <Input placeholder="Modelo" value={formVehiculo.modelo || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, modelo: e.target.value })} />
              {!formVehiculo.id && (
                <>
                  <Input type="number" placeholder="KM Actuales" value={formVehiculo.km_actuales || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, km_actuales: Number(e.target.value) })} />
                  <Input type="date" placeholder="Fecha Matriculación" value={formVehiculo.fecha_matriculacion as any || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, fecha_matriculacion: e.target.value as any })} />
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveVehiculo}>Guardar</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowVehiculoForm(false)}>Cancelar</Button>
              </div>
            </Card>
          )}

          {vehiculos.length === 0 ? (
            <Card className="py-8 text-center text-zinc-500">Sin vehículos registrados</Card>
          ) : (
            <div className="space-y-3">
              {vehiculos.map((v) => (
                <Card key={v.id} className={`space-y-2 ${!v.activo ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-zinc-100">{v.matricula}</span>
                    <div className="flex gap-2 items-center">
                      <Badge variant={v.activo ? 'success' : 'danger'}>
                        {v.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => { setFormVehiculo(v); setShowVehiculoForm(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleToggleVehiculoActivo(v)}>{v.activo ? 'Desactivar' : 'Activar'}</Button>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400">{v.marca} {v.modelo}</p>
                  <div className="flex flex-wrap gap-x-4 text-xs text-zinc-500">
                    <span>{formatKm(v.km_actuales)}</span>
                    {v.tipo_combustible && <span>{v.tipo_combustible}</span>}
                    {v.tipo_transmision && <span>{v.tipo_transmision}</span>}
                  </div>
                  <div className="pt-2 border-t border-white/10 mt-2">
                    <p className="text-xs font-medium text-zinc-400 mb-1">Conductores asignados:</p>
                    <div className="flex gap-2 items-center">
                      <select 
                        className="bg-zinc-800 text-sm p-1 rounded border border-zinc-700 flex-1 text-white"
                        onChange={(e) => handleAssignVehiculo(v.id, Array.from(e.target.selectedOptions, option => option.value))}
                        multiple
                        size={2}
                        defaultValue={v.conductores?.map((c: any) => c.conductor_id) || []}
                      >
                        {conductores.filter(c => c.activo).map(c => (
                          <option key={c.id} value={c.id}>{c.usuario.nombre}</option>
                        ))}
                      </select>
                      <span className="text-xs text-zinc-500">Ctrl+Click multi</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* === SECCIÓN CONDUCTORES === */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">Conductores</h2>
            <Button size="sm" onClick={() => { setFormConductor({}); setShowConductorForm(true); }}>
              Añadir conductor
            </Button>
          </div>

          {showConductorForm && (
            <Card className="mb-4 space-y-4 p-4 border border-blue-500/30">
              <h3 className="font-medium text-white">{formConductor.id ? 'Editar' : 'Añadir'} Conductor</h3>
              <Input placeholder="Nombre" value={formConductor.nombre || ''} onChange={(e) => setFormConductor({ ...formConductor, nombre: e.target.value })} />
              <Input placeholder="Teléfono" value={formConductor.telefono || ''} onChange={(e) => setFormConductor({ ...formConductor, telefono: e.target.value })} />
              {!formConductor.id && (
                <>
                  <Input type="email" placeholder="Email (Opcional)" value={formConductor.email || ''} onChange={(e) => setFormConductor({ ...formConductor, email: e.target.value })} />
                  <Input type="number" placeholder="Porcentaje conductor (%)" value={formConductor.porcentaje_conductor || 50} onChange={(e) => setFormConductor({ ...formConductor, porcentaje_conductor: Number(e.target.value) })} />
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveConductor}>Guardar</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowConductorForm(false)}>Cancelar</Button>
              </div>
            </Card>
          )}

          {conductores.length === 0 ? (
            <Card className="py-8 text-center text-zinc-500">Sin conductores registrados</Card>
          ) : (
            <div className="space-y-3">
              {conductores.map((c) => (
                <Card key={c.id} className={`flex flex-col gap-2 ${!c.activo ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-100">{c.usuario?.nombre}</p>
                      <p className="text-sm text-zinc-500">{c.usuario?.telefono}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge variant={c.es_patron ? 'warning' : 'info'}>
                        {c.es_patron ? 'Propietario' : 'Asalariado'}
                      </Badge>
                      <Badge variant={c.activo ? 'success' : 'danger'}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-1 border-t border-white/5 pt-2">
                     <Button size="sm" variant="ghost" onClick={() => { setFormConductor({ id: c.id, nombre: c.usuario.nombre, telefono: c.usuario.telefono }); setShowConductorForm(true); }}>Edit</Button>
                     <Button size="sm" variant="ghost" onClick={() => handleToggleConductorActivo(c)}>{c.activo ? 'Desactivar' : 'Activar'}</Button>
                  </div>
                  {c.vehiculosAsignados?.length > 0 && (
                     <div className="text-xs text-zinc-500">
                       Vehículos asignados: {c.vehiculosAsignados.map(va => va.vehiculo.matricula).join(', ')}
                     </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
