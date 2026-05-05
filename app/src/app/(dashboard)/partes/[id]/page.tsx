'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button } from '@/components/ui';
import { getParte, uploadFoto, reemplazarFoto, reintentarOcr, eliminarFoto } from '@/lib/api';
import { formatCurrency, formatDate, formatKm } from '@/lib/utils';
import type { ParteDiario, Documento, Anomalia } from '@/types';
import {
    ChevronLeft, Camera, RefreshCw, AlertCircle, FileX,
    Trash2, Eye, RotateCcw, AlertTriangle, CheckCircle2,
    Clock, Zap,
} from 'lucide-react';

const ESTADO_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
    ENVIADO: 'info',
    VALIDADO: 'success',
    ILEGIBLE: 'danger',
    FOTO_ILEGIBLE: 'danger',
    FOTO_SUSTITUIDA: 'warning',
    CON_INCIDENCIA: 'danger',
    BORRADOR: 'default',
};

const ESTADO_OCR_LABEL: Record<string, { label: string; color: string }> = {
    PENDIENTE: { label: 'Pendiente', color: 'text-zinc-400' },
    PROCESADO: { label: 'Procesado', color: 'text-zinc-300' },
    ERROR:     { label: 'Error OCR', color: 'text-rose-400' },
    MANUAL:    { label: 'Manual', color: 'text-blue-400' },
};

