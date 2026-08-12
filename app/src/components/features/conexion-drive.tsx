'use client';

/**
 * Conectar el Drive del cliente (2026-08-12).
 *
 * El texto importa tanto como el código: la duda razonable de cualquiera al
 * ver esto es "¿me estáis pidiendo subir mis papeles a VUESTRO Drive?". La
 * respuesta es que no, y tiene que quedar dicho en la pantalla, no en un FAQ:
 * los documentos van a SU cuenta de Google, y PilotOS solo puede tocar los
 * archivos que él mismo crea — ni ve ni puede ver el resto de su Drive.
 */

import { useEffect, useState } from 'react';
import { HardDrive, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { getEstadoDrive, conectarDrive, desconectarDrive, type EstadoDrive } from '@/lib/api';

export function ConexionDrive() {
  const [estado, setEstado] = useState<EstadoDrive | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEstadoDrive().then((r) => setEstado(r.data ?? null)).catch(() => {});
  }, []);

  async function conectar() {
    setError(null);
    setTrabajando(true);
    try {
      const r = await conectarDrive();
      if (r.authUrl) {
        window.location.href = r.authUrl;
        return;
      }
      setError(r.message || 'No se pudo iniciar la conexión.');
    } catch {
      setError('No se pudo iniciar la conexión con Google.');
    } finally {
      setTrabajando(false);
    }
  }

  async function desconectar() {
    setTrabajando(true);
    try {
      await desconectarDrive();
      setEstado((e) => (e ? { ...e, conectado: false, email: null } : e));
    } catch {
      setError('No se pudo desconectar.');
    } finally {
      setTrabajando(false);
    }
  }

  // Mientras no esté habilitado en el entorno, ni se enseña: prometer algo
  // que no se puede cumplir es peor que no ofrecerlo.
  if (!estado?.disponible) return null;

  return (
    <Card className="mb-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800">
            <HardDrive className="h-5 w-5 text-pilot-lime" />
          </div>
          <div className="min-w-0">
            {estado.conectado ? (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Check className="h-4 w-4 text-emerald-400" /> Tu Drive está conectado
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {estado.email ? <>Cuenta <span className="text-zinc-300">{estado.email}</span>. </> : null}
                  Cada documento que confirmes se guarda también en tu Drive, en{' '}
                  <span className="text-zinc-300">PilotOS / año / mes / categoría</span>.
                </p>
                {estado.ultimo_error && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Google ha dejado de aceptar el permiso. Vuelve a conectarlo.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-zinc-100">Guarda tus documentos en tu Drive</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Conecta tu cuenta de Google y cada ITV o factura que confirmes se copiará ordenada
                  en <span className="text-zinc-300">tu propio Drive</span>, por año, mes y categoría.
                  Así se los pasas a tu gestoría compartiendo la carpeta, sin buscar nada.
                </p>
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  Son <strong className="text-zinc-400">tus archivos, en tu cuenta</strong>. PilotOS solo puede
                  ver los que él mismo guarda ahí: no tiene acceso al resto de tu Drive. Puedes desconectarlo
                  cuando quieras y lo subido se queda contigo.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {estado.conectado ? (
            <Button variant="outline" size="sm" disabled={trabajando} onClick={desconectar}>
              {trabajando ? 'Desconectando…' : 'Desconectar'}
            </Button>
          ) : (
            <Button size="sm" disabled={trabajando} onClick={conectar}>
              <ExternalLink className="h-3.5 w-3.5" />
              {trabajando ? 'Abriendo Google…' : 'Conectar mi Drive'}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </Card>
  );
}
