'use client';

/**
 * Panel del asalariado (2026-08-12).
 *
 * La home suya es para TRABAJAR: registrar el parte del día. Todo lo demás
 * —cómo va el mes, su vehículo, sus últimos partes, subir un papel del
 * taxi— vive aquí, a un toque. Decisión de Alberto, y es la simétrica de la
 * del dueño: cada uno arranca en lo que va a hacer el 90% de las veces.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPartes, getMe } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowLeft, ArrowRight, FileText, CheckCircle, Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import type { ParteDiario, Vehiculo } from '@/types';
import { ResumenMesConductor } from '@/components/features/resumen-mes-conductor';

function primerDiaDelMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function EstadoIcon({ estado }: { estado: string }) {
  if (estado === 'ENVIADO')              return <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (estado === 'PENDIENTE_VALIDACION') return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />;
  if (estado === 'FOTO_SUSTITUIDA')      return <Clock className="h-4 w-4 shrink-0 text-amber-400" />;
  return <AlertCircle className="h-4 w-4 shrink-0 text-zinc-600" />;
}

export default function PanelConductor() {
  const user = getSessionUser();
  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getPartes({ conductor_id: user?.conductor_id || undefined, desde: primerDiaDelMes() })
        .then((r) => setPartes(r.data || []))
        .catch(() => {}),
      getMe()
        .then((r) => { if (r.vehiculos?.length) setVehiculo(r.vehiculos[0] as Vehiculo); })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [user?.conductor_id]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800/60 bg-zinc-950/95 px-4 py-4 pt-safe-top backdrop-blur">
        <Link href="/conductor" className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-800">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold text-zinc-100">Mi panel</h1>
      </header>

      <main className="flex-1 space-y-5 px-5 py-6">
        <ResumenMesConductor partes={partes} loading={loading} />

        {vehiculo && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tu vehículo</p>
            <p className="font-mono text-xl font-bold tracking-wider text-zinc-100">{vehiculo.matricula}</p>
            <p className="text-sm text-zinc-400">{vehiculo.marca} {vehiculo.modelo}</p>
            <p className="mt-1 text-xs text-zinc-600">{vehiculo.km_actuales?.toLocaleString('es-ES')} km</p>
          </div>
        )}

        <Link
          href="/documentos"
          className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 transition-colors active:bg-zinc-800"
        >
          <FileText className="h-5 w-5 shrink-0 text-pilot-lime" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200">Subir documento del taxi</p>
            <p className="text-xs text-zinc-500">ITV, factura del taller, neumáticos…</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-zinc-600" />
        </Link>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tus partes de este mes</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-[60px] animate-pulse rounded-xl bg-zinc-800/40" />)}
            </div>
          ) : partes.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 py-10 text-center">
              <p className="text-sm text-zinc-500">Sin partes este mes todavía.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {partes.map((p) => (
                <Link
                  key={p.id}
                  href={`/conductor/parte/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition-colors active:bg-zinc-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <EstadoIcon estado={p.estado} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{formatDate(p.fecha_trabajada)}</p>
                      <p className="text-xs text-zinc-500">
                        {p.km_fin && p.km_inicio ? `${(p.km_fin - p.km_inicio).toLocaleString('es-ES')} km` : '—'}
                      </p>
                    </div>
                  </div>
                  <p className="ml-3 shrink-0 text-sm font-bold text-zinc-100">
                    {formatCurrency(Number(p.ingreso_bruto))}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="h-safe-bottom" />
    </div>
  );
}
