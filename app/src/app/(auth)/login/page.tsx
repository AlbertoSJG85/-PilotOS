'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button, Input } from '@/components/ui';
import { login, establecerPassword, pedirCodigoRecuperacion, restablecerPassword, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';
import type { LoginResponse } from '@/types';

function aplicarSesion(res: LoginResponse) {
  if (!res.token || !res.user) return;
  setSession(res.token, {
    id: res.user.id,
    nombre: res.user.nombre,
    telefono: res.user.telefono,
    role: res.user.role,
    cliente_id: res.context?.cliente_id ?? null,
    conductor_id: res.context?.conductor_id ?? null,
    es_patron: res.context?.es_patron ?? false,
    tiene_asalariados: res.context?.tiene_asalariados ?? false,
  });
}

export default function LoginPage() {
  const router = useRouter();
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  // 'login': formulario normal. 'set-password': cuenta sin contrasena todavia
  // (creada antes de la Fase 1 de seguridad), hay que fijarla antes de entrar.
  const [modo, setModo] = useState<'login' | 'set-password' | 'pedir-codigo' | 'restablecer'>('login');
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(telefono.trim(), password);

      if (res.action === 'REDIRECT_ONBOARDING') {
        router.replace('/onboarding');
        return;
      }

      aplicarSesion(res);
      router.replace('/conductor');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'password_not_set') {
        setModo('set-password');
        setError('');
        return;
      }
      const msg = err instanceof ApiError ? err.message : 'Error al iniciar sesion';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handlePedirCodigo(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await pedirCodigoRecuperacion(telefono.trim());
      // El backend responde igual exista o no la cuenta, a proposito: si
      // dijera "ese telefono no esta registrado", cualquiera podria averiguar
      // quien usa PilotOS probando numeros. Aqui reflejamos eso tal cual.
      setAviso('Si el telefono corresponde a una cuenta, recibiras un codigo en tu correo.');
      setModo('restablecer');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el codigo');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestablecer(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await restablecerPassword(telefono.trim(), codigo.trim(), password);
      aplicarSesion(res);
      router.replace('/conductor');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contrasena');
    } finally {
      setLoading(false);
    }
  }

  function volverALogin() {
    setModo('login');
    setError('');
    setAviso('');
    setCodigo('');
    setPassword('');
    setPassword2('');
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await establecerPassword(telefono.trim(), password);
      aplicarSesion(res);
      router.replace('/conductor');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Error al establecer la contrasena';
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
          {modo === 'login' ? (
            <>
              <p className="mb-6 text-sm text-zinc-400 text-center">
                Introduce tu telefono y contrasena para acceder
              </p>

              <form onSubmit={handleLogin} className="space-y-5">
                <Input
                  label="Telefono"
                  type="tel"
                  placeholder="34600000001"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  required
                  autoComplete="tel"
                />
                <Input
                  label="Contrasena"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />

                {error && (
                  <p className="rounded-lg bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>

                <button
                  type="button"
                  className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={() => { setModo('pedir-codigo'); setError(''); setPassword(''); }}
                >
                  He olvidado mi contrasena
                </button>
              </form>
            </>
          ) : modo === 'pedir-codigo' ? (
            <>
              <p className="mb-6 text-sm text-zinc-400 text-center">
                Te enviaremos un codigo al correo de tu cuenta.
              </p>

              <form onSubmit={handlePedirCodigo} className="space-y-5">
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
                  {loading ? 'Enviando...' : 'Enviarme el codigo'}
                </Button>

                <button
                  type="button"
                  className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={volverALogin}
                >
                  Volver
                </button>
              </form>
            </>
          ) : modo === 'restablecer' ? (
            <>
              {aviso && (
                <p className="mb-6 rounded-lg bg-zinc-800/60 border border-zinc-700 px-3 py-2 text-sm text-zinc-300 text-center">
                  {aviso}
                </p>
              )}

              <form onSubmit={handleRestablecer} className="space-y-5">
                <Input
                  label="Codigo recibido"
                  type="text"
                  inputMode="numeric"
                  placeholder="6 digitos"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                  autoComplete="one-time-code"
                />
                <Input
                  label="Nueva contrasena"
                  type="password"
                  placeholder="Minimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Input
                  label="Repite la contrasena"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  autoComplete="new-password"
                />

                {error && (
                  <p className="rounded-lg bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Guardando...' : 'Cambiar contrasena y entrar'}
                </Button>

                <button
                  type="button"
                  className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={volverALogin}
                >
                  Volver
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-zinc-400 text-center">
                Tu cuenta todavia no tiene contrasena. Crea una para continuar.
              </p>

              <form onSubmit={handleSetPassword} className="space-y-5">
                <Input
                  label="Nueva contrasena"
                  type="password"
                  placeholder="Minimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Input
                  label="Repite la contrasena"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  autoComplete="new-password"
                />

                {error && (
                  <p className="rounded-lg bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Guardando...' : 'Establecer contrasena y entrar'}
                </Button>

                <button
                  type="button"
                  className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={() => { setModo('login'); setError(''); setPassword(''); setPassword2(''); }}
                >
                  Volver
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Si no tienes cuenta, contacta con tu patron o administrador.
        </p>
      </div>
    </div>
  );
}
