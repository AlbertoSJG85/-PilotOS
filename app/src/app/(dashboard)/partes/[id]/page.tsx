'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button } from '@/components/ui';
import { getParte } from '@/lib/api';
import { formatCurrency, formatDate, formatKm } from '@/lib/utils';
import type { ParteDiario } from '@/types';
import { ChevronLeft } from 'lucide-react';

const ESTADO_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
    ENVIADO: 'info',
    VALIDADO: 'success',
    FOTO_ILEGIBLE: 'danger',
    FOTO_SUSTITUIDA: 'warning',
    CON_INCIDENCIA: 'danger',
};

export default function DetallePartePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const [parte, setParte] = useState<ParteDiario | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        getParte(id)
            .then((res) => {
                if (res.data) setParte(res.data);
            })
            .catch((err) => {
                setError(err.message || 'Error al cargar el parte');
            })
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <>
                <div className="mb-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()}>
                        <ChevronLeft className="mr-1 h-4 w-4" /> Volver
                    </Button>
                </div>
                <Skeleton className="h-20 w-full mb-6" />
                <div className="grid gap-6 md:grid-cols-2">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </>
        );
    }

    if (error || !parte) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <p className="text-zinc-400">{error || 'Parte no encontrado'}</p>
                <Button className="mt-4" onClick={() => router.back()}>Volver</Button>
            </div>
        );
    }

    const distancia = parte.km_fin - (parte.km_inicio || 0);

    return (
        <>
            <div className="mb-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-3">
                    <ChevronLeft className="mr-1 h-4 w-4" /> Volver
                </Button>
            </div>

            <PageHeader
                title={`Parte del ${formatDate(parte.fecha_trabajada)}`}
                description={parte.conductor?.usuario?.nombre || 'Conductor desconocido'}
            >
                <Badge variant={ESTADO_BADGE[parte.estado] || 'default'} className="text-sm px-3 py-1">
                    {parte.estado}
                </Badge>
            </PageHeader>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Info Vehiculo & Conductor */}
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Operativa</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Vehículo</span>
                            <span className="font-medium text-zinc-100">{parte.vehiculo?.matricula || '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Modelo</span>
                            <span className="text-zinc-100">{parte.vehiculo?.marca} {parte.vehiculo?.modelo}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Kilometraje Hoy</span>
                            <span className="font-bold text-zinc-100">{formatKm(distancia)}</span>
                        </div>
                        <div className="text-xs text-zinc-500 pt-1 flex justify-between">
                            <span>Inicio: {formatKm(parte.km_inicio || 0)}</span>
                            <span>Fin: {formatKm(parte.km_fin)}</span>
                        </div>
                    </div>
                </Card>

                {/* Info Economica Bruta */}
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Recaudación y Gastos</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Bruto Total</span>
                            <span className="font-bold text-emerald-400">{formatCurrency(parte.ingreso_bruto)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Ingreso Datáfono</span>
                            <span className="text-zinc-100">{formatCurrency(parte.ingreso_datafono || 0)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800 pb-2">
                            <span className="text-zinc-400">Combustible</span>
                            <span className="text-rose-400">{parte.combustible ? `-${formatCurrency(parte.combustible)}` : '0.00 €'}</span>
                        </div>
                        <div className="flex justify-between pb-2">
                            <span className="text-zinc-400">Varios ({parte.concepto_varios || ''})</span>
                            <span className="text-rose-400">{parte.varios ? `-${formatCurrency(parte.varios)}` : '0.00 €'}</span>
                        </div>
                    </div>
                </Card>

                {/* Reparto (si existe cálculo) */}
                {parte.calculo && (
                    <Card className="p-6 md:col-span-2 bg-zinc-900/50 border-pilot-lime/20">
                        <h3 className="text-sm font-semibold text-pilot-lime mb-4 uppercase tracking-wider">Reparto Económico (Neto)</h3>
                        <div className="grid gap-6 sm:grid-cols-3">
                            <div className="flex flex-col">
                                <span className="text-xs text-zinc-400 mb-1">Beneficio Neto Diario</span>
                                <span className="text-2xl font-bold text-zinc-100">{formatCurrency(parte.calculo.neto_diario)}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-zinc-400 mb-1">Parte Conductor</span>
                                <span className="text-2xl font-bold border-l-2 border-emerald-500 pl-3 text-zinc-100">
                                    {formatCurrency(parte.calculo.parte_conductor)}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-zinc-400 mb-1">Parte Propietario</span>
                                <span className="text-2xl font-bold border-l-2 border-pilot-lime pl-3 text-zinc-100">
                                    {formatCurrency(parte.calculo.parte_patron)}
                                </span>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Documentos Relacionados */}
                {parte.documentos && parte.documentos.length > 0 && (
                    <Card className="p-6 md:col-span-2">
                        <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Documentos y Tickets ({parte.documentos.length})</h3>
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                            {parte.documentos.map((dLink: any) => (
                                <a
                                    key={dLink.id}
                                    href={dLink.documento.url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center justify-center p-4 border border-zinc-800 rounded-lg bg-zinc-950 hover:bg-zinc-800 transition-colors"
                                >
                                    <span className="text-sm font-medium text-zinc-200">{dLink.documento.tipo}</span>
                                    <span className="text-xs text-pilot-lime mt-1">Ver documento &rarr;</span>
                                </a>
                            ))}
                        </div>
                    </Card>
                )}

            </div>
        </>
    );
}
