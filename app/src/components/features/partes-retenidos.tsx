'use client';

/**
 * Partes retenidos — la bandeja de decisión del dueño (2026-08-12).
 *
 * Antes esto era una lista de alertas con un botón "Marcar revisada" que solo
 * hacía desaparecer el aviso: el parte ya había entrado en los globales desde
 * el primer momento. Ahora la unidad no es la alerta, es EL PARTE, y el dueño
 * tiene las dos únicas salidas que tienen sentido:
 *
 *   · Aceptar        → lo ha hablado con el asalariado, el parte cuenta.
 *   · Pedir rehacer  → algo está mal; el parte y sus tickets se borran y el
 *                      asalariado registra ese día otra vez. Destructivo, así
 *                      que va detrás de una confirmación explícita en la que
 *                      se dice exactamente qué se va a borrar.
 *
 * Mientras no decida, el dinero de ese parte NO está en ningún total.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, RotateCcw, ArrowRight, X } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import { validarParte, rehacerParte } from '@/lib/api';
import type { ParteDiario, Anomalia } from '@/types';

interface Props {
  partes: ParteDiario[];
  anomalias: Anomalia[];
  /** Se llama tras aceptar o rehacer, para que la página recargue sus datos. */
  onResuelto: () => void;
}

export function PartesRetenidos({ partes, anomalias, onResuelto }: Props) {
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retenidos = partes.filter((p) => p.estado === 'PENDIENTE_VALIDACION');
  if (retenidos.length === 0) return null;

  const importeRetenido = retenidos.reduce((acc, p) => acc + Number(p.ingreso_bruto || 0), 0);

  async function aceptar(id: string) {
    setError(null);
    setTrabajando(id);
    try {
      await validarParte(id);
      onResuelto();
    } catch {
      setError('No se pudo aceptar el parte. Inténtalo de nuevo.');
    } finally {
      setTrabajando(null);
    }
  }

  async function rehacer(id: string) {
    setError(null);
    setTrabajando(id);
    try {
      await rehacerParte(id);
      setConfirmando(null);
      onResuelto();
    } catch {
      setError('No se pudo rechazar el parte. Inténtalo de nuevo.');
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <Card className="border-amber-500/40 bg-amber-950/20 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-amber-900/40 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Partes en espera de tu decisión ({retenidos.length})
        </h2>
        <span className="text-xs text-amber-200/70">
          {formatCurrency(importeRetenido)} sin contar en los totales
        </span>
      </div>

      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

      <div className="space-y-3">
        {retenidos.map((p) => {
          const suyas = anomalias.filter((a) => a.parte_diario_id === p.id);
          const enConfirmacion = confirmando === p.id;
          const ocupado = trabajando === p.id;

          return (
            <div key={p.id} className="rounded-lg border border-amber-900/40 bg-black/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">{formatDate(p.fecha_trabajada)}</span>
                    <Badge variant="warning" className="shrink-0 text-[10px] uppercase tracking-wide">
                      No contabilizado
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {p.conductor?.usuario?.nombre || 'Conductor'} · {p.vehiculo?.matricula || '—'} ·{' '}
                    {formatCurrency(Number(p.ingreso_bruto))}
                  </p>
                </div>
                <Link
                  href={`/partes/${p.id}`}
                  className="flex shrink-0 items-center gap-1 text-xs text-pilot-lime transition-colors hover:text-pilot-lime-light"
                >
                  Ver parte y tickets <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {suyas.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-zinc-800 pt-2">
                  {suyas.map((a) => (
                    <li key={a.id} className="flex gap-2 text-xs text-zinc-300">
                      {a.tipo === 'CRITICA' && (
                        <Badge variant="danger" className="h-4 shrink-0 text-[9px] uppercase">Crítica</Badge>
                      )}
                      <span>{a.descripcion}</span>
                    </li>
                  ))}
                </ul>
              )}

              {!enConfirmacion ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={ocupado} onClick={() => aceptar(p.id)}>
                    <Check className="h-3.5 w-3.5" />
                    {ocupado ? 'Guardando…' : 'Aceptar y contabilizar'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setConfirmando(p.id)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Pedir que lo rehaga
                  </Button>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-red-800/60 bg-red-950/40 p-3">
                  <p className="text-xs text-red-200">
                    Se borrarán <strong>el parte del {formatDate(p.fecha_trabajada)} y sus tickets</strong>. El
                    asalariado tendrá que registrar ese día otra vez desde cero. No se puede deshacer.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="destructive" disabled={ocupado} onClick={() => rehacer(p.id)}>
                      {ocupado ? 'Borrando…' : 'Sí, borrar y que lo rehaga'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setConfirmando(null)}>
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
