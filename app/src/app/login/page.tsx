'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken, setUser } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const [telefono, setTelefono] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const data = await apiFetch<any>('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ telefono }),
            });

            setToken(data.token);
            setUser(data.usuario);

            // Redirect based on role
            if (data.usuario.rol === 'PATRON') {
                router.push('/dashboard');
            } else {
                router.push('/parte');
            }
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
                        <span className="text-3xl">🚕</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white">PilotOS</h1>
                    <p className="text-slate-400 mt-2">Gestión integral de taxi</p>
                </div>

                {/* Login Form */}
                <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 shadow-2xl">
                    <h2 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Número de teléfono
                            </label>
                            <input
                                type="tel"
                                value={telefono}
                                onChange={(e) => setTelefono(e.target.value)}
                                placeholder="+34 600 000 000"
                                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !telefono}
                            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Entrando...
                                </span>
                            ) : 'Entrar'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-slate-500 text-sm mt-6">
                    ¿No tienes cuenta? Contacta con tu patrón o escribe a GlorIA por WhatsApp.
                </p>
            </div>
        </div>
    );
}
