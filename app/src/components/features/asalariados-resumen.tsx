'use client';

/**
 * El lado del asalariado, en el panel del dueño (2026-08-12).
 *
 * Alberto lo pidió así de explícito: el panel tiene que decir cómo va el
 * negocio, y para eso no basta el total — hay que ver de quién sale y qué se
 * lleva cada uno. El recorrido es este, y se lee de arriba abajo:
 *
 *   genera (bruto − combustible)  →  su reparto pactado
 *   →  menos su Seguridad Social  =  lo que percibe
 *   y aparte, lo que te queda a ti de su trabajo.
 *
 * `neto generado` es EXACTAMENTE el "entregado neto" que el asalariado ve en
 * su panel. Es a propósito: si las dos pantallas dieran cifras distintas, la
 * conversación entre los dos empezaría discutiendo el dato en vez del trabajo.
 */

import { UserRound } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export interface DetalleAsalariado {
  conductor_id: string;
  nombre: string;
  /** true = son los días que has conducido tú: el importe es íntegro tuyo. */
  es_patron?: boolean;
  partes: number;
  bruto: number;
  combustible: number;
  neto_generado: number;
  reparto: number;
  seguridad_social: number;
  percibe: number;
  para_el_patron: number;
}

function Linea({
  etiqueta, valor, tono = 'normal', sangria = false,
}: {
  etiqueta: string; valor: string; tono?: 'normal' | 'resta' | 'destacado' | 'patron'; sangria?: boolean;
}) {
  const color =
    tono === 'resta' ? 'text-amber-400'
      : tono === 'destacado' ? 'text-zinc-100'
        : tono === 'patron' ? 'text-pilot-lime'
          : 'text-zinc-300';
  return (
    <div className={`flex items-baseline justify-between gap-3 ${sangria ? 'pl-4' : ''}`}>
      <span className={`text-xs ${tono === 'destacado' ? 'font-semibold text-zinc-200' : 'text-zinc-500'}`}>
        {etiqueta}
      </span>
      <span className={`text-sm tabular-nums ${tono === 'destacado' ? 'font-bold' : 'font-medium'} ${color}`}>
        {valor}
      </span>
    </div>
  );
}

export function AsalariadosResumen({
  asalariados, patron,
}: {
  asalariados: DetalleAsalariado[];
  /** Los días que ha conducido el propio dueño, si los hay. */
  patron?: DetalleAsalariado | null;
}) {
  if ((!asalariados || asalariados.length === 0) && !patron) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 border-b border-zinc-800 pb-3 text-sm font-semibold uppercase tracking-wider text-zinc-100">
        <UserRound className="h-4 w-4 text-zinc-500" />
        Quién genera qué
      </h2>

      <div className="space-y-5">
        {/* Los días del propio dueño van primero y aparte: lo que factura de
            su mano es ÍNTEGRO suyo, no se reparte con nadie. Mezclarlo con el
            asalariado daría a entender que se divide, y no es así. */}
        {patron && patron.partes > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="truncate font-semibold text-zinc-100">Tú</p>
              <p className="shrink-0 text-xs text-zinc-500">
                {patron.partes} {patron.partes === 1 ? 'parte' : 'partes'}
              </p>
            </div>
            <div className="space-y-1.5 rounded-lg border border-pilot-lime/30 bg-pilot-lime/5 p-3">
              <Linea etiqueta="Has generado (bruto − combustible)" valor={formatCurrency(patron.neto_generado)} tono="destacado" />
              <div className="!mt-2 border-t border-zinc-800 pt-2">
                <Linea etiqueta="Íntegro para ti" valor={formatCurrency(patron.reparto)} tono="patron" />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Lo que trabajas tú no se reparte con nadie.
            </p>
          </div>
        )}

        {asalariados.map((a) => (
          <div key={a.conductor_id}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="truncate font-semibold text-zinc-100">{a.nombre}</p>
              <p className="shrink-0 text-xs text-zinc-500">{a.partes} {a.partes === 1 ? 'parte' : 'partes'}</p>
            </div>

            <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-black/30 p-3">
              <Linea etiqueta="Ha generado (bruto − combustible)" valor={formatCurrency(a.neto_generado)} tono="destacado" />
              <Linea etiqueta="Su reparto" valor={formatCurrency(a.reparto)} sangria />
              {a.seguridad_social > 0 && (
                <Linea etiqueta="Seguridad Social" valor={`− ${formatCurrency(a.seguridad_social)}`} tono="resta" sangria />
              )}

              <div className="!mt-2 border-t border-zinc-800 pt-2">
                <Linea etiqueta="Percibe" valor={formatCurrency(a.percibe)} tono="destacado" />
                <Linea etiqueta="Te queda a ti de su trabajo" valor={formatCurrency(a.para_el_patron)} tono="patron" />
              </div>
            </div>

            {a.percibe < 0 && (
              <p className="mt-1.5 text-[11px] text-amber-300">
                Su reparto de este periodo no llega a cubrir la cuota de la Seguridad Social.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-zinc-500">
        Lo que ha generado es la misma cifra que él ve en su panel. Lo que percibe y su Seguridad Social,
        no: eso solo lo ves tú.
      </p>
    </Card>
  );
}
