'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button, Input } from '@/components/ui';
import { login, establecerPassword, pedirCodigoActivacion, pedirCodigoRecuperacion, restablecerPassword, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';
import type { LoginResponse } from '@/types';

function aplicarSesion(res: LoginResponse) {
  // PIL-04: la respuesta ya no trae token. La sesión llegó en la cookie
  // `HttpOnly` que puso el backend; aquí solo se guarda quién es.
  if (!res.user) return;
  setSession({
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
  const [modo, setModo] = useState<'login' | 'set-password' | 'pedir-codigo' | 'restablecer' | 'activar'>('login');
  // Viene de terminar el alta: se le explica qué hacer ahora (el siguiente paso, sin esto, no es obvio).
  const [recienAlta, setRecienAlta] = useState(false);
  useEffect(() => {
    setRecienAlta(new URLSearchParams(window.location.search).get('alta') === 'ok');
  }, []);
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
        // La cuenta existe pero nadie la ha activado. Pedimos el codigo aqui
        // mismo: el telefono ya esta escrito, asi que obligar a teclearlo otra
        // vez en una pantalla aparte solo sumaria un paso sin aportar nada.
        setError('');
        await pedirCodigoActivacion(telefono.trim()).catch(() => { /* respuesta neutra: nada que mirar */ });
        setAviso('Te hemos enviado un codigo a tu correo para activar la cuenta.');
        setModo('set-password');
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

  // Primera vez: la cuenta existe pero aún no tiene contraseña. Se pide el
  // código directamente; antes había que escribir una contraseña cualquiera
  // en el login para que la app se diera cuenta y lo mandara.
  async function handleActivar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await pedirCodigoActivacion(telefono.trim());
      // Respuesta neutra a propósito: no se dice si el teléfono existe.
      setAviso('Si ese teléfono tiene una cuenta por activar, te hemos enviado un código a su correo. Si en unos minutos no llega nada, probablemente ya la activaste: vuelve atrás y entra con tu contraseña.');
      setModo('set-password');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el código');
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
      const res = await establecerPassword(telefono.trim(), codigo.trim(), password);
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
        {/* Identidad: PilotOS y de quién es.
            "by NexOS" se escribe tal cual, sin mayúsculas forzadas: la marca
            es "NexOS", no "NEXOS". El "OS" va en el azul de la casa (#158FFF,
            muestreado del logotipo oficial). */}
        <div className="mb-10 flex flex-col items-center">
          <Image
            src="/branding/pilotos/logo-compact.png"
            alt="PilotOS"
            width={200}
            height={52}
            className="h-14 w-auto object-contain"
            priority
          />

          <p className="mt-2.5 text-[11px] font-medium tracking-wide text-zinc-600">
            by <span className="text-zinc-300">Nex</span><span className="text-nexos-blue">OS</span>
          </p>
        </div>

        {/* Formulario */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
          {modo === 'login' ? (
            <>
              {recienAlta && (
                <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-3 text-sm text-emerald-300">
                  <p className="font-semibold">¡Listo, ya tienes tu cuenta!</p>
                  <p className="mt-1 text-emerald-200/80">
                    Ahora tienes que activarla: te enviaremos un código a tu correo y con él eliges tu contraseña.
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    className="mt-3 w-full"
                    onClick={() => { setModo('activar'); setError(''); }}
                  >
                    Activar mi cuenta
                  </Button>
                </div>
              )}
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

                <button
                  type="button"
                  className="w-full text-center text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => { setModo('activar'); setError(''); setPassword(''); }}
                >
                  Es mi primera vez: activar mi cuenta
                </button>
              </form>
            </>
          ) : modo === 'activar' ? (
            <>
              <p className="mb-6 text-sm text-zinc-400 text-center">
                Escribe tu teléfono y te enviaremos un código al correo con el que te diste de alta.
              </p>

              <form onSubmit={handleActivar} className="space-y-5">
                <Input
                  label="Telefono"
                  type="tel"
                  placeholder="34600123456"
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
                {aviso || 'Tu cuenta todavia no tiene contrasena. Crea una para continuar.'}
              </p>

              <form onSubmit={handleSetPassword} className="space-y-5">
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
                  {loading ? 'Guardando...' : 'Establecer contrasena y entrar'}
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
          )}
        </div>

        <div className="mt-6 space-y-2 text-center text-xs text-zinc-600">
          <p>
            Tienes un taxi o una flota?{' '}
            <Link href="/onboarding" className="font-semibold text-pilotos-yellow hover:underline">
              Darme de alta
            </Link>
          </p>
          <p>Si eres conductor, tu patron te da de alta y recibiras un correo.</p>
        </div>
      </div>
    </div>
  );
}
