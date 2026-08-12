'use client';

/**
 * Avisos del conductor (2026-08-12).
 *
 * Las dos decisiones del dueño sobre un parte retenido las sufre el
 * asalariado, y hasta hoy se enteraba por las bravas: si le pedían rehacerlo,
 * el parte desaparecía de su pantalla sin una palabra. Aquí se le dice, con
 * el nombre de quién lo decidió.
 *
 * El de "rehacer" pesa más que el de "aceptado" —uno pide trabajo y el otro
 * es una buena noticia—, así que van con colores distintos y el de rehacer
 * lleva el acceso directo a registrar el parte otra vez.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';
import { getNotificaciones, marcarNotificacionLeida, type NotificacionConductor } from '@/lib/api';

export function AvisosConductor() {
  const [avisos, setAvisos] = useState<NotificacionConductor[]>([]);

  useEffect(() => {
    getNotificaciones(true)
      .then((r) => setAvisos(r.data || []))
      .catch(() => {});
  }, []);

  async function descartar(id: string) {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
    try {
      await marcarNotificacionLeida(id);
    } catch {
      // Si falla, el aviso volverá a aparecer al recargar. Mejor eso que
      // fingir que se ha leído algo que no se ha guardado.
    }
  }

  if (avisos.length === 0) return null;

  return (
    <div className="space-y-2">
      {avisos.map((a) => {
        const esRehacer = a.tipo === 'REHACER_PARTE';
        return (
          <div
            key={a.id}
            className={`rounded-2xl border p-4 ${
              esRehacer
                ? 'border-amber-700/60 bg-amber-950/40'
                : 'border-emerald-800/50 bg-emerald-950/30'
            }`}
          >
            <div className="flex items-start gap-3">
              {esRehacer
                ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                : <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${esRehacer ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {a.titulo}
                </p>
                <p className="mt-1 text-xs text-zinc-300">{a.mensaje}</p>
                {esRehacer && (
                  <Link
                    href="/conductor/parte/nuevo"
                    className="mt-2 inline-block rounded-lg bg-pilot-lime px-3 py-1.5 text-xs font-semibold text-zinc-950"
                  >
                    Registrar el parte otra vez
                  </Link>
                )}
              </div>
              <button
                onClick={() => descartar(a.id)}
                className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Descartar aviso"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
