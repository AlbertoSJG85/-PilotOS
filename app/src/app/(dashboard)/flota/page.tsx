'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getVehiculos, createVehiculo, updateVehiculo, getUsuarios } from '@/lib/api';
import { ConductoresFlota } from '@/components/features/conductores-flota';
import { formatKm } from '@/lib/utils';
import type { Vehiculo, Conductor } from '@/types';


export default function FlotaPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showVehiculoForm, setShowVehiculoForm] = useState(false);
  const [formVehiculo, setFormVehiculo] = useState<Partial<Vehiculo>>({});
  const [errorVehiculo, setErrorVehiculo] = useState<string | null>(null);

  const abrirFormVehiculo = (v: Partial<Vehiculo>) => {
    setErrorVehiculo(null);
    setFormVehiculo(v);
    setShowVehiculoForm(true);
  };

  // `silencioso`: recarga sin tapar la pantalla con el esqueleto, para no cerrar
  // formularios abiertos (p. ej. el de conductores) cuando algo cambia.
  const loadData = (silencioso = false) => {
    if (!silencioso) setLoading(true);
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
      setErrorVehiculo(null);
      if (formVehiculo.id) {
        await updateVehiculo(formVehiculo.id, formVehiculo);
      } else {
        if (!formVehiculo.matricula?.trim() || !formVehiculo.marca?.trim() || !formVehiculo.modelo?.trim()) {
          setErrorVehiculo('Faltan la matrícula, la marca o el modelo.');
          return;
        }
        if (!formVehiculo.fecha_matriculacion) {
          setErrorVehiculo('Indica la fecha de matriculación.');
          return;
        }
        await createVehiculo({
          tipo_combustible: 'DIESEL',
          tipo_transmision: 'MANUAL',
          km_actuales: 0,
          ...formVehiculo,
        });
      }
      setShowVehiculoForm(false);
      setFormVehiculo({});
      loadData();
    } catch (e: unknown) {
      setErrorVehiculo(e instanceof Error ? e.message : 'No se pudo guardar el vehículo.');
    }
  };

  const handleToggleVehiculoActivo = async (v: Vehiculo) => {
    if (confirm(`¿Estás seguro de ${v.activo ? 'desactivar' : 'activar'} este vehículo?`)) {
      try {
        await updateVehiculo(v.id, { activo: !v.activo });
        loadData();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado del vehículo.');
      }
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
          <Button variant="outline" className="mt-4" onClick={() => loadData()}>Reintentar</Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* === SECCIÓN VEHÍCULOS === */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">Vehículos</h2>
            <Button size="sm" onClick={() => abrirFormVehiculo({})}>
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
                  <select
                    aria-label="Combustible"
                    className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                    value={formVehiculo.tipo_combustible || 'DIESEL'}
                    onChange={(e) => setFormVehiculo({ ...formVehiculo, tipo_combustible: e.target.value })}
                  >
                    <option value="DIESEL">Diesel</option>
                    <option value="GASOLINA">Gasolina</option>
                    <option value="HIBRIDO">Híbrido</option>
                    <option value="ELECTRICO">Eléctrico</option>
                    <option value="GLP">GLP</option>
                  </select>
                  <select
                    aria-label="Transmisión"
                    className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                    value={formVehiculo.tipo_transmision || 'MANUAL'}
                    onChange={(e) => setFormVehiculo({ ...formVehiculo, tipo_transmision: e.target.value })}
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="AUTOMATICA">Automático</option>
                  </select>
                  <Input type="number" placeholder="KM Actuales" value={formVehiculo.km_actuales || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, km_actuales: Number(e.target.value) })} />
                  <Input type="date" placeholder="Fecha Matriculación" value={(formVehiculo.fecha_matriculacion as string) || ''} onChange={(e) => setFormVehiculo({ ...formVehiculo, fecha_matriculacion: e.target.value })} />
                </>
              )}
              {errorVehiculo && <p className="text-sm font-medium text-red-400">{errorVehiculo}</p>}
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
                      <Button size="sm" variant="ghost" onClick={() => abrirFormVehiculo(v)}>Edit</Button>
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
                    <p className="text-sm text-zinc-300">
                      {(() => {
                        const nombres = conductores
                          .filter((c) => c.activo && (c.vehiculosAsignados ?? []).some((va) => va.vehiculo.id === v.id))
                          .map((c) => c.usuario.nombre);
                        return nombres.length > 0 ? nombres.join(', ') : 'Ninguno todavía';
                      })()}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-600">Se cambian al editar cada conductor.</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* === SECCIÓN CONDUCTORES === */}
        <ConductoresFlota vehiculos={vehiculos} onCambio={() => loadData(true)} />
      </div>
    </>
  );
}
