'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { StatCard, Card, Badge, Skeleton, Button } from '@/components/ui';
import { getPartes, getResumenDashboard, getVehiculos, getAnomalias, getMantenimientosProximos, marcarAnomaliaRevisada } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DollarSign, Fuel, TrendingUp, Wrench, AlertTriangle, ArrowRight, Activity, CalendarDays, FileText, Car, CreditCard, Banknote } from 'lucide-react';
import type { ParteDiario, Vehiculo, Anomalia, MantenimientoVehiculo } from '@/types';
import type { ResumenDashboard } from '@/lib/api/dashboard';
import { PeriodFilter } from '@/components/features/period-filter';
import { PartesRetenidos } from '@/components/features/partes-retenidos';
import { ViasPanel } from '@/components/features/vias-panel';

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const desde = searchParams.get('desde') || undefined;
  const hasta = searchParams.get('hasta') || undefined;

  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null);
  const [anomalias, setAnomalias] = useState<Anomalia[]>([]);
  const [mantenimientos, setMantenimientos] = useState<MantenimientoVehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [errorRevisar, setErrorRevisar] = useState<string | null>(null);

  // Extraída del efecto para poder recargar tras aceptar o rehacer un parte
  // retenido: esa decisión cambia los totales, no solo la lista.
  function cargarDatos() {
    setLoading(true);

    Promise.all([
      getPartes({ desde, hasta }).then((r) => r.data || []),
      getResumenDashboard({ desde, hasta }).then((r) => r.data),
      getVehiculos().then((r) => r.data || []),
      getAnomalias().then((r) => r.data || []),
    ])
      .then(([rPartes, rResumen, rVehiculos, rAnomalias]) => {
        setPartes(rPartes);
        setResumen(rResumen);
        setVehiculos(rVehiculos);
        setAnomalias(rAnomalias);

        if (rVehiculos.length > 0) {
          Promise.all(rVehiculos.map(v => getMantenimientosProximos(v.id)))
            .then(responses => {
              const allProximos = responses.flatMap(r => r.data || []);
              allProximos.sort((a, b) => {
                if (a.estado === 'VENCIDO') return -1;
                if (b.estado === 'VENCIDO') return 1;
                if (!a.proxima_fecha) return 1;
                if (!b.proxima_fecha) return -1;
                return new Date(a.proxima_fecha).getTime() - new Date(b.proxima_fecha).getTime();
              });
              setMantenimientos(allProximos.slice(0, 5));
            })
            .catch(() => { });
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }

  useEffect(cargarDatos, [desde, hasta]);

  const totalBruto = resumen?.bruto ?? 0;
  const totalCombustible = resumen?.combustible ?? 0;
  const totalNeto = resumen?.neto ?? 0;
  // La Seguridad Social NO va aquí: se le descuenta al asalariado y el dueño
  // solo la retiene para pagarla al Estado. Entra y sale — no es gasto suyo.
  // Vive en la vía del asalariado, que es de donde sale.
  const gastosTotal = (resumen?.gastos_variables ?? 0) + (resumen?.gastos_fijos_prorrateados ?? 0);
  const subtituloGastos = 'Variables + fijos del periodo';
  const beneficioEstimado = resumen?.beneficio_estimado ?? 0;
  const totalDatafono = resumen?.datafono ?? 0;
  const totalEfectivo = resumen?.efectivo_estimado ?? 0;
  const tieneAsalariados = getSessionUser()?.tiene_asalariados ?? false;
  // Porcentajes para la barra proporcional. Si no hay bruto, dejamos 50/50
  // sin pintar nada (la card mostrará 0/0).
  const pctDatafono = totalBruto > 0 ? Math.round((totalDatafono / totalBruto) * 100) : 0;
  const pctEfectivo = totalBruto > 0 ? Math.max(0, 100 - pctDatafono) : 0;
  const soloEfectivo = totalBruto > 0 && totalDatafono === 0;

  const recentPartes = partes.slice(0, 4);
  // Todas las que el patrón aún no ha revisado, no solo las 4 últimas — una
  // anomalía no desaparece por antigua, se queda hasta que él decide (el
  // WhatsApp puede no llegar, pasar desapercibido, o simplemente olvidarse).
  const idsRetenidos = new Set(partes.filter(p => p.estado === 'PENDIENTE_VALIDACION').map(p => p.id));
  // Las anomalías de un parte retenido se gestionan desde la bandeja de
  // decisión (aceptar / rehacer), no una a una: cerrar la alerta sin decidir
  // sobre el parte era justo el agujero que había antes.
  const pendingAnomalias = anomalias.filter(a => a.estado !== 'RESUELTA' && !(a.parte_diario_id && idsRetenidos.has(a.parte_diario_id)));

  async function handleRevisarAnomalia(id: string) {
    setErrorRevisar(null);
    setRevisando(id);
    try {
      await marcarAnomaliaRevisada(id);
      setAnomalias((prev) => prev.map((a) => (a.id === id ? { ...a, estado: 'RESUELTA' } : a)));
    } catch {
      setErrorRevisar('No se pudo marcar como revisada. Inténtalo de nuevo.');
    } finally {
      setRevisando(null);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Panel de Control" description="Visión ejecutiva del negocio y estado de la flota">
          <PeriodFilter />
        </PageHeader>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Panel Ejecutivo" description="Resumen operativo, ingresos y alertas del periodo seleccionado.">
        <PeriodFilter />
      </PageHeader>

      {/* KPI grid — el orden lo fijó Alberto (2026-08-12) y sigue el camino
          del dinero: lo que entra, lo que se va en combustible, lo que queda
          de operar, lo que cuesta el negocio y lo que sobra al final. Antes el
          beneficio salía el segundo, antes incluso de haber enseñado un coste. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        <StatCard title="Facturación Bruta"   value={formatCurrency(totalBruto)}          subtitle={`${partes.length} partes`}   icon={DollarSign} />
        <StatCard title="Combustible"         value={formatCurrency(totalCombustible)}    subtitle="Descontado en turnos"        icon={Fuel}        variant="warning" />
        <StatCard title="Neto Operativo"      value={formatCurrency(totalNeto)}           subtitle="Bruto − combustible"         icon={Activity} />
        <StatCard title="Gastos del periodo"  value={formatCurrency(gastosTotal)}         subtitle={subtituloGastos}             icon={Wrench}      variant="danger" />
        <StatCard title="Beneficio Estimado"  value={formatCurrency(beneficioEstimado)}   subtitle="Lo que queda para ti"        icon={TrendingUp}  variant={beneficioEstimado >= 0 ? 'success' : 'danger'} />
      </div>

      {/* Desglose datáfono vs efectivo estimado del periodo */}
      <Card className="p-5 mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4 border-b border-zinc-800 pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
            Desglose de cobros del periodo
          </h2>
          <span className="text-xs text-zinc-500">
            Total bruto: <span className="text-zinc-200 font-medium">{formatCurrency(totalBruto)}</span>
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10 flex-shrink-0">
              <CreditCard className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Datáfono</p>
              <p className="text-2xl font-bold text-zinc-100">{formatCurrency(totalDatafono)}</p>
              <p className="text-[11px] text-zinc-500">{pctDatafono}% del bruto</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 flex-shrink-0">
              <Banknote className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Efectivo estimado</p>
              <p className="text-2xl font-bold text-zinc-100">{formatCurrency(totalEfectivo)}</p>
              <p className="text-[11px] text-zinc-500">
                {pctEfectivo}% del bruto
                {soloEfectivo && <span className="ml-1 text-emerald-400">· todo en efectivo</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Barra proporcional */}
        {totalBruto > 0 && (
          <div className="mt-4">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="bg-sky-500 transition-all"
                style={{ width: `${pctDatafono}%` }}
                title={`Datáfono: ${pctDatafono}%`}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${pctEfectivo}%` }}
                title={`Efectivo: ${pctEfectivo}%`}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Efectivo estimado se calcula como <span className="text-zinc-400">bruto − datáfono</span>. No cambia ningún otro cálculo.
            </p>
          </div>
        )}
        {totalBruto === 0 && (
          <p className="text-xs text-zinc-500 mt-2">Sin partes en este periodo.</p>
        )}
      </Card>

      {/* Las dos vías, en tarjetas como las de arriba: la del asalariado
          (lo que genera, su reparto, su SS y lo que percibe) y la tuya (lo
          tuyo íntegro, lo que te queda de él, tus gastos y tu beneficio). */}
      <ViasPanel
        asalariados={resumen?.asalariados ?? []}
        patron={resumen?.patron ?? null}
        gastos={gastosTotal}
        beneficio={beneficioEstimado}
        ingresoPatron={resumen?.ingreso_patron ?? 0}
      />

      {/* Desglose datáfono vs efectivo estimado del periodo */}
      <Card className="p-5 mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4 border-b border-zinc-800 pb-3">
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
            Desglose de cobros del periodo
          </h2>
          <span className="text-xs text-zinc-500">
            Total bruto: <span className="text-zinc-200 font-medium">{formatCurrency(totalBruto)}</span>
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10 flex-shrink-0">
              <CreditCard className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Datáfono</p>
              <p className="text-2xl font-bold text-zinc-100">{formatCurrency(totalDatafono)}</p>
              <p className="text-[11px] text-zinc-500">{pctDatafono}% del bruto</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 flex-shrink-0">
              <Banknote className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Efectivo estimado</p>
              <p className="text-2xl font-bold text-zinc-100">{formatCurrency(totalEfectivo)}</p>
              <p className="text-[11px] text-zinc-500">
                {pctEfectivo}% del bruto
                {soloEfectivo && <span className="ml-1 text-emerald-400">· todo en efectivo</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Barra proporcional */}
        {totalBruto > 0 && (
          <div className="mt-4">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="bg-sky-500 transition-all"
                style={{ width: `${pctDatafono}%` }}
                title={`Datáfono: ${pctDatafono}%`}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${pctEfectivo}%` }}
                title={`Efectivo: ${pctEfectivo}%`}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Efectivo estimado se calcula como <span className="text-zinc-400">bruto − datáfono</span>. No cambia ningún otro cálculo.
            </p>
          </div>
        )}
        {totalBruto === 0 && (
          <p className="text-xs text-zinc-500 mt-2">Sin partes en este periodo.</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">

          <PartesRetenidos partes={partes} anomalias={anomalias} onResuelto={cargarDatos} />

          {/* Alertas que no cuelgan de un parte retenido (mantenimiento, km, etc.) */}
          {pendingAnomalias.length > 0 && (
            <Card className="p-4 border-red-500/40 bg-red-950/20">
              <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" /> Alertas Pendientes ({pendingAnomalias.length})
              </h2>
              {errorRevisar && (
                <p className="text-xs text-red-300 mb-2">{errorRevisar}</p>
              )}
              <div className="space-y-2">
                {pendingAnomalias.map(a => (
                  <div key={a.id} className="text-sm bg-black/30 p-3 rounded-lg border border-red-900/40 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {a.tipo === 'CRITICA' && (
                          <Badge variant="danger" className="uppercase text-[10px] tracking-wide shrink-0">Crítica</Badge>
                        )}
                        <span className="font-medium text-zinc-100">{a.descripcion}</span>
                      </div>
                      <p className="text-xs text-red-300/70 mt-0.5">
                        {a.conductor?.usuario?.nombre ? `${a.conductor.usuario.nombre} · ` : ''}
                        Registrado el {formatDate(a.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      disabled={revisando === a.id}
                      onClick={() => handleRevisarAnomalia(a.id)}
                    >
                      {revisando === a.id ? 'Marcando…' : 'Marcar revisada'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Últimos Partes */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-500" />
                Últimos Movimientos
              </h2>
              <Link href="/partes" className="text-sm text-pilot-lime hover:text-pilot-lime-light flex items-center gap-1 transition-colors">
                Ver panel completo <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {recentPartes.length === 0 ? (
              <Card className="py-8 text-center text-zinc-500">Sin partes en este periodo.</Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recentPartes.map((p) => (
                  <Link href={`/partes/${p.id}`} key={p.id}>
                    <Card className="p-4 hover:border-pilot-lime/40 transition-colors h-full flex flex-col justify-between cursor-pointer">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-zinc-100">{formatCurrency(p.ingreso_bruto)}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{formatDate(p.fecha_trabajada)}</p>
                        </div>
                        <Badge variant={p.estado === 'VALIDADO' ? 'success' : 'warning'}>{p.estado}</Badge>
                      </div>
                      <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-2 flex justify-between">
                        <span className="text-zinc-400">{p.conductor?.usuario?.nombre || 'Desconocido'}</span>
                        <span>{p.vehiculo?.matricula}</span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* Próximos Mantenimientos */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
              <CalendarDays className="w-4 h-4 text-pilot-lime" /> Próximos Mantenimientos
            </h2>
            {mantenimientos.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">Todo al día de momento.</p>
            ) : (
              <div className="space-y-3">
                {mantenimientos.map(m => (
                  <div key={m.id} className="flex flex-col gap-1 p-2 rounded-lg hover:bg-zinc-800 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-zinc-200">{m.catalogo?.nombre || 'Taller'}</span>
                      <Badge variant={m.estado === 'VENCIDO' ? 'danger' : 'warning'} className="text-[10px] px-1.5 py-0">{m.estado}</Badge>
                    </div>
                    <div className="text-xs text-zinc-500 flex justify-between gap-4">
                      {m.proxima_fecha && <span>Vence: {formatDate(m.proxima_fecha)}</span>}
                      {m.proximo_km && <span>a los {m.proximo_km.toLocaleString('es-ES')} km</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/mantenimientos" className="block text-center text-xs text-pilot-lime hover:text-pilot-lime-light mt-4 pt-3 border-t border-zinc-800 transition-colors">
              Ir a Taller / Mantenimientos
            </Link>
          </Card>

          {/* Resumen Flota */}
          <Card className="p-5 flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pilot-lime/10 mb-3">
              <Car className="w-7 h-7 text-pilot-lime" />
            </div>
            <h3 className="text-3xl font-bold text-zinc-100">{vehiculos.length}</h3>
            <p className="text-sm text-zinc-500 mt-1">Vehículos en la Flota</p>
            <Link href="/flota" className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 rounded-lg transition-colors w-full">
              {tieneAsalariados ? 'Gestionar Flota y Conductores' : 'Gestionar mi flota'}
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500">Cargando dashboard...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}
