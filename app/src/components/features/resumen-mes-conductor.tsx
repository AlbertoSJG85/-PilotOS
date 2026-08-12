'use client';

/**
 * Panel del mes del asalariado (2026-08-12, ampliado el mismo día).
 *
 * QUÉ VE Y POR QUÉ. Alberto lo pidió así: que vea el bruto, lo que ha puesto
 * de combustible y el neto, "porque al verlo puede reorganizar su método de
 * trabajo y tomar decisiones". Es decir, esto no es un adorno informativo:
 * son las cifras con las que un conductor decide si le compensa la parada de
 * aeropuerto o dar vueltas por el centro.
 *
 * Lo que NO enseña: su reparto. Eso es del dueño.
 *
 * `neto = bruto − combustible` es la misma definición que usa el motor de
 * cálculo (calculo.service.ts, "neto operativo"), no una cuenta paralela.
 *
 * Los partes retenidos no suman: aún no están aceptados y sus cifras pueden
 * cambiar. Se dice en una línea para que el número no parezca que baila solo.
 */

import { CalendarDays, Route, Fuel, TrendingUp, CreditCard, Banknote, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { ParteDiario } from '@/types';

interface Props {
  partes: ParteDiario[];
  loading?: boolean;
}

const ESTADOS_COMPUTABLES = ['ENVIADO', 'FOTO_SUSTITUIDA'];

function Metrica({
  icono: Icono, valor, etiqueta, tono = 'neutro',
}: {
  icono: typeof Wallet; valor: string; etiqueta: string; tono?: 'neutro' | 'lima' | 'ambar';
}) {
  const color = tono === 'lima' ? 'text-pilot-lime' : tono === 'ambar' ? 'text-amber-400' : 'text-zinc-500';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
      <Icono className={`mb-1.5 h-4 w-4 ${color}`} />
      <p className="text-base font-bold leading-tight text-zinc-100">{valor}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{etiqueta}</p>
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

  const bruto = computables.reduce((acc, p) => acc + Number(p.ingreso_bruto ?? 0), 0);
  const combustible = computables.reduce((acc, p) => acc + Number(p.combustible ?? 0), 0);
  const neto = bruto - combustible;
  const datafono = computables.reduce((acc, p) => acc + Number(p.ingreso_datafono ?? 0), 0);
  const efectivo = Math.max(0, bruto - datafono);
  const km = computables.reduce((acc, p) => acc + Math.max(0, (p.km_fin ?? 0) - (p.km_inicio ?? 0)), 0);
  const dias = computables.length;

  const eurPorKm = km > 0 ? neto / km : null;
  const eurPorDia = dias > 0 ? neto / dias : null;
  const pctCombustible = bruto > 0 ? (combustible / bruto) * 100 : 0;
  const pctDatafono = bruto > 0 ? Math.round((datafono / bruto) * 100) : 0;

  // Se mantiene el combustible por 100 km (sigue en "Tu ritmo"): es la cifra
  // que compara el gasto de un día largo con el de uno corto.
  const combustiblePor100 = km > 0 ? (combustible / km) * 100 : null;

  // Barras del mes: neto de cada día, para ver de un vistazo la forma del mes.
  const porDia = [...computables]
    .sort((a, b) => new Date(a.fecha_trabajada).getTime() - new Date(b.fecha_trabajada).getTime())
    .map((p) => ({
      dia: new Date(p.fecha_trabajada).getUTCDate(),
      neto: Number(p.ingreso_bruto ?? 0) - Number(p.combustible ?? 0),
    }));
  const netoMaximo = porDia.reduce((max, d) => Math.max(max, d.neto), 0);

  const nombreMes = ahora.toLocaleDateString('es-ES', { month: 'long' });

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-zinc-800/40" />;

  if (dias === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tu {nombreMes}</p>
        <div className="py-6 text-center">
          <p className="text-sm text-zinc-400">Todavía no has enviado partes este mes.</p>
          <p className="mt-1 text-xs text-zinc-600">Al registrar el primero verás aquí tu resumen.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">

      {/* Lo que ha entregado, y de dónde sale */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tu {nombreMes}</p>
          <p className="text-xs text-zinc-500">{dias} {dias === 1 ? 'día' : 'días'} · {km.toLocaleString('es-ES')} km</p>
        </div>

        <p className="text-4xl font-black tracking-tight text-zinc-100">{formatCurrency(neto)}</p>
        <p className="mt-1 text-xs text-zinc-500">Entregado neto, ya descontado el combustible</p>

        {/* De dónde sale: bruto = neto + combustible */}
        <div className="mt-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="bg-pilot-lime transition-all"
              style={{ width: `${bruto > 0 ? 100 - pctCombustible : 0}%` }}
              title={`Neto: ${formatCurrency(neto)}`}
            />
            <div
              className="bg-amber-500 transition-all"
              style={{ width: `${pctCombustible}%` }}
              title={`Combustible: ${formatCurrency(combustible)}`}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px]">
            <span className="text-zinc-400">
              Bruto <span className="font-semibold text-zinc-200">{formatCurrency(bruto)}</span>
            </span>
            <span className="text-amber-400">
              Combustible <span className="font-semibold">{formatCurrency(combustible)}</span>
              <span className="text-amber-400/60"> · {pctCombustible.toFixed(0)}% del bruto</span>
            </span>
          </div>
        </div>
      </section>

      {/* Cómo te han pagado */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Cómo te han pagado</p>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="bg-sky-500 transition-all" style={{ width: `${pctDatafono}%` }} />
          <div className="bg-emerald-500 transition-all" style={{ width: `${100 - pctDatafono}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metrica icono={CreditCard} valor={formatCurrency(datafono)} etiqueta={`datáfono · ${pctDatafono}%`} />
          <Metrica icono={Banknote} valor={formatCurrency(efectivo)} etiqueta={`efectivo · ${100 - pctDatafono}%`} />
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">El efectivo es lo que llevas encima al terminar.</p>
      </section>

      {/* Tu ritmo */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tu ritmo</p>
        <div className="grid grid-cols-2 gap-2">
          <Metrica icono={CalendarDays} valor={String(dias)} etiqueta={dias === 1 ? 'día trabajado' : 'días trabajados'} />
          <Metrica icono={Route} valor={`${km.toLocaleString('es-ES')} km`} etiqueta="recorridos" />
          <Metrica icono={Wallet} valor={eurPorDia !== null ? formatCurrency(eurPorDia) : '—'} etiqueta="neto por día" tono="lima" />
          <Metrica icono={TrendingUp} valor={eurPorKm !== null ? `${eurPorKm.toFixed(2)} €` : '—'} etiqueta="neto por km" tono="lima" />
          <Metrica
            icono={Fuel}
            valor={combustiblePor100 !== null ? formatCurrency(combustiblePor100) : '—'}
            etiqueta="combustible / 100 km"
            tono="ambar"
          />
          <Metrica
            icono={Fuel}
            valor={dias > 0 ? formatCurrency(combustible / dias) : '—'}
            etiqueta="combustible al día"
            tono="ambar"
          />
        </div>
      </section>

      {/* La forma del mes */}
      {porDia.length > 1 && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Día a día</p>
            <p className="text-[11px] text-zinc-500">neto de cada jornada</p>
          </div>
          <div className="flex h-24 items-end gap-1">
            {porDia.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`Día ${d.dia}: ${formatCurrency(d.neto)}`}>
                <div
                  className="w-full rounded-t bg-pilot-lime/70 transition-all"
                  style={{ height: `${netoMaximo > 0 ? Math.max(4, (d.neto / netoMaximo) * 100) : 4}%` }}
                />
                <span className="text-[9px] text-zinc-600">{d.dia}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {retenidos > 0 && (
        <p className="text-[11px] text-amber-300/80">
          {retenidos === 1
            ? 'Hay 1 parte pendiente de revisión que todavía no cuenta en estas cifras.'
            : `Hay ${retenidos} partes pendientes de revisión que todavía no cuentan en estas cifras.`}
        </p>
      )}
    </div>
  );
}
