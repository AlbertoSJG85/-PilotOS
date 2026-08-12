'use client';

/**
 * Mini-panel del asalariado — "lo que llevo este mes" (2026-08-12).
 *
 * QUÉ VE Y POR QUÉ. Lo que enseña es lo que ha ENTREGADO neto (bruto menos
 * combustible), no lo que él gana: el reparto es cosa del dueño. A partir de
 * ahí, las cifras que le sirven para cuadrar su mes de un vistazo: días
 * trabajados, kilómetros, y las tres medias (€/km, €/día y el total).
 *
 * `neto = bruto − combustible` es la misma definición que usa el motor de
 * cálculo (calculo.service.ts: "neto operativo"), no una cuenta paralela.
 *
 * Los partes retenidos NO suman: todavía no están aceptados y sus cifras
 * pueden cambiar. Se avisa con una línea para que el número no parezca que
 * baila solo.
 */

import { CalendarDays, Route, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { ParteDiario } from '@/types';

interface Props {
  partes: ParteDiario[];
  loading?: boolean;
}

const ESTADOS_COMPUTABLES = ['ENVIADO', 'FOTO_SUSTITUIDA'];

function Metrica({ icono: Icono, valor, etiqueta }: { icono: typeof Wallet; valor: string; etiqueta: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
      <Icono className="h-4 w-4 text-zinc-500 mb-1.5" />
      <p className="text-base font-bold text-zinc-100 leading-tight">{valor}</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">{etiqueta}</p>
    </div>
  );
}

export function ResumenMesConductor({ partes, loading }: Props) {
  const ahora = new Date();
  const delMes = partes.filter((p) => {
    const f = new Date(p.fecha_trabajada);
    return f.getUTCFullYear() === ahora.getFullYear() && f.getUTCMonth() === ahora.getMonth();
  });

  const computables = delMes.filter((p) => ESTADOS_COMPUTABLES.includes(p.estado));
  const retenidos = delMes.filter((p) => p.estado === 'PENDIENTE_VALIDACION').length;

  const neto = computables.reduce(
    (acc, p) => acc + (Number(p.ingreso_bruto) - Number(p.combustible ?? 0)),
    0,
  );
  const km = computables.reduce((acc, p) => acc + Math.max(0, (p.km_fin ?? 0) - (p.km_inicio ?? 0)), 0);
  const dias = computables.length;

  const eurPorKm = km > 0 ? neto / km : null;
  const eurPorDia = dias > 0 ? neto / dias : null;

  const nombreMes = ahora.toLocaleDateString('es-ES', { month: 'long' });

  if (loading) {
    return <div className="rounded-2xl bg-zinc-800/40 animate-pulse h-44" />;
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
        Tu {nombreMes}
      </p>

      {dias === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-zinc-400">Todavía no has enviado partes este mes.</p>
          <p className="text-xs text-zinc-600 mt-1">Al registrar el primero verás aquí tu resumen.</p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-3xl font-black text-zinc-100">{formatCurrency(neto)}</p>
            <p className="text-xs text-zinc-500 mt-1">Entregado neto (sin el combustible)</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metrica icono={CalendarDays} valor={String(dias)} etiqueta={dias === 1 ? 'día trabajado' : 'días trabajados'} />
            <Metrica icono={Route} valor={`${km.toLocaleString('es-ES')} km`} etiqueta="recorridos" />
            <Metrica icono={TrendingUp} valor={eurPorKm !== null ? `${eurPorKm.toFixed(2)} €` : '—'} etiqueta="por km" />
            <Metrica icono={Wallet} valor={eurPorDia !== null ? formatCurrency(eurPorDia) : '—'} etiqueta="por día" />
          </div>

          {retenidos > 0 && (
            <p className="mt-3 text-[11px] text-amber-300/80">
              {retenidos === 1
                ? 'Hay 1 parte pendiente de revisión que todavía no cuenta aquí.'
                : `Hay ${retenidos} partes pendientes de revisión que todavía no cuentan aquí.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