export default function DetallePartePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const [parte, setParte] = useState<ParteDiario | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [replacingId, setReplacingId] = useState<string | null>(null);
    const [retryingId, setRetryingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

    const refresh = () => {
        setLoading(true);
        getParte(id)
            .then((res) => {
                if (res.data) setParte(res.data);
            })
            .catch((err) => setError(err.message || 'Error al cargar el parte'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { refresh(); }, [id]);

    const handleReplaceFoto = async (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setReplacingId(docId);
            const upload = await uploadFoto(file);
            await reemplazarFoto(docId, { url: upload.url, hash_sha256: upload.hash_sha256 });
            refresh();
        } catch (err: any) {
            alert(err.message || 'Error al reemplazar la foto');
        } finally {
            setReplacingId(null);
            e.target.value = '';
        }
    };

    const handleRetryOcr = async (docId: string) => {
        try {
            setRetryingId(docId);
            await reintentarOcr(docId);
            refresh();
        } catch (err: any) {
            alert(err.message || 'Error al reintentar OCR');
        } finally {
            setRetryingId(null);
        }
    };

    const handleDeleteFoto = async (docId: string) => {
        if (!parte) return;
        if (!confirm('¿Desvincular este documento del parte?')) return;
        try {
            setDeletingId(docId);
            await eliminarFoto(docId, parte.id);
            refresh();
        } catch (err: any) {
            alert(err.message || 'Error al eliminar el documento');
        } finally {
            setDeletingId(null);
        }
    };

    const markImgError = (id: string) =>
        setImgErrors((s) => new Set(s).add(id));

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
    const esBorrador = parte.estado === 'BORRADOR';
    const anomalias: Anomalia[] = (parte as any).anomalias || [];
    const anomaliasCriticas = anomalias.filter((a) => a.tipo === 'CRITICA');
    const anomaliasNormales = anomalias.filter((a) => a.tipo === 'NORMAL');

    // Resumen combustible
    const docsGasoil = (parte.documentos || [])
        .map((e) => e.documento)
        .filter((d) => d.tipo === 'TICKET_GASOIL' || d.tipo === 'TICKET_COMBUSTIBLE');
    const sumaOcrGasoil = docsGasoil.reduce((acc, d) => {
        const datos = d.ocr_datos_extraidos as any;
        return acc + (typeof datos?.importe === 'number' ? datos.importe : 0);
    }, 0);
    const combustibleDeclarado = parte.combustible ? Number(parte.combustible) : 0;
    const difCombustible = Math.abs(sumaOcrGasoil - combustibleDeclarado);

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
                {/* Operativa */}
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

                {/* Recaudación */}
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
                            <span className="text-rose-400">
                                {parte.combustible ? `-${formatCurrency(parte.combustible)}` : '0.00 €'}
                            </span>
                        </div>
                        <div className="flex justify-between pb-2">
                            <span className="text-zinc-400">Varios ({parte.concepto_varios || ''})</span>
                            <span className="text-rose-400">
                                {parte.varios ? `-${formatCurrency(parte.varios)}` : '0.00 €'}
                            </span>
                        </div>
                    </div>
                </Card>

                {/* Reparto */}
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

                {/* Anomalías */}
                {anomalias.length > 0 && (
                    <Card className="p-6 md:col-span-2 border-amber-900/30 bg-amber-950/10">
                        <h3 className="text-sm font-semibold text-amber-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Anomalías detectadas ({anomalias.length})
                        </h3>
                        <div className="space-y-2">
                            {anomaliasCriticas.map((a) => (
                                <div key={a.id} className="flex items-start gap-3 p-3 rounded bg-rose-950/30 border border-rose-900/40">
                                    <Zap className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-semibold text-rose-300 uppercase mr-2">Crítica</span>
                                        <span className="text-sm text-rose-200">{a.descripcion}</span>
                                    </div>
                                </div>
                            ))}
                            {anomaliasNormales.map((a) => (
                                <div key={a.id} className="flex items-start gap-3 p-3 rounded bg-amber-950/20 border border-amber-900/30">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-amber-200">{a.descripcion}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Combustible — resumen OCR */}
                {docsGasoil.length > 0 && combustibleDeclarado > 0 && (
                    <Card className="p-6 md:col-span-2">
                        <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
                            Combustible — cotejo OCR
                        </h3>
                        <div className="flex items-center gap-6 flex-wrap">
                            <div>
                                <span className="text-xs text-zinc-500">Declarado</span>
                                <p className="text-xl font-bold text-zinc-100">{formatCurrency(combustibleDeclarado)}</p>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-500">Suma OCR ({docsGasoil.length} ticket{docsGasoil.length > 1 ? 's' : ''})</span>
                                <p className="text-xl font-bold text-zinc-100">
                                    {sumaOcrGasoil > 0 ? formatCurrency(sumaOcrGasoil) : '—'}
                                </p>
                            </div>
                            {sumaOcrGasoil > 0 && (
                                <div className={difCombustible > 0.5 ? 'text-rose-400' : 'text-emerald-400'}>
                                    <span className="text-xs text-zinc-500 block">Diferencia</span>
                                    <p className="text-xl font-bold">
                                        {difCombustible > 0.5
                                            ? `⚠ ${formatCurrency(difCombustible)}`
                                            : `✓ ${formatCurrency(difCombustible)}`}
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Documentos */}
                {parte.documentos && parte.documentos.length > 0 && (
                    <Card className="p-6 md:col-span-2">
                        <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
                            Documentos y Tickets ({parte.documentos.length})
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                            {parte.documentos.map((dLink) => {
                                const doc: Documento = dLink.documento;
                                const isIlegible = doc.estado === 'ILEGIBLE' || doc.estado === 'BLOQUEADO';
                                const isReplacing = replacingId === doc.id;
                                const isRetrying = retryingId === doc.id;
                                const isDeleting = deletingId === doc.id;
                                const hasImgError = imgErrors.has(doc.id);
                                const estadoOcr = ESTADO_OCR_LABEL[doc.estado_ocr || 'PENDIENTE'];
                                const datos = doc.ocr_datos_extraidos as any;
                                const pTotal = datos?.parc_total ?? datos?.importe;
                                const pDist = datos?.parc_dist_total;
                                const borrados = datos?.acum_borrados;

                                return (
                                    <div
                                        key={dLink.id}
                                        className="relative flex flex-col border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden"
                                    >
                                        {/* Miniatura */}
                                        <div className="h-28 bg-zinc-900 flex items-center justify-center overflow-hidden">
                                            {!hasImgError ? (
                                                <img
                                                    src={doc.url}
                                                    alt={doc.tipo}
                                                    className="w-full h-full object-cover"
                                                    onError={() => markImgError(doc.id)}
                                                />
                                            ) : (
                                                <FileX className="w-10 h-10 text-zinc-700" />
                                            )}
                                        </div>

                                        <div className="p-4 flex flex-col gap-2 flex-1">
                                            {/* Cabecera */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-zinc-200">{doc.tipo.replace('TICKET_', '')}</span>
                                                <Badge
                                                    variant={ESTADO_BADGE[doc.estado] || 'default'}
                                                    className="text-[10px] px-1 py-0 uppercase"
                                                >
                                                    {doc.estado}
                                                </Badge>
                                            </div>

                                            {/* Estado OCR */}
                                            <div className="flex items-center gap-1.5">
                                                {doc.estado_ocr === 'ERROR' ? (
                                                    <AlertCircle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                                                ) : doc.estado_ocr === 'PROCESADO' && doc.estado === 'VALIDO' ? (
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                                ) : (
                                                    <Clock className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                                )}
                                                <span className={`text-[11px] ${estadoOcr.color}`}>{estadoOcr.label}</span>
                                                {doc.ocr_confianza != null && (
                                                    <span className="text-[11px] text-zinc-600 ml-auto">
                                                        {Math.round(doc.ocr_confianza)}%
                                                    </span>
                                                )}
                                            </div>

                                            {/* Datos OCR extractados */}
                                            {doc.tipo === 'TICKET_TAXIMETRO' && (pTotal !== undefined || pDist !== undefined || borrados !== undefined) && (
                                                <div className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-2 space-y-1">
                                                    {pTotal !== undefined && (
                                                        <div className="flex justify-between">
                                                            <span>P Total</span>
                                                            <span className="text-zinc-200 font-medium">{formatCurrency(pTotal)}</span>
                                                        </div>
                                                    )}
                                                    {pDist !== undefined && (
                                                        <div className="flex justify-between">
                                                            <span>P Dist.</span>
                                                            <span className="text-zinc-200">{pDist} km</span>
                                                        </div>
                                                    )}
                                                    {borrados !== undefined && (
                                                        <div className="flex justify-between">
                                                            <span>Borrados</span>
                                                            <span className="text-zinc-200">{borrados}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Alerta ilegible */}
                                            {isIlegible && (
                                                <div className="flex items-start gap-2 p-2 bg-rose-950/20 border border-rose-900/30 rounded text-[10px] text-rose-300">
                                                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                    <span>
                                                        {doc.estado === 'BLOQUEADO'
                                                            ? 'Bloqueado — máximo de intentos agotado.'
                                                            : 'No se pudo procesar. Sube una foto más nítida.'}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Acciones */}
                                            <div className="flex flex-col gap-1.5 mt-auto pt-2">
                                                <a
                                                    href={doc.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 bg-zinc-800 rounded text-zinc-100 hover:bg-zinc-700 transition-colors"
                                                >
                                                    <Eye className="w-3 h-3" /> Ver documento
                                                </a>

                                                {isIlegible && doc.estado !== 'BLOQUEADO' && (
                                                    <div className="relative">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            capture="environment"
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                                            onChange={(e) => handleReplaceFoto(doc.id, e)}
                                                            disabled={isReplacing}
                                                        />
                                                        <Button
                                                            variant="outline"
                                                            className="w-full text-xs gap-1.5 border-dashed border-rose-900/50 text-rose-400 hover:bg-rose-950/20"
                                                            disabled={isReplacing}
                                                        >
                                                            {isReplacing
                                                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                                                : <Camera className="w-3 h-3" />}
                                                            Reemplazar
                                                        </Button>
                                                    </div>
                                                )}

                                                {(isIlegible || doc.estado_ocr === 'ERROR') && (
                                                    <Button
                                                        variant="outline"
                                                        className="w-full text-xs gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                                                        disabled={isRetrying}
                                                        onClick={() => handleRetryOcr(doc.id)}
                                                    >
                                                        {isRetrying
                                                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                                                            : <RotateCcw className="w-3 h-3" />}
                                                        Reintentar OCR
                                                    </Button>
                                                )}

                                                {esBorrador && (
                                                    <Button
                                                        variant="outline"
                                                        className="w-full text-xs gap-1.5 border-zinc-800 text-zinc-500 hover:text-rose-400 hover:border-rose-900/50 hover:bg-rose-950/10"
                                                        disabled={isDeleting}
                                                        onClick={() => handleDeleteFoto(doc.id)}
                                                    >
                                                        {isDeleting
                                                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                                                            : <Trash2 className="w-3 h-3" />}
                                                        Eliminar
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                )}
            </div>
        </>
    );
}
