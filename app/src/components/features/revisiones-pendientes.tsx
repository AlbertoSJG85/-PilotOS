'use client';

/**
 * Revisiones pendientes — todo lo que espera una decisión del dueño (2026-11-12).
 *
 * Una foto en revisión o un aviso sin ver no pueden depender de que el dueño
 * abra el parte justo y se fije en una etiqueta. Aquí aparecen siempre, y cada
 * cosa se puede VERIFICAR o NO VERIFICAR; no desaparece hasta que se decide.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, X, ArrowRight, Eye } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { urlDocumento } from '@/lib/utils';
import { getRevisiones, verificarFoto, marcarAvisoVisto } from '@/lib/api';
import type { Revisiones } from '@/lib/api/revisiones';

const NOMBRE_TIPO: Record<string, string> = {
  TICKET_GASOIL: 'Ticket de gasoil',
  TICKET_TAXIMETRO: 'Ticket del taxímetro',
};

export function RevisionesPendientes({ onCambio }: { onCambio?: () => void }) {
  const [datos, setDatos] = useState<Revisiones | null>(null);
  const [fallo, setFallo] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    getRevisiones()
      .then((r) => { setDatos(r.data ?? { fotos: [], avisos: [] }); setFallo(false); })
      .catch(() => setFallo(true));
  }
  useEffect(cargar, []);

  async function decidir(id: string, resultado: 'VERIFICADA' | 'NO_VERIFICADA') {
    setError(null);
    setTrabajando(id);
    try {
      await verificarFoto(id, resultado);
      cargar();
      onCambio?.();
    } catch {
      setError('No se pudo guardar la decisión. Inténtalo de nuevo.');
    } finally {
      setTrabajando(null);
    }
  }

  async function visto(id: string) {
    setError(null);
    setTrabajando(id);
    try {
      await marcarAvisoVisto(id);
      cargar();
    } catch {
      setError('No se pudo marcar el aviso. Inténtalo de nuevo.');
    } finally {
      setTrabajando(null);
    }
  }

  // Un fallo al cargar NO se oculta: si no se pueden ver las revisiones, el
  // dueño tiene que saberlo (justo el problema que esto viene a resolver).
  if (fallo) {
    return (
      <Card className="border-red-500/40 bg-red-950/20 p-4">
        <p className="text-xs text-red-200">
          No se han podido cargar las revisiones pendientes.{' '}
          <button className="underline" onClick={cargar}>Reintentar</button>
        </p>
      </Card>
    );
  }
  if (!datos) return null;
  const total = datos.fotos.length + datos.avisos.length;
  if (total === 0) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-950/20 p-4">
      <h2 className="mb-3 flex items-center gap-2 border-b border-amber-900/40 pb-3 text-sm font-semibold uppercase tracking-wider text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        Revisiones pendientes ({total})
      </h2>

      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

      <div className="space-y-3">
        {datos.fotos.map((f) => {
          const ocupado = trabajando === f.id;
          return (
            <div key={f.id} className="rounded-lg border border-amber-900/40 bg-black/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">{NOMBRE_TIPO[f.tipo] ?? f.tipo}</span>
                    <Badge variant="warning" className="shrink-0 text-[10px] uppercase tracking-wide">Foto sin verificar</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {formatDate(f.fecha_trabajada)} · {f.conductor || 'Conductor'} · {f.matricula || '—'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    El lector no ha podido confirmar los datos. Mira la foto y decide.
                  </p>
                </div>
                <div className="flex shrink-0 gap-3 text-xs">
                  <a href={urlDocumento(f.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-pilot-lime hover:text-pilot-lime-light">
                    <Eye className="h-3 w-3" /> Ver foto
                  </a>
                  <Link href={`/partes/${f.parte_id}`} className="flex items-center gap-1 text-pilot-lime hover:text-pilot-lime-light">
                    Ver parte <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={ocupado} onClick={() => decidir(f.id, 'VERIFICADA')}>
                  <Check className="h-3.5 w-3.5" /> {ocupado ? 'Guardando…' : 'Verificada'}
                </Button>
                <Button size="sm" variant="outline" disabled={ocupado} onClick={() => decidir(f.id, 'NO_VERIFICADA')}>
                  <X className="h-3.5 w-3.5" /> No verificada: pedir otra foto
                </Button>
              </div>
            </div>
          );
        })}

        {datos.avisos.map((a) => {
          const ocupado = trabajando === a.id;
          return (
            <div key={a.id} className="rounded-lg border border-amber-900/40 bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-100">{a.titulo}</span>
                {!a.enviado && (
                  <Badge variant="danger" className="text-[10px] uppercase">No enviado por WhatsApp</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-300">{a.mensaje}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{formatDate(a.created_at)}</p>
              <div className="mt-3">
                <Button size="sm" variant="outline" disabled={ocupado} onClick={() => visto(a.id)}>
                  <Check className="h-3.5 w-3.5" /> {ocupado ? 'Guardando…' : 'Visto'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
