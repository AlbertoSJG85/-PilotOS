'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Skeleton } from '@/components/ui';
import { AvisoError, MarcoPartners } from '@/components/features/partners/marco-partners';
import { partnersApi, ErrorPartners, type EnlacePartner } from '@/lib/api/partners';

/**
 * El enlace del correo (DT-041). Con el de bienvenida la asociación elige
 * usuario y contraseña; con el de recuperación, solo la contraseña.
 */
function Acceso() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [enlace, setEnlace] = useState<EnlacePartner | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_valido'>('cargando');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!token) { setEstado('no_valido'); return; }
    partnersApi.enlace(token)
      .then((e) => { setEnlace(e); setEstado('listo'); })
      .catch(() => setEstado('no_valido'));
  }, [token]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== repetir) { setError('Las dos contraseñas no coinciden.'); return; }
    setGuardando(true);
    try {
      await partnersApi.acceso(token, password, enlace?.usuario ? undefined : usuario);
      router.replace('/partners/panel');
    } catch (err) {
      if (err instanceof ErrorPartners && err.code === 'enlace_no_valido') setEstado('no_valido');
      setError(err instanceof ErrorPartners ? err.message : 'No se ha podido guardar.');
      setGuardando(false);
    }
  }

  if (estado === 'cargando') {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="mx-auto h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (estado === 'no_valido' || !enlace) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold text-zinc-100">Este enlace ya no sirve</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Ha caducado o ya se ha usado. Pide uno nuevo con «He olvidado mi contraseña» y te llegará al correo de la asociación.
        </p>
        <Link href="/partners" className="mt-6 block">
          <Button className="w-full" size="lg">Ir a la entrada</Button>
        </Link>
      </div>
    );
  }

  const esAlta = !enlace.usuario;

  return (
    <>
      <h1 className="text-center text-lg font-semibold text-zinc-100">
        {esAlta ? 'Crea el acceso de la asociación' : 'Pon una contraseña nueva'}
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-zinc-400">
        <span className="font-medium text-zinc-200">{enlace.nombre}</span>
        {esAlta
          ? ' · Es una sola cuenta para toda la asociación.'
          : <> · Usuario <span className="font-medium text-zinc-200">{enlace.usuario}</span></>}
      </p>
      <form onSubmit={guardar} className="space-y-5">
        {esAlta && (
          <div>
            <Input
              label="Usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z0-9][a-z0-9._\-]{2,39}"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={enlace.codigo.toLowerCase()}
            />
            <p className="mt-1 text-xs text-zinc-500">Letras sin tilde, números, punto o guion. También se puede entrar con el correo.</p>
          </div>
        )}
        <div>
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-zinc-500">Al menos 8 caracteres.</p>
        </div>
        <Input
          label="Repite la contraseña"
          type="password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <AvisoError texto={error} />
        <Button type="submit" className="w-full" size="lg" disabled={guardando}>
          {guardando ? 'Guardando…' : esAlta ? 'Crear acceso y entrar' : 'Guardar y entrar'}
        </Button>
      </form>
    </>
  );
}

export default function AccesoPartnersPage() {
  return (
    <MarcoPartners>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <Acceso />
      </Suspense>
    </MarcoPartners>
  );
}
