'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

export default function IncidenciasPage() {
    const [incidencias, setIncidencias] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState('');

    useEffect(() => { loadIncidencias(); }, [filtro]);

    async function loadIncidencias() {
        setLoading(true);
        const token = getToken();
        if (!token) return;

        try {
            const query = filtro ? `?estado=${filtro}` : '';
            const res = await apiFetch<any>(`/api/incidencias${query}`, { token });
            setIncidencias(res.data || []);
        } catch (error) {
            console.error('Error loading incidencias:', error);
        } finally {
            setLoading(false);
        }
    }

    async function cerrarIncidencia(id: string) {
        const token = getToken();
        if (!token) return;

        try {
            await apiFetch(`/api/incidencias/${id}/cerrar`, { method: 'PATCH', token });
            loadIncidencias();
        } catch (error) {
            console.error('Error cerrando incidencia:', error);
        }
    }

    return (
        <div className="p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Incidencias</h1>
                    <p className="text-slate-400 mt-1">Gestión de incidencias reportadas</p>
                </div>

                <div className="flex gap-2">
                    {['', 'CREADA', 'CERRADA'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFiltro(f)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filtro === f
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                                }`}
                        >
                            {f || 'Todas'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <svg className="animate-spin h-8 w-8 text-amber-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : incidencias.length === 0 ? (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-12 text-center">
                    <span className="text-4xl mb-4 block">✅</span>
                    <p className="text-slate-400">No hay incidencias {filtro ? `con estado ${filtro}` : ''}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {incidencias.map((inc) => (
                        <div key={inc.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600/50 transition-all">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${inc.estado === 'CREADA' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                                            }`}>
                                            {inc.estado}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(inc.createdAt).toLocaleDateString('es-ES')}
                                        </span>
                                    </div>
                                    <h3 className="text-white font-medium mb-1">{inc.queOcurrio}</h3>
                                    <p className="text-sm text-slate-400 mb-1">
                                        <strong>Decisión:</strong> {inc.decisionTomada}
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        <strong>Justificación:</strong> {inc.justificacion}
                                    </p>
                                    <div className="flex gap-4 mt-3 text-xs text-slate-500">
                                        <span>📝 Parte: {inc.parteDiario?.conductor?.nombre || '—'}</span>
                                        <span>🚕 {inc.parteDiario?.vehiculo?.matricula || '—'}</span>
                                    </div>
                                </div>

                                {inc.estado === 'CREADA' && (
                                    <button
                                        onClick={() => cerrarIncidencia(inc.id)}
                                        className="ml-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-medium hover:bg-emerald-500/20 transition-all"
                                    >
                                        Cerrar
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
