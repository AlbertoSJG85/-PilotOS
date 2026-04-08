'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button } from '@/components/ui';
import { getVehiculos, getMe } from '@/lib/api';
import { formatKm } from '@/lib/utils';
import type { Vehiculo } from '@/types';

interface ConductorInfo {
  id: string;
  nombre: string;
  telefono: string;
  es_patron: boolean;
}

export default function FlotaPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [conductores, setConductores] = useState<ConductorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getVehiculos().then((r) => { if (r.data) setVehiculos(r.data); }),
      getMe().then((r) => { if (r.conductores) setConductores(r.conductores); }),
    ])
      .then(() => setError(null))
      .catch((err) => setError(err.message || 'Error al cargar los datos de la flota.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Flota" description="Vehiculos, conductores y configuracion economica" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Flota" description="Vehiculos, conductores y configuracion economica" />

      {error && (
        <Card className="mb-6 py-6 text-center border-red-500/20 bg-red-500/5">
          <p className="text-red-400 font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Reintentar</Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Vehiculos */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Vehiculos</h2>
          {vehiculos.length === 0 ? (
            <Card className="py-8 text-center text-zinc-500">Sin vehiculos registrados</Card>
          ) : (
            <div className="space-y-2">
              {vehiculos.map((v) => (
                <Card key={v.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-zinc-100">{v.matricula}</span>
                    <Badge variant={v.activo ? 'success' : 'danger'}>
                      {v.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-zinc-400">{v.marca} {v.modelo}</p>
                  <div className="flex flex-wrap gap-x-4 text-xs text-zinc-500">
                    <span>{formatKm(v.km_actuales)}</span>
                    {v.tipo_combustible && <span>{v.tipo_combustible}</span>}
                    {v.tipo_transmision && <span>{v.tipo_transmision}</span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Conductores */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Conductores</h2>
          {conductores.length === 0 ? (
            <Card className="py-8 text-center text-zinc-500">Sin conductores</Card>
          ) : (
            <div className="space-y-2">
              {conductores.map((c) => (
                <Card key={c.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-zinc-100">{c.nombre}</p>
                    <p className="text-sm text-zinc-500">{c.telefono}</p>
                  </div>
                  <Badge variant={c.es_patron ? 'warning' : 'info'}>
                    {c.es_patron ? 'Propietario' : 'Asalariado'}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
