'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

export default function PartesPage() {
    const [partes, setPartes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadPartes(); }, []);

    async function loadPartes() {
        setLoading(true);
        const token = getToken();
        if (!token) return;

        try {
            const res = await apiFetch<any>('/api/partes', { token });
            setPartes(res.data || []);
        } catch (error) {
            console.error('Error loading partes:', error);
        } finally {
            setLoading(false);
        }
    }

    const totalIngresos = partes.reduce((sum, p) => sum + (p.ingresoTotal || 0), 0);
    const totalKm = partes.reduce((sum, p) => sum + ((p.kmFin || 0) - (p.kmInicio || 0)), 0);

    return (
        <div className="p-6 lg:p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Partes Diarios</h1>
                <p className="text-slate-400 mt-1">Historial completo de partes enviados</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{totalIngresos.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
                    <p className="text-xs text-slate-400">Ingresos Totales</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-400">{totalKm.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">Km Totales</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-bold text-amber-400">{partes.length}</p>
                    <p className="text-xs text-slate-400">Partes Enviados</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <svg className="animate-spin h-8 w-8 text-amber-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : partes.length === 0 ? (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-12 text-center">
                    <span className="text-4xl mb-4 block">📝</span>
                    <p className="text-slate-400">No hay partes registrados</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {partes.map((parte: any) => (
                        <div key={parte.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600/50 transition-all">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-sm font-medium text-white">
                                            {new Date(parte.fechaTrabajada).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </span>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${parte.estado === 'ENVIADO' ? 'bg-emerald-500/10 text-emerald-400' :
                                                parte.estado === 'FOTO_SUSTITUIDA' ? 'bg-amber-500/10 text-amber-400' :
                                                    'bg-slate-500/10 text-slate-400'
                                            }`}>
                                            {parte.estado}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-6 text-sm text-slate-400">
                                        <span>👤 {parte.conductor?.nombre || '—'}</span>
                                        <span>🚕 {parte.vehiculo?.matricula || '—'}</span>
                                        <span>📍 {((parte.kmFin || 0) - (parte.kmInicio || 0)).toLocaleString()} km</span>
                                        {parte.turno && <span>🕐 {parte.turno}</span>}
                                    </div>
                                </div>

                                <div className="text-right ml-6">
                                    <p className="text-lg font-bold text-emerald-400">
                                        {parte.ingresoTotal?.toFixed(2)} €
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Datáfono: {parte.ingresoDatafono?.toFixed(2)} €
                                    </p>
                                </div>
                            </div>

                            {parte._count?.anomalias > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-700/30">
                                    <span className="text-xs text-amber-400">
                                        ⚡ {parte._count.anomalias} anomalía(s) detectada(s)
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
