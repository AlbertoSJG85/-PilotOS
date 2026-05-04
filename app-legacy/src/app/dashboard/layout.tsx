'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken, getUser, removeToken } from '@/lib/api';

const navItems = [
    { href: '/dashboard', label: 'Panel', icon: '📊' },
    { href: '/dashboard/partes', label: 'Partes', icon: '📝' },
    { href: '/dashboard/gastos', label: 'Gastos', icon: '💰' },
    { href: '/dashboard/incidencias', label: 'Incidencias', icon: '⚠️' },
    { href: '/dashboard/mantenimientos', label: 'Mantenimientos', icon: '🔧' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUserState] = useState<any>(null);

    useEffect(() => {
        const token = getToken();
        const u = getUser();
        if (!token || !u) {
            router.push('/login');
            return;
        }
        if (u.rol !== 'PATRON') {
            router.push('/parte');
            return;
        }
        setUserState(u);
    }, [router]);

    function handleLogout() {
        removeToken();
        localStorage.removeItem('pilotos_user');
        router.push('/login');
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-800/60 backdrop-blur-xl border-r border-slate-700/50 flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                            <span className="text-lg">🚕</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">PilotOS</h1>
                            <p className="text-xs text-slate-400">Dashboard Patrón</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                    }`}
                            >
                                <span className="text-lg">{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User section */}
                <div className="p-4 border-t border-slate-700/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-sm font-bold text-white">
                            {user.nombre?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user.nombre}</p>
                            <p className="text-xs text-slate-400">{user.rol}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
                    >
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
