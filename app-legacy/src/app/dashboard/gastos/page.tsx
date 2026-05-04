'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

export default function GastosPage() {
    const [gastos, setGastos] = useState<any[]>([]);
    const [resumen, setResumen] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [filtroTipo, setFiltroTipo] = useState('');

    useEffect(() => { loadGastos(); }, [filtroTipo]);

    async function loadGastos() {
        setLoading(true);
        const token = getToken();
        if (!token) return;

        try {
            const query = filtroTipo ? `?tipo=${filtroTipo}` : '';
            const [gastosRes, resumenRes] = await Promise.all([
                apiFetch<any>(`/api/gastos${query}`, { token }),
                apiFetch<any>('/api/gastos/resumen', { token }),
            ]);

            setGastos(gastosRes.data || []);
            setResumen(resumenRes);
        } catch (error) {
            console.error('Error loading gastos:', error);
        } finally {
            setLoading(false);
        }
    }

    const tipos = ['', 'COMBUSTIBLE', 'MANTENIMIENTO', 'SEGURO', 'IMPUESTO', 'OTRO'];

    return (
        <div className="p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Gastos</h1>
                    <p className="text-slate-400 mt-1">Control de facturas y pagos</p>
                </div>
            </div>

            {/* Resumen Cards */}
            {resumen && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total Gastos</p>
                        <p className="text-2xl font-bold text-white">
                            {(resumen.total?.importe || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </p>
                        <p className="text-sm text-slate-400 mt-1">{resumen.total?.cantidad || 0} registros</p>
                    </div>

                    {(resumen.porTipo || []).slice(0, 2).map((t: any) => (
                        <div key={t.tipo} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
                            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{t.tipo}</p>
                            <p className="text-2xl font-bold text-white">
                                {(t._sum?.importe || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </p>
                            <p className="text-sm text-slate-400 mt-1">{t._count?.id || 0} registros</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {tipos.map(t => (
                    <button
                        key={t}
                        onClick={() => setFiltroTipo(t)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${filtroTipo === t
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                            }`}
                    >
                        {t || 'Todos'}
                    </button>
                ))}
            </div>

            {/* Gastos List */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <svg className="animate-spin h-8 w-8 text-amber-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : gastos.length === 0 ? (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-12 text-center">
                    <span className="text-4xl mb-4 block">💰</span>
                    <p className="text-slate-400">No hay gastos registrados</p>
                </div>
            ) : (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-700/50">
                                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Fecha</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Tipo</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Descripción</th>
                                <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Importe</th>
                                <th className="text-center px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                            {gastos.map((gasto: any) => (
                                <tr key={gasto.id} className="hover:bg-slate-700/20 transition-colors">
                                    <td className="px-5 py-4 text-sm text-slate-300">
                                        {new Date(gasto.fecha).toLocaleDateString('es-ES')}
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
                                            {gasto.tipo}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-white">{gasto.descripcion}</td>
                                    <td className="px-5 py-4 text-sm text-rose-400 text-right font-medium">
                                        {gasto.importe?.toFixed(2)} €
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                                            {gasto.estado}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
