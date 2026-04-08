'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button } from '@/components/ui';
import { getGastos, getGastosFijos, getGastosResumen } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Gasto, GastoFijo } from '@/types';
import { PeriodFilter } from '@/components/features/period-filter';

const TIPO_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  COMBUSTIBLE: 'warning',
  MANTENIMIENTO: 'info',
  SEGURO: 'success',
  IMPUESTO: 'danger',
  AUTONOMO: 'default',
  EMISORA: 'default',
  OTRO: 'default',
};

function GastosPageContent() {
  const searchParams = useSearchParams();
  const desde = searchParams.get('desde') || undefined;
  const hasta = searchParams.get('hasta') || undefined;

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([]);
  const [resumenTotal, setResumenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'variables' | 'fijos'>('variables');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getGastos({ desde, hasta }).then((r) => { if (r.data) setGastos(r.data); }),
      getGastosFijos().then((r) => { if (r.data) setGastosFijos(r.data); }),
      // gastos/resumen currently doesn't support dates, documented in Phase 2
      getGastosResumen().then((r) => { if (r.total) setResumenTotal(r.total.importe); }),
    ])
      .then(() => setError(null))
      .catch((err) => setError(err.message || 'Error al cargar gastos.'))
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  if (loading) {
    return (
      <>
        <PageHeader title="Gastos" description="Gastos fijos y variables del negocio">
          <div className="flex items-center gap-4">
            <PeriodFilter />
            <Link href="/gastos/nuevo"><Button>Nuevo Gasto</Button></Link>
          </div>
        </PageHeader>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Gastos" description="Gastos fijos y variables del negocio">
        <div className="flex items-center gap-4">
          <PeriodFilter />
          <Link href="/gastos/nuevo"><Button>Nuevo Gasto</Button></Link>
        </div>
      </PageHeader>

      {error && (
        <Card className="mb-6 py-6 text-center border-red-500/20 bg-red-500/5">
          <p className="text-red-400 font-medium">{error}</p>
        </Card>
      )}

      {/* Total */}
      <Card className="mb-6 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Total acumulado</span>
        <span className="text-xl font-bold text-zinc-100">{formatCurrency(resumenTotal)}</span>
      </Card>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <Button
          variant={tab === 'variables' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('variables')}
        >
          Variables ({gastos.length})
        </Button>
        <Button
          variant={tab === 'fijos' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('fijos')}
        >
          Fijos ({gastosFijos.length})
        </Button>
      </div>

      {/* Variable expenses */}
      {tab === 'variables' && (
        gastos.length === 0 ? (
          <Card className="py-8 text-center text-zinc-500">Sin gastos variables registrados</Card>
        ) : (
          <div className="space-y-2">
            {gastos.map((g) => (
              <Card key={g.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={TIPO_BADGE[g.tipo] || 'default'}>{g.tipo}</Badge>
                    <span className="text-sm text-zinc-200 truncate">{g.descripcion}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(g.fecha)}</p>
                </div>
                <span className="shrink-0 text-lg font-bold text-zinc-100">{formatCurrency(g.importe)}</span>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Fixed expenses */}
      {tab === 'fijos' && (
        gastosFijos.length === 0 ? (
          <Card className="py-8 text-center text-zinc-500">Sin gastos fijos configurados</Card>
        ) : (
          <div className="space-y-2">
            {gastosFijos.map((g) => (
              <Card key={g.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={TIPO_BADGE[g.tipo] || 'default'}>{g.tipo}</Badge>
                    <span className="text-sm text-zinc-200 truncate">{g.descripcion}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {g.periodicidad} {g.vehiculo ? `— ${g.vehiculo.matricula}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-lg font-bold text-zinc-100">{formatCurrency(g.importe)}</span>
                  {!g.activo && <p className="text-xs text-red-400">Inactivo</p>}
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </>
  );
}

export default function GastosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500">Cargando gastos...</div>}>
      <GastosPageContent />
    </Suspense>
  );
}
