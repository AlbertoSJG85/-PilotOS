'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Clock, AlertCircle, Car, Fuel, Receipt } from 'lucide-react';
import { getParte } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ParteDiario } from '@/types';

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'ENVIADO') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/50 px-3 py-1 text-xs font-semibold text-emerald-400">
        <CheckCircle className="h-3.5 w-3.5" /> Enviado
      </span>
    );
  }
  if (estado === 'FOTO_SUSTITUIDA') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/60 border border-amber-800/50 px-3 py-1 text-xs font-semibold text-amber-400">
        <Clock className="h-3.5 w-3.5" /> Foto sustituida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-400">
      <AlertCircle className="h-3.5 w-3.5" /> {estado}
    </span>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800/60 last:border-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-200">{value}</span>
    </div>
  );
}

export default function ParteDetalleConductor() {
  const params = useParams();
  const router = useRouter();
  const [parte, setParte] = useState<ParteDiario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) return;
    getParte(params.id as string)
      .then((r) => { if (r.data) setParte(r.data); })
      .catch(() => setError('No se pudo cargar el parte'))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-pilot-lime border-t-transparent" />
      </div>
    );
  }

  if (error || !parte) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-5 gap-4">
        <p className="text-zinc-400">{error || 'Parte no encontrado'}</p>
        <button onClick={() => router.push('/conductor')} className="text-pilot-lime text-sm font-medium">Volver</button>
      </div>
    );
  }

  const km = parte.km_fin && parte.km_inicio ? parte.km_fin - parte.km_inicio : null;
  const efectivo = Number(parte.ingreso_bruto) - Number(parte.ingreso_datafono);
  const calculo = parte.calculo;

  return (
    <div className="min-h-screen bg-zinc-950 max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur px-4 py-4 pt-safe-top">
        <button
          onClick={() => router.push('/conductor')}
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-zinc-100">Parte del {formatDate(parte.fecha_trabajada)}</h1>
        </div>
        <EstadoBadge estado={parte.estado} />
      </header>

      <div className="px-5 py-6 space-y-5">

        {/* Resumen principal */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Ingresos</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-black text-zinc-100">{formatCurrency(parte.ingreso_bruto)}</p>
              <p className="text-xs text-zinc-500 mt-1">Ingreso bruto total</p>
            </div>
            {calculo && (
              <div className="text-right">
                <p className="text-lg font-bold text-pilot-lime">{formatCurrency(calculo.parte_conductor)}</p>
                <p className="text-xs text-zinc-500">Tu parte</p>
              </div>
            )}
          </div>
        </div>

        {/* Desglose */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-2">
          <DataRow label="Datáfono" value={formatCurrency(parte.ingreso_datafono)} />
          <DataRow label="Efectivo" value={formatCurrency(efectivo)} />
          {parte.combustible && Number(parte.combustible) > 0 && (
            <DataRow label="Combustible" value={formatCurrency(parte.combustible)} />
          )}
          {parte.varios && Number(parte.varios) > 0 && (
            <DataRow
              label={`Varios${parte.concepto_varios ? ` (${parte.concepto_varios})` : ''}`}
              value={formatCurrency(parte.varios)}
            />
          )}
        </div>

        {/* Vehículo y km */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-2">
          {parte.vehiculo && (
            <DataRow
              label="Vehículo"
              value={`${parte.vehiculo.matricula} — ${parte.vehiculo.marca} ${parte.vehiculo.modelo}`}
            />
          )}
          <DataRow label="Km inicio" value={parte.km_inicio?.toLocaleString('es-ES') || '—'} />
          <DataRow label="Km fin" value={parte.km_fin?.toLocaleString('es-ES') || '—'} />
          {km !== null && (
            <DataRow label="Km recorridos" value={`${km.toLocaleString('es-ES')} km`} />
          )}
        </div>

        {/* Documentos adjuntos */}
        {parte.documentos && parte.documentos.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Tickets adjuntos</p>
            <div className="space-y-2">
              {parte.documentos.map((enlace: any) => (
                <div key={enlace.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                  {enlace.documento?.tipo === 'TICKET_TAXIMETRO' ? (
                    <Receipt className="h-4 w-4 text-pilot-lime" />
                  ) : (
                    <Fuel className="h-4 w-4 text-blue-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-300">
                      {enlace.documento?.tipo === 'TICKET_TAXIMETRO' ? 'Ticket taxímetro' : 'Ticket combustible'}
                    </p>
                    <p className="text-[10px] text-zinc-600 capitalize">
                      {enlace.documento?.estado?.toLowerCase() || 'recibido'}
                    </p>
                  </div>
                  {enlace.documento?.url && (
                    <a
                      href={enlace.documento.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-pilot-lime hover:text-pilot-lime-light"
                    >
                      Ver
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nota de inmutabilidad */}
        <p className="text-center text-[10px] text-zinc-700 pb-4">
          Los partes son inmutables una vez enviados. Si hay un error, contacta con tu propietario.
        </p>
      </div>
    </div>
  );
}
