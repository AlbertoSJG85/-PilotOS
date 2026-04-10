'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FormularioParte } from '@/components/features/formulario-parte';
import { getMe } from '@/lib/api';
import type { Vehiculo } from '@/types';

export default function NuevoParteConductor() {
  const router = useRouter();
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => {
        if (res.vehiculos) {
          setVehiculos(res.vehiculos.map((v) => ({ ...v, cliente_id: '', activo: true })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur px-4 py-4 pt-safe-top">
        <button
          onClick={() => router.push('/conductor')}
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-zinc-100">Nuevo Parte Diario</h1>
          <p className="text-xs text-zinc-500">Registra tu jornada</p>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-pilot-lime border-t-transparent" />
            <p className="text-sm text-zinc-500">Cargando datos del vehículo...</p>
          </div>
        ) : vehiculos.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center">
            <p className="text-zinc-400 font-medium">Sin vehículo asignado</p>
            <p className="text-sm text-zinc-600 mt-2">Contacta con tu propietario para que te asigne un vehículo.</p>
          </div>
        ) : (
          <FormularioParte vehiculos={vehiculos} returnPath="/conductor" />
        )}
      </div>
    </div>
  );
}
