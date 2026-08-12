'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { PeriodFilter } from '@/components/features/period-filter';
import { Card, StatCard, Skeleton, Button } from '@/components/ui';
import { getResumenDashboard } from '@/lib/api';
import type { ResumenDashboard } from '@/lib/api/dashboard';
import { formatCurrency } from '@/lib/utils';
import { getSessionUser } from '@/lib/auth';
import { FileDown, Calculator, DollarSign, Fuel, Users, Wallet } from 'lucide-react';

/**
 * El filtro de periodo NO se leía (2026-08-12).
 *
 * Esta pantalla cogía las fechas del prop `searchParams` que Next pasa a la
 * página. Ese prop se resuelve una vez y NO se recalcula cuando el filtro
 * cambia la URL con `router.replace` — que es justo lo que hace PeriodFilter.
 * Resultado: la URL cambiaba, el desplegable mostraba el periodo nuevo, y los
 * números seguían siendo los del primer render. Parecía que "siempre enseña
 * el histórico".
 *
 * `useSearchParams()` —el mismo que usa el panel, donde sí funcionaba— sí se
 * entera de cada cambio de URL y vuelve a pedir los datos.
 */
function InformesContent() {
    const searchParams = useSearchParams();
    const desde = searchParams.get('desde') || undefined;
    const hasta = searchParams.get('hasta') || undefined;
    const [resumen, setResumen] = useState<ResumenDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const user = getSessionUser();
    const tieneAsalariados = user?.tiene_asalariados ?? false;

    useEffect(() => {
        setLoading(true);
        getResumenDashboard({ desde, hasta })
            .then((r) => setResumen(r.data))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, [desde, hasta]);

    if (loading || !resumen) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
                </div>
                <Skeleton className="h-64" />
            </div>
        );
    }

    return (
        <div className="space-y-6 print:m-0 print:p-0">
            {/* Botones de acción */}
            <div className="flex justify-end gap-3 mb-4 print:hidden">
                <Button variant="outline" className="h-10 text-sm" onClick={() => window.print()} title="Exportar resumen a PDF (Imprimir)">
                    <FileDown className="w-4 h-4 mr-2" />
                    Guardar PDF
                </Button>
            </div>

            <div className={`grid gap-4 grid-cols-2 ${tieneAsalariados ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                <StatCard title="Ingreso Bruto" value={formatCurrency(resumen.bruto)} subtitle={`${resumen.partes_count} partes procesados`} icon={DollarSign} />
                {tieneAsalariados && (
                    <StatCard title="A Conductor" value={formatCurrency(resumen.parte_conductor)} subtitle="Liquidación asalariado" variant="warning" icon={Users} />
                )}
                <StatCard
                    title={tieneAsalariados ? 'A Propietario (Bruto)' : 'Para el Propietario'}
                    value={formatCurrency(resumen.parte_patron)}
                    subtitle="Antes de gastos"
                    variant="success"
                    icon={Wallet}
                />
                <StatCard title="Combustible" value={formatCurrency(resumen.combustible)} subtitle="Descontado en partes" variant="danger" icon={Fuel} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-5">
                    <h3 className="mb-4 text-lg font-medium text-zinc-100 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-pilot-lime" />
                        Balance del Patrón
                    </h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">{tieneAsalariados ? 'Ingresos (Parte Patrón)' : 'Ingresos (Facturación)'}</span>
                            <span className="font-medium text-emerald-400">+{formatCurrency(resumen.parte_patron)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Gastos Variables del Periodo</span>
                            <span className="font-medium text-red-400">-{formatCurrency(resumen.gastos_variables)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Prorrateo Fijo (1 mes)</span>
                            <span className="font-medium text-red-500">-{formatCurrency(resumen.gastos_fijos_prorrateados)}</span>
                        </div>
                        <div className="flex justify-between pt-2 text-base font-bold">
                            <span className="text-zinc-100">Beneficio Neto Estimado</span>
                            <span className={resumen.beneficio_estimado >= 0 ? "text-emerald-500" : "text-red-500"}>
                                {formatCurrency(resumen.beneficio_estimado)}
                            </span>
                        </div>
                    </div>
                </Card>

                <Card className="p-5">
                    <h3 className="mb-4 text-lg font-medium text-zinc-100">Desglose de Efectivo</h3>
                    <p className="text-sm text-zinc-400 mb-4">
                        Flujo de caja generado por la actividad diaria del taxi.
                    </p>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Total Datáfono (Tarjeta)</span>
                            <span className="font-medium text-zinc-300">{formatCurrency(resumen.datafono)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Total Efectivo Estimado (Metálico)</span>
                            <span className="font-medium text-zinc-300">{formatCurrency(resumen.efectivo_estimado)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Combustible Pagado</span>
                            <span className="font-medium text-red-400">-{formatCurrency(resumen.combustible)}</span>
                        </div>
                    </div>
                </Card>
            </div>

        </div>
    );
}

export default function InformesPage() {
    return (
        <>
            <PageHeader
                title="Informes y Cierres"
                description="Balances y estado financiero del periodo seleccionado."
            >
                <PeriodFilter />
            </PageHeader>

            <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-32 bg-zinc-800 rounded-xl" /></div>}>
                <InformesContent />
            </Suspense>
        </>
    );
}
