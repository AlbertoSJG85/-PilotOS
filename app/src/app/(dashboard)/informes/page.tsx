'use client';

import { use, Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { PeriodFilter } from '@/components/features/period-filter';
import { Card, StatCard, Badge, Skeleton, Button } from '@/components/ui';
import { getPartes, getGastos, getGastosFijos } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { ParteDiario, Gasto, GastoFijo } from '@/types';
import { FileDown, Calculator, DollarSign, Fuel, Users, Wallet } from 'lucide-react';

interface Props {
    searchParams: Promise<{ desde?: string; hasta?: string }>;
}

function InformesContent({ searchParams }: { searchParams: { desde?: string; hasta?: string } }) {
    const { desde, hasta } = searchParams;
    const [partes, setPartes] = useState<ParteDiario[]>([]);
    const [gastos, setGastos] = useState<Gasto[]>([]);
    const [fijos, setFijos] = useState<GastoFijo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            getPartes({ desde, hasta }),
            getGastos({ desde, hasta }),
            getGastosFijos()
        ])
            .then(([rPartes, rGastos, rFijos]) => {
                setPartes(rPartes.data || []);
                setGastos(rGastos.data || []);
                setFijos(rFijos.data || []);
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, [desde, hasta]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
                </div>
                <Skeleton className="h-64" />
            </div>
        );
    }

    // Agregaciones
    const resumen = partes.reduce(
        (acc, p) => {
            acc.bruto += Number(p.ingreso_bruto || 0);
            acc.combustible += Number(p.combustible || 0);
            acc.datafono += Number(p.ingreso_datafono || 0);
            if (p.calculo) {
                acc.neto_partes += Number(p.calculo.neto_diario || 0);
                acc.parte_conductor += Number(p.calculo.parte_conductor || 0);
                acc.parte_patron += Number(p.calculo.parte_patron || 0);
            }
            return acc;
        },
        { bruto: 0, combustible: 0, datafono: 0, neto_partes: 0, parte_conductor: 0, parte_patron: 0 }
    );

    const totalGastosVariables = gastos.reduce((acc, g) => acc + Number(g.importe), 0);

    // Para los fijos, si estamos viendo un periodo especifico deberiamos prorratear, 
    // pero como base mostramos la cuota del mes. Si no hay desde/hasta asumimos el mes actual.
    // Simplificación: sumar el importe_mensual de los activos como "Carga Fija Estimada Mensual".
    const totalFijosMensuales = fijos.reduce((acc, f) => {
        let multiplier = 1;
        if (f.periodicidad === 'TRIMESTRAL') multiplier = 1 / 3;
        if (f.periodicidad === 'ANUAL') multiplier = 1 / 12;
        return acc + (Number(f.importe) * multiplier);
    }, 0);

    const beneficioEstimadoPatron = resumen.parte_patron - totalGastosVariables - totalFijosMensuales;

    return (
        <div className="space-y-6 print:m-0 print:p-0">
            {/* Botones de acción (Fase 3: Exportar PDF) */}
            <div className="flex justify-end gap-3 mb-4 print:hidden">
                <Button variant="outline" className="h-10 text-sm" onClick={() => window.print()} title="Exportar resumen a PDF (Imprimir)">
                    <FileDown className="w-4 h-4 mr-2" />
                    Guardar PDF
                </Button>
            </div>

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <StatCard title="Ingreso Bruto" value={formatCurrency(resumen.bruto)} subtitle={`${partes.length} partes procesados`} icon={DollarSign} />
                <StatCard title="A Conductor" value={formatCurrency(resumen.parte_conductor)} subtitle="Liquidación asalariado" variant="warning" icon={Users} />
                <StatCard title="A Propietario (Bruto)" value={formatCurrency(resumen.parte_patron)} subtitle="Antes de gastos" variant="success" icon={Wallet} />
                <StatCard title="Combustible" value={formatCurrency(resumen.combustible)} subtitle="Descontado en partes" variant="danger" icon={Fuel} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-5">
                    <h3 className="mb-4 text-lg font-medium text-zinc-100 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-amber-500" />
                        Balance del Patrón
                    </h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Ingresos (Parte Patrón)</span>
                            <span className="font-medium text-emerald-400">+{formatCurrency(resumen.parte_patron)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Gastos Variables del Periodo</span>
                            <span className="font-medium text-red-400">-{formatCurrency(totalGastosVariables)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Prorrateo Fijo (Estimación 1 mes)</span>
                            <span className="font-medium text-red-500">-{formatCurrency(totalFijosMensuales)}</span>
                        </div>
                        <div className="flex justify-between pt-2 text-base font-bold">
                            <span className="text-zinc-100">Beneficio Neto Estimado</span>
                            <span className={beneficioEstimadoPatron >= 0 ? "text-emerald-500" : "text-red-500"}>
                                {formatCurrency(beneficioEstimadoPatron)}
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
                            <span className="text-zinc-400">Total Efectivo (Metálico)</span>
                            <span className="font-medium text-zinc-300">{formatCurrency(resumen.bruto - resumen.datafono)}</span>
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

export default function InformesPage({ searchParams }: Props) {
    const params = use(searchParams);

    return (
        <>
            <PageHeader
                title="Informes y Cierres"
                description="Liquidaciones, balances y estado financiero del periodo seleccionado."
            >
                <PeriodFilter />
            </PageHeader>

            <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-32 bg-zinc-800 rounded-xl" /></div>}>
                <InformesContent searchParams={params} />
            </Suspense>
        </>
    );
}
