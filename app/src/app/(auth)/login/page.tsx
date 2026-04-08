'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { login } from '@/lib/api';
import { setSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(telefono.trim());

      if (res.action === 'REDIRECT_ONBOARDING') {
        router.replace('/onboarding');
        return;
      }

      if (res.token && res.user) {
        setSession(res.token, {
          id: res.user.id,
          nombre: res.user.nombre,
          telefono: res.user.telefono,
          role: res.user.role,
          cliente_id: res.context?.cliente_id ?? null,
          conductor_id: res.context?.conductor_id ?? null,
          es_patron: res.context?.es_patron ?? false,
        });
        router.replace(res.context?.es_patron ? '/admin' : '/conductor');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesion';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-zinc-100">
            Pilot<span className="text-amber-500">OS</span>
          </h1>
          <p className="mt-1 text-xs tracking-widest text-zinc-600">by NexOS</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Telefono"
            type="tel"
            placeholder="34600000001"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required
            autoComplete="tel"
          />

          {error && (
            <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Si no tienes cuenta, contacta con tu patron o administrador.
        </p>
      </div>
    </div>
  );
}
