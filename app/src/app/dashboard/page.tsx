'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface DashboardData {
    ingresos: { total: number; count: number };
    gastos: { total: number; count: number };
    anomalias: { total: number; criticas: number };
    mantenimientos: { pendientes: number; vencidos: number };
    partesRecientes: any[];
}

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState('mes');

    useEffect(() => {
        loadDashboard();
    }, [periodo]);

    async function loadDashboard() {
        setLoading(true);
        const token = getToken();
        if (!token) return;

        try {
            // Load multiple endpoints in parallel
            const [partesRes, gastosRes, anomaliasRes] = await Promise.all([
                apiFetch<any>('/api/partes', { token }),
                apiFetch<any>('/api/gastos/resumen', { token }),
                apiFetch<any>('/api/anomalias', { token }),
            ]);

            const partes = partesRes.data || [];
            const ingresoTotal = partes.reduce((sum: number, p: any) => sum + (p.ingresoTotal || 0), 0);
            const anomalias = anomaliasRes.data || [];

            setData({
                ingresos: { total: ingresoTotal, count: partes.length },
                gastos: { total: gastosRes.total?.importe || 0, count: gastosRes.total?.cantidad || 0 },
                anomalias: {
                    total: anomalias.length,
                    criticas: anomalias.filter((a: any) => a.tipo === 'CRITICA').length
                },
                mantenimientos: { pendientes: 0, vencidos: 0 },
                partesRecientes: partes.slice(0, 10),
            });
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="text-center">
                    <svg className="animate-spin h-10 w-10 text-amber-500 mx-auto mb-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-slate-400">Cargando datos...</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const stats = [
        {
            label: 'Ingresos',
            value: `${data.ingresos.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`,
            sub: `${data.ingresos.count} partes`,
            icon: '💶',
            color: 'from-emerald-400 to-teal-500',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/20',
        },
        {
            label: 'Gastos',
            value: `${data.gastos.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`,
            sub: `${data.gastos.count} registros`,
            icon: '💸',
            color: 'from-rose-400 to-pink-500',
            bgColor: 'bg-rose-500/10',
            borderColor: 'border-rose-500/20',
        },
        {
            label: 'Anomalías',
            value: data.anomalias.total.toString(),
            sub: `${data.anomalias.criticas} críticas`,
            icon: '⚡',
            color: 'from-amber-400 to-orange-500',
            bgColor: 'bg-amber-500/10',
            borderColor: 'border-amber-500/20',
        },
        {
            label: 'Mantenimientos',
            value: data.mantenimientos.pendientes.toString(),
            sub: `${data.mantenimientos.vencidos} vencidos`,
            icon: '🔧',
            color: 'from-blue-400 to-indigo-500',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/20',
        },
    ];

    return (
        <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Panel de Control</h1>
                    <p className="text-slate-400 mt-1">Resumen general de tu negocio</p>
                </div>

                <select
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                    <option value="semana">Esta semana</option>
                    <option value="mes">Este mes</option>
                    <option value="trimestre">Este trimestre</option>
                    <option value="año">Este año</option>
                </select>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className={`${stat.bgColor} ${stat.borderColor} border rounded-2xl p-5 backdrop-blur-sm transition-transform hover:scale-[1.02]`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-2xl">{stat.icon}</span>
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{stat.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                        <p className="text-sm text-slate-400 mt-1">{stat.sub}</p>
                    </div>
                ))}
            </div>

            {/* Recent Partes Table */}
            <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-700/50">
                    <h2 className="text-lg font-semibold text-white">Últimos Partes Diarios</h2>
                </div>

                {data.partesRecientes.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        No hay partes registrados aún.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700/50">
                                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Fecha</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Conductor</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Vehículo</th>
                                    <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Ingreso</th>
                                    <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Datáfono</th>
                                    <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Km</th>
                                    <th className="text-center px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/30">
                                {data.partesRecientes.map((parte: any) => (
                                    <tr key={parte.id} className="hover:bg-slate-700/20 transition-colors">
                                        <td className="px-5 py-4 text-sm text-slate-300">
                                            {new Date(parte.fechaTrabajada).toLocaleDateString('es-ES')}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-white font-medium">
                                            {parte.conductor?.nombre || '—'}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-300">
                                            {parte.vehiculo?.matricula || '—'}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-emerald-400 text-right font-medium">
                                            {parte.ingresoTotal?.toFixed(2)} €
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-300 text-right">
                                            {parte.ingresoDatafono?.toFixed(2)} €
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-300 text-right">
                                            {(parte.kmFin - parte.kmInicio).toLocaleString()} km
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${parte.estado === 'ENVIADO' ? 'bg-emerald-500/10 text-emerald-400' :
                                                    parte.estado === 'FOTO_SUSTITUIDA' ? 'bg-amber-500/10 text-amber-400' :
                                                        'bg-slate-500/10 text-slate-400'
                                                }`}>
                                                {parte.estado}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
