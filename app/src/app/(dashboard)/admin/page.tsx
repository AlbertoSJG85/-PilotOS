'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { StatCard, Card, Badge, Skeleton, Button } from '@/components/ui';
import { getPartes, getGastosResumen, getVehiculos, getAnomalias, getMantenimientosProximos } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DollarSign, Fuel, TrendingUp, Wrench, AlertTriangle, ArrowRight, Activity, CalendarDays, FileText, Car } from 'lucide-react';
import type { ParteDiario, Vehiculo, Anomalia, MantenimientoVehiculo } from '@/types';
import { PeriodFilter } from '@/components/features/period-filter';

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const desde = searchParams.get('desde') || undefined;
  const hasta = searchParams.get('hasta') || undefined;

  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [gastosTotal, setGastosTotal] = useState(0);
  const [anomalias, setAnomalias] = useState<Anomalia[]>([]);
  const [mantenimientos, setMantenimientos] = useState<MantenimientoVehiculo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // First, fetch basic data + vehicles
    Promise.all([
      getPartes({ desde, hasta }).then((r) => r.data || []),
      getGastosResumen().then((r) => r.total?.importe || 0),
      getVehiculos().then((r) => r.data || []),
      getAnomalias().then((r) => r.data || []),
    ])
      .then(([rPartes, rGastos, rVehiculos, rAnomalias]) => {
        setPartes(rPartes);
        setGastosTotal(rGastos);
        setVehiculos(rVehiculos);
        setAnomalias(rAnomalias);

        // Fetch mantenimientos proximos for all vehicles
        if (rVehiculos.length > 0) {
          Promise.all(rVehiculos.map(v => getMantenimientosProximos(v.id)))
            .then(responses => {
              const allProximos = responses.flatMap(r => r.data || []);
              // Sort by closeness (vencidos first, then pending by date)
              allProximos.sort((a, b) => {
                if (a.estado === 'VENCIDO') return -1;
                if (b.estado === 'VENCIDO') return 1;
                if (!a.proxima_fecha) return 1;
                if (!b.proxima_fecha) return -1;
                return new Date(a.proxima_fecha).getTime() - new Date(b.proxima_fecha).getTime();
              });
              setMantenimientos(allProximos.slice(0, 5)); // Limit to top 5
            })
            .catch(() => { });
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  const totalBruto = partes.reduce((sum, p) => sum + Number(p.ingreso_bruto || 0), 0);
  const totalCombustible = partes.reduce((sum, p) => sum + Number(p.combustible || 0), 0);
  const totalNeto = partes.reduce((sum, p) => sum + Number(p.calculo?.neto_diario || 0), 0);
  const beneficioEstimado = partes.reduce((sum, p) => sum + Number(p.calculo?.parte_patron || 0), 0) - gastosTotal;

  const recentPartes = partes.slice(0, 4);
  const pendingAnomalias = anomalias.filter(a => !a.notificada).slice(0, 4);

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
      <PageHeader title="Panel Ejecutivo" description="Resumen operativo, ingresos y alertas tempranas del periodo seleccionado.">
        <PeriodFilter />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        <StatCard title="Facturación Bruta" value={formatCurrency(totalBruto)} subtitle={`${partes.length} partes`} icon={DollarSign} />
        <StatCard title="Beneficio Estimado" value={formatCurrency(beneficioEstimado)} subtitle="Ingresos - Gastos" icon={TrendingUp} variant={beneficioEstimado >= 0 ? "success" : "danger"} />
        <StatCard title="Neto Operativo" value={formatCurrency(totalNeto)} subtitle="Rebote líquido" icon={Activity} />
        <StatCard title="Combustible" value={formatCurrency(totalCombustible)} subtitle="Descontado en Turnos" icon={Fuel} variant="warning" />
        <StatCard title="Gastos Acumulados" value={formatCurrency(gastosTotal)} subtitle="Fijos + Variables" icon={Wrench} variant="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">

          {/* Alertas & Anomalias */}
          {pendingAnomalias.length > 0 && (
            <Card className="p-4 border-red-500/50 bg-red-950/20">
              <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" /> Alertas Pendientes ({pendingAnomalias.length})
              </h2>
              <div className="space-y-3">
                {pendingAnomalias.map(a => (
                  <div key={a.id} className="text-sm bg-black/40 p-3 rounded-lg border border-red-900/50 flex justify-between items-center">
                    <div>
                      <span className="font-medium text-zinc-100">{a.descripcion}</span>
                      <p className="text-xs text-red-300 mt-1">Registrado el {formatDate(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Últimos Partes */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-zinc-400" />
                Últimos Movimientos (Partes)
              </h2>
              <Link href="/partes" className="text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1">Ver panel completo <ArrowRight className="w-4 h-4" /></Link>
            </div>
            {recentPartes.length === 0 ? (
              <Card className="py-8 text-center text-zinc-500">Sin partes en este periodo.</Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recentPartes.map((p) => (
                  <Link href={`/partes/${p.id}`} key={p.id}>
                    <Card className="p-4 hover:border-amber-500/50 transition-colors h-full flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-medium text-zinc-100">{formatCurrency(p.ingreso_bruto)}</p>
                          <p className="text-xs text-zinc-500">{formatDate(p.fecha_trabajada)}</p>
                        </div>
                        <Badge variant={p.estado === 'VALIDADO' ? 'success' : 'warning'}>{p.estado}</Badge>
                      </div>
                      <div className="text-xs text-zinc-400 border-t border-zinc-800 pt-2 flex justify-between">
                        <span>{p.conductor?.usuario?.nombre || 'Desconocido'}</span>
                        <span className="text-zinc-500">{p.vehiculo?.matricula}</span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Derecha - Control Operativo */}
        <div className="space-y-6">
          {/* Mantenimientos Cercanos */}
          <Card className="p-5">
            <h2 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2 border-b border-zinc-800 pb-2">
              <CalendarDays className="w-4 h-4 text-amber-500" /> Próximos Mantenimientos
            </h2>
            {mantenimientos.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">Todo al día de momento.</p>
            ) : (
              <div className="space-y-3">
                {mantenimientos.map(m => (
                  <div key={m.id} className="flex flex-col gap-1 p-2 rounded hover:bg-zinc-900 transition-colors">
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
            <Link href="/mantenimientos" className="block text-center text-xs text-amber-500 hover:text-amber-400 mt-4 pt-3 border-t border-zinc-900">
              Ir a Taller / Mantenimientos
            </Link>
          </Card>

          {/* Resumen Flota */}
          <Card className="p-5 bg-zinc-900 border-zinc-800 flex flex-col items-center justify-center text-center">
            <Car className="w-8 h-8 text-zinc-600 mb-2" />
            <h3 className="text-2xl font-bold text-zinc-100">{vehiculos.length}</h3>
            <p className="text-sm text-zinc-400">Vehículos en la Flota</p>
            <Link href="/flota" className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 rounded-lg transition-colors w-full">
              Gestionar Flota y Conductores
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


