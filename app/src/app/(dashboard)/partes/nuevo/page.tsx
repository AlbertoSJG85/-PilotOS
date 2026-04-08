'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { FormularioParte } from '@/components/features/formulario-parte';
import { Skeleton } from '@/components/ui';
import { getMe } from '@/lib/api';
import type { Vehiculo } from '@/types';

export default function NuevoPartePage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => {
        if (res.vehiculos) {
          setVehiculos(res.vehiculos.map((v) => ({ ...v, cliente_id: '', activo: true })));
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Nuevo Parte Diario" description="Registra tu jornada de trabajo" />
      {loading ? (
        <div className="mx-auto max-w-lg space-y-4">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : vehiculos.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-8 text-center">
          <p className="text-zinc-400">No tienes vehiculos asignados. Contacta con tu propietario.</p>
        </div>
      ) : (
        <FormularioParte vehiculos={vehiculos} />
      )}
    </>
  );
}
