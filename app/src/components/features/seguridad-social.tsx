'use client';

/**
 * Seguridad Social de los asalariados en el panel del dueño (2026-08-12).
 *
 * Implementa la regla F4, cerrada el 2026-08-11. Lo que esta pantalla tiene
 * que dejar claro —y era justo la pregunta de Alberto: "¿de dónde se
 * descuenta?"— es el recorrido del dinero:
 *
 *   · La cuota es de cada asalariado, no del cliente.
 *   · Se le descuenta a ÉL de su liquidación, y el patrón se queda ese dinero
 *     porque es quien lo paga a la Seguridad Social. Para el patrón la
 *     operación es neutra: entra por un lado y sale por otro.
 *   · Dónde se le descuenta lo elige el patrón: en el último parte del mes,
 *     o en el cierre de periodo. Es una elección para todos sus asalariados.
 *   · Mes incompleto: cuota COMPLETA. Aunque trabaje un solo día.
 *
 * El asalariado no ve nada de esto en su panel: su vista enseña lo que ha
 * entregado, no su liquidación.
 */

import { ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export interface DetalleSS {
  conductor_id: string;
  nombre: string;
  cuota_mensual: number;
  meses: number;
  total: number;
}

interface Props {
  total: number;
  detalle: DetalleSS[];
  modo: 'parte' | 'cierre';
}

export function SeguridadSocial({ total, detalle, modo }: Props) {
  if (!detalle || detalle.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-100">
          <ShieldCheck className="h-4 w-4 text-zinc-500" />
          Seguridad Social de los asalariados
        </h2>
        <span className="text-sm font-bold text-zinc-100">{formatCurrency(total)}</span>
      </div>

      <div className="space-y-2">
        {detalle.map((d) => (
          <div key={d.conductor_id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate text-zinc-200">{d.nombre}</p>
              <p className="text-xs text-zinc-500">
                {formatCurrency(d.cuota_mensual)} al mes
                {d.meses > 1 ? ` × ${d.meses} meses` : ''}
              </p>
            </div>
            <span className="shrink-0 font-semibold text-zinc-100">{formatCurrency(d.total)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-black/30 p-3">
        <p className="text-xs text-zinc-400">
          {modo === 'parte' ? (
            <>
              Se descuenta de la liquidación del asalariado en <strong className="text-zinc-200">el último
              parte de cada mes</strong>, entero. Ese dinero se queda en tu cuenta porque eres tú quien
              paga la cuota.
            </>
          ) : (
            <>
              Se descuenta de la liquidación del asalariado en <strong className="text-zinc-200">el cierre
              de periodo</strong>. Sus partes del día a día no se tocan.
            </>
          )}
        </p>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          La cuota es completa aunque el mes esté a medias: si estuvo de alta un solo día, se cuenta el
          mes entero. Tu asalariado no ve nada de esto en su panel.
        </p>
      </div>
    </Card>
  );
}
