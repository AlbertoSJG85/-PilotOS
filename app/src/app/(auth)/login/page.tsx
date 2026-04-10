'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
        router.replace('/conductor');
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
      {/* Fondo sutil con degradado */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-pilot-teal/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-pilot-lime/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <Image
            src="/branding/pilotos/logo-compact.png"
            alt="PilotOS"
            width={200}
            height={52}
            className="h-14 w-auto object-contain"
            priority
          />
          <p className="text-xs tracking-widest text-zinc-600 uppercase font-medium">
            by NexOS
          </p>
        </div>

        {/* Formulario */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
          <p className="mb-6 text-sm text-zinc-400 text-center">
            Introduce tu numero de telefono para acceder
          </p>

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
              <p className="rounded-lg bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Si no tienes cuenta, contacta con tu patron o administrador.
        </p>
      </div>
    </div>
  );
}
