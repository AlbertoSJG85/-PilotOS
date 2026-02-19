'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken, getUser } from '@/lib/api';

export default function MantenimientosPage() {
    const [mantenimientos, setMantenimientos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehiculoId, setVehiculoId] = useState('');
    const [vehiculos, setVehiculos] = useState<any[]>([]);
    const [resolviendo, setResolviendo] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (user?.vehiculos?.length > 0) {
            setVehiculos(user.vehiculos);
            setVehiculoId(user.vehiculos[0].id);
        }
    }, []);

    useEffect(() => {
        if (vehiculoId) loadMantenimientos();
    }, [vehiculoId]);

    async function loadMantenimientos() {
        setLoading(true);
        const token = getToken();
        if (!token) return;

        try {
            const res = await apiFetch<any>(`/api/mantenimientos/vehiculo/${vehiculoId}`, { token });
            setMantenimientos(res.data || []);
        } catch (error) {
            console.error('Error loading mantenimientos:', error);
        } finally {
            setLoading(false);
        }
    }

    async function resolverMantenimiento(id: string) {
        const token = getToken();
        if (!token) return;

        setResolviendo(id);
        try {
            await apiFetch(`/api/mantenimientos/${id}/resolver`, {
                method: 'POST',
                token,
                body: JSON.stringify({ kmEjecucion: null }),
            });
            loadMantenimientos();
        } catch (error) {
            console.error('Error resolviendo:', error);
        } finally {
            setResolviendo(null);
        }
    }

    const estadoConfig: Record<string, { label: string; color: string; icon: string }> = {
        PENDIENTE: { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: '🟡' },
        VENCIDO: { label: 'Vencido', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: '🔴' },
        RESUELTO: { label: 'Resuelto', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '✅' },
    };

    return (
        <div className="p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Mantenimientos</h1>
                    <p className="text-slate-400 mt-1">Estado de mantenimientos por vehículo</p>
                </div>

                {vehiculos.length > 1 && (
                    <select
                        value={vehiculoId}
                        onChange={(e) => setVehiculoId(e.target.value)}
                        className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                        {vehiculos.map((v: any) => (
                            <option key={v.id} value={v.id}>
                                {v.matricula} — {v.marca} {v.modelo}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { label: 'Pendientes', count: mantenimientos.filter(m => m.estado === 'PENDIENTE').length, icon: '🟡' },
                    { label: 'Vencidos', count: mantenimientos.filter(m => m.estado === 'VENCIDO').length, icon: '🔴' },
                    { label: 'Resueltos', count: mantenimientos.filter(m => m.estado === 'RESUELTO').length, icon: '✅' },
                ].map(s => (
                    <div key={s.label} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 text-center">
                        <span className="text-2xl">{s.icon}</span>
                        <p className="text-2xl font-bold text-white mt-1">{s.count}</p>
                        <p className="text-xs text-slate-400">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Mantenimientos List */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <svg className="animate-spin h-8 w-8 text-amber-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : mantenimientos.length === 0 ? (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-12 text-center">
                    <span className="text-4xl mb-4 block">🔧</span>
                    <p className="text-slate-400">No hay mantenimientos registrados para este vehículo</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {mantenimientos.map((m) => {
                        const config = estadoConfig[m.estado] || estadoConfig.PENDIENTE;
                        return (
                            <div key={m.id} className={`border rounded-2xl p-5 transition-all hover:border-slate-600/50 ${m.estado === 'VENCIDO' ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-lg">{config.icon}</span>
                                            <h3 className="text-white font-medium">{m.catalogo?.nombre || '—'}</h3>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
                                                {config.label}
                                            </span>
                                        </div>
                                        <div className="flex gap-6 mt-2 text-sm text-slate-400">
                                            <span>📋 Tipo: {m.catalogo?.tipo?.replace('_', ' ') || '—'}</span>
                                            {m.proximoKm && <span>📍 Próximo: {m.proximoKm.toLocaleString()} km</span>}
                                            {m.proximaFecha && <span>📅 {new Date(m.proximaFecha).toLocaleDateString('es-ES')}</span>}
                                            {m.ultimaEjecucionKm && <span>✔ Último: {m.ultimaEjecucionKm.toLocaleString()} km</span>}
                                        </div>
                                    </div>

                                    {m.estado !== 'RESUELTO' && (
                                        <button
                                            onClick={() => resolverMantenimiento(m.id)}
                                            disabled={resolviendo === m.id}
                                            className="ml-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                                        >
                                            {resolviendo === m.id ? 'Resolviendo...' : 'Resolver'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
