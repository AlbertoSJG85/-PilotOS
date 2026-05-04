'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getGastos, getGastosFijos, getGastosResumen, updateGastoFijo } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getSessionUser } from '@/lib/auth';
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
  const [user, setUser] = useState<ReturnType<typeof getSessionUser>>(null);

  // Estado para editar gasto fijo
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);

  const fetchData = () => {
    setLoading(true);
    setUser(getSessionUser());
    Promise.all([
      getGastos({ desde, hasta }).then((r) => { if (r.data) setGastos(r.data); }),
      getGastosFijos().then((r) => { if (r.data) setGastosFijos(r.data); }),
      getGastosResumen().then((r) => { if (r.total) setResumenTotal(r.total.importe); }),
    ])
      .then(() => setError(null))
      .catch((err) => setError(err.message || 'Error al cargar gastos.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [desde, hasta]);

  async function handleUpdateFijo(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditLoading(true);
    try {
      await updateGastoFijo(editingId, editForm);
      setEditingId(null);
      setEditForm(null);
      fetchData();
    } catch (err) {
      alert('Error al actualizar el gasto fijo');
    } finally {
      setEditLoading(false);
    }
  }

  const isPatron = user?.es_patron || user?.role === 'admin';

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
              <Card key={g.id} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={TIPO_BADGE[g.tipo] || 'default'}>{g.tipo}</Badge>
                      <span className="text-sm text-zinc-200 truncate">{g.descripcion}</span>
                      {!g.activo && <Badge variant="danger">INACTIVO</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {g.periodicidad} {g.vehiculo ? `— ${g.vehiculo.matricula}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-4">
                    <span className="text-lg font-bold text-zinc-100">{formatCurrency(g.importe)}</span>
                    {isPatron && editingId !== g.id && (
                      <Button size="sm" variant="outline" onClick={() => {
                        setEditingId(g.id);
                        setEditForm({
                          tipo: g.tipo,
                          descripcion: g.descripcion,
                          importe: g.importe,
                          periodicidad: g.periodicidad,
                          activo: g.activo
                        });
                      }}>
                        Editar
                      </Button>
                    )}
                  </div>
                </div>

                {editingId === g.id && (
                  <form onSubmit={handleUpdateFijo} className="flex flex-col gap-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                    <p className="text-xs font-semibold text-pilot-lime">Editar Gasto Fijo</p>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase">Descripción</label>
                        <Input
                          className="h-8 text-xs"
                          value={editForm.descripcion}
                          onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase">Importe (€)</label>
                        <Input
                          type="number" step="0.01" className="h-8 text-xs"
                          value={editForm.importe}
                          onChange={(e) => setEditForm({ ...editForm, importe: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase">Tipo</label>
                        <select 
                          className="w-full h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                          value={editForm.tipo}
                          onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                        >
                          <option value="AUTONOMO">Autónomo</option>
                          <option value="SEGURO">Seguro</option>
                          <option value="EMISORA">Emisora</option>
                          <option value="IMPUESTO">Impuesto</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 uppercase">Periodicidad</label>
                        <select 
                          className="w-full h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                          value={editForm.periodicidad}
                          onChange={(e) => setEditForm({ ...editForm, periodicidad: e.target.value })}
                        >
                          <option value="MENSUAL">Mensual</option>
                          <option value="TRIMESTRAL">Trimestral</option>
                          <option value="SEMESTRAL">Semestral</option>
                          <option value="ANUAL">Anual</option>
                        </select>
                      </div>
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
                    </div>

                    <div className="flex gap-2 justify-end mt-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={editLoading} className="h-7 text-xs">Cancelar</Button>
                      <Button size="sm" type="submit" disabled={editLoading} className="h-7 text-xs bg-pilot-lime hover:bg-pilot-lime/90 text-black">Guardar</Button>
                    </div>
                  </form>
                )}
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
