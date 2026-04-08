'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { Button, Card, Badge, Skeleton } from '@/components/ui';
import { getPartes } from '@/lib/api';
import { formatCurrency, formatDate, formatKm } from '@/lib/utils';
import type { ParteDiario } from '@/types';
import { PeriodFilter } from '@/components/features/period-filter';

const ESTADO_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  ENVIADO: 'info',
  VALIDADO: 'success',
  FOTO_ILEGIBLE: 'danger',
  FOTO_SUSTITUIDA: 'warning',
  CON_INCIDENCIA: 'danger',
};

function PartesPageContent() {
  const searchParams = useSearchParams();
  const desde = searchParams.get('desde') || undefined;
  const hasta = searchParams.get('hasta') || undefined;

  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getPartes({ desde, hasta })
      .then((res) => { if (res.data) setPartes(res.data); setError(null); })
      .catch((err) => { setError(err.message || 'Error al cargar partes diarios.'); setPartes([]); })
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  return (
    <>
      <PageHeader title="Partes Diarios" description="Registro de jornadas de trabajo">
        <div className="flex items-center gap-4">
          <PeriodFilter />
          <Link href="/partes/nuevo">
            <Button>Nuevo Parte</Button>
          </Link>
        </div>
      </PageHeader>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <Card className="py-12 text-center border-red-500/20 bg-red-500/5">
          <p className="text-red-400 font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Reintentar</Button>
        </Card>
      ) : partes.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-zinc-400">No hay partes registrados todavia.</p>
          <Link href="/partes/nuevo">
            <Button className="mt-4">Crear primer parte</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {partes.map((p) => (
            <Link href={`/partes/${p.id}`} key={p.id} className="block">
              <Card className="flex items-center justify-between gap-4 hover:border-amber-500/50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-100">{formatDate(p.fecha_trabajada)}</span>
                    <Badge variant={ESTADO_BADGE[p.estado] || 'default'}>{p.estado}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-zinc-400">
                    {p.vehiculo && <span>{p.vehiculo.matricula}</span>}
                    {p.conductor?.usuario && <span>{p.conductor.usuario.nombre}</span>}
                    <span>{formatKm(p.km_fin - (p.km_inicio || 0))}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-zinc-100">{formatCurrency(p.ingreso_bruto)}</p>
                  {p.calculo && (
                    <p className="text-xs text-zinc-500">Neto: {formatCurrency(p.calculo.neto_diario)}</p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function PartesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500">Cargando partes...</div>}>
      <PartesPageContent />
    </Suspense>
  );
}
