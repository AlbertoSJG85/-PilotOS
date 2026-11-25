'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@/components/ui';
import { AvisoError, MarcoPartners } from '@/components/features/partners/marco-partners';
import { partnersApi, ErrorPartners } from '@/lib/api/partners';

/** Entrada de las asociaciones (PilotOS Partners, DT-041). Una cuenta por asociación. */
export default function EntradaPartnersPage() {
  const router = useRouter();
  const [modo, setModo] = useState<'entrar' | 'olvido' | 'enviado'>('entrar');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await partnersApi.login(usuario, password);
      router.replace('/partners/panel');
    } catch (err) {
      setError(err instanceof ErrorPartners ? err.message : 'No se ha podido entrar.');
      setCargando(false);
    }
  }

  async function pedirEnlace(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await partnersApi.recuperar(usuario);
      setModo('enviado');
    } catch (err) {
      setError(err instanceof ErrorPartners ? err.message : 'No se ha podido enviar.');
    } finally {
      setCargando(false);
    }
  }

  const cambiar = (m: typeof modo) => { setModo(m); setError(''); setPassword(''); };

  return (
    <MarcoPartners
      pie={
        <>
          <p>Acceso para asociaciones que recomiendan PilotOS.</p>
          <p>
            ¿Eres taxista?{' '}
            <Link href="/login" className="font-semibold text-pilotos-yellow hover:underline">Entra aquí</Link>
          </p>
        </>
      }
    >
      {modo === 'entrar' && (
        <>
          <h1 className="text-center text-lg font-semibold text-zinc-100">Panel de la asociación</h1>
          <p className="mb-6 mt-1 text-center text-sm text-zinc-400">Entra con el usuario y la contraseña de la asociación.</p>
          <form onSubmit={entrar} className="space-y-5">
            <Input
              label="Usuario o correo"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <AvisoError texto={error} />
            <Button type="submit" className="w-full" size="lg" disabled={cargando}>
              {cargando ? 'Entrando…' : 'Entrar'}
            </Button>
            <button type="button" className="w-full text-center text-xs text-zinc-400 hover:text-zinc-200" onClick={() => cambiar('olvido')}>
              He olvidado mi contraseña
            </button>
          </form>
        </>
      )}

      {modo === 'olvido' && (
        <>
          <h1 className="text-center text-lg font-semibold text-zinc-100">Contraseña nueva</h1>
          <p className="mb-6 mt-1 text-center text-sm text-zinc-400">
            Escribe el usuario o el correo de la asociación y te mandaremos un enlace para poner una contraseña nueva.
          </p>
          <form onSubmit={pedirEnlace} className="space-y-5">
            <Input
              label="Usuario o correo"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
            <AvisoError texto={error} />
            <Button type="submit" className="w-full" size="lg" disabled={cargando}>
              {cargando ? 'Enviando…' : 'Enviarme el enlace'}
            </Button>
            <button type="button" className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300" onClick={() => cambiar('entrar')}>
              Volver
            </button>
          </form>
        </>
      )}

      {modo === 'enviado' && (
        <div className="text-center">
          <h1 className="text-lg font-semibold text-zinc-100">Revisa el correo</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Si hay una cuenta con ese usuario o correo, le hemos mandado un enlace. Caduca en una hora.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Si la asociación aún no había creado su acceso, le llega de nuevo el correo de bienvenida.
          </p>
          <Button className="mt-6 w-full" variant="secondary" size="lg" onClick={() => cambiar('entrar')}>
            Volver a entrar
          </Button>
        </div>
      )}
    </MarcoPartners>
  );
}
