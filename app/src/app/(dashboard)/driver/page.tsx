'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { StatCard, Card, Badge, Skeleton, Button } from '@/components/ui';
import { getPartes, getMe } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, DollarSign, Car } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import type { ParteDiario } from '@/types';
import { PeriodFilter } from '@/components/features/period-filter';

function DriverDashboardContent() {
  const searchParams = useSearchParams();
  const desde = searchParams.get('desde') || undefined;
  const hasta = searchParams.get('hasta') || undefined;
  const user = getSessionUser();
  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [vehiculoInfo, setVehiculoInfo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const conductorId = user?.conductor_id;
    setLoading(true);
    Promise.all([
      getPartes({ conductor_id: conductorId || undefined, desde, hasta }).then((r) => { if (r.data) setPartes(r.data); }),
      getMe().then((r) => {
        if (r.vehiculos && r.vehiculos.length > 0) {
          const v = r.vehiculos[0];
          setVehiculoInfo(`${v.matricula} — ${v.marca} ${v.modelo}`);
        }
      }),
    ])
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [user?.conductor_id, desde, hasta]);

  const totalBruto = partes.reduce((sum, p) => sum + p.ingreso_bruto, 0);
  const recentPartes = partes.slice(0, 5);

  if (loading) {
    return (
      <>
        <PageHeader title="Mi Panel">
          <div className="hidden sm:flex items-center gap-4">
            <PeriodFilter />
            <Link href="/partes/nuevo"><Button>Nuevo Parte</Button></Link>
          </div>
        </PageHeader>
        <div className="mb-4 sm:hidden"><PeriodFilter /></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mi Panel">
        <div className="hidden sm:flex items-center gap-4">
          <PeriodFilter />
          <Link href="/partes/nuevo"><Button>Nuevo Parte</Button></Link>
        </div>
      </PageHeader>

      <div className="mb-6 sm:hidden"><PeriodFilter /></div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Mis Partes" value={String(partes.length)} subtitle="Total registrados" icon={FileText} />
        <StatCard title="Ingresos Generados" value={formatCurrency(totalBruto)} subtitle="Total bruto" icon={DollarSign} />
        <StatCard title="Vehiculo" value={vehiculoInfo || 'Sin asignar'} icon={Car} />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Mis Ultimos Partes</h2>
        {recentPartes.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="text-zinc-400">No has enviado partes todavia.</p>
            <Link href="/partes/nuevo"><Button className="mt-4">Crear primer parte</Button></Link>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentPartes.map((p) => (
              <Link href={`/partes/${p.id}`} key={p.id} className="block">
                <Card className="flex items-center justify-between py-3 hover:border-amber-500/50 transition-colors">
                  <div>
                    <span className="text-sm font-medium text-zinc-200">{formatDate(p.fecha_trabajada)}</span>
                    {p.vehiculo && <span className="ml-2 text-xs text-zinc-500">{p.vehiculo.matricula}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-100">{formatCurrency(p.ingreso_bruto)}</span>
                    <Badge variant={p.estado === 'ENVIADO' ? 'info' : 'success'}>{p.estado}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button (Solo Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/90 backdrop-blur border-t border-zinc-800 sm:hidden z-50">
        <Link href="/partes/nuevo" className="block w-full">
          <Button className="w-full h-14 text-lg font-bold bg-amber-500 text-black hover:bg-amber-400">
            <FileText className="w-6 h-6 mr-2" />
            NUEVO PARTE
          </Button>
        </Link>
      </div>

      {/* Spacer for floating button */}
      <div className="h-20 sm:hidden" />
    </>
  );
}

export default function DriverDashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500">Cargando panel...</div>}>
      <DriverDashboardContent />
    </Suspense>
  );
}
