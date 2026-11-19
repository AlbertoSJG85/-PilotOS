/**
 * Pantallas animadas adicionales de la demo (/demo). Misma convención que
 * demo-pantallas.tsx: cada una recibe `t` (ms de su escena) y se pinta en
 * consecuencia, solo con transform/opacity.
 *
 *   PantallaRevision       el patrón acepta el parte que PilotOS ha retenido.
 *   PantallaCierre         resultados del periodo, reparto y Seguridad Social.
 */

import { AlertTriangle, Bell, Check } from 'lucide-react';
import { Ejemplo, entra } from './demo-pantallas';

/* ── Revisión del parte retenido ─────────────────────────────────────── */

export function PantallaRevision({ t }: { t: number }) {
  const detalle = t >= 1600;
  const pulsado = t >= 4400 && t < 4700;
  const aceptado = t >= 4700;
  const filas = [
    { v: 'T-02', ok: true },
    { v: 'T-03', ok: true },
    { v: 'T-04', ok: aceptado },
  ];

  return (
    <div className="relative flex h-full flex-col px-4 pb-4 pt-9">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-white">Partes de ayer</p>
        <Ejemplo />
      </div>

      <div className="mt-3 space-y-2">
        {filas.map((f, i) => (
          <div
            key={f.v}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition duration-300 ${entra(t >= 300 + i * 250)} ${
              f.ok ? 'border-white/10 bg-white/[0.04]' : 'border-amber-400/30 bg-amber-400/[0.08]'
            }`}
          >
            <span className="text-sm font-bold text-white">Taxi {f.v}</span>
            <span
              className={`flex items-center gap-1.5 text-xs font-bold ${f.ok ? 'text-emerald-300' : 'text-amber-300'}`}
            >
              {f.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {f.ok ? 'Aceptado' : 'Por revisar'}
            </span>
          </div>
        ))}
      </div>

      <div className={`mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 ${entra(detalle)}`}>
        <p className="text-xs font-bold text-white">Parte T-04 · el importe no coincide</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Declarado</p>
            <p className="mt-0.5 text-lg font-black text-white">198,40 €</p>
          </div>
          <div>
            <p className="text-zinc-400">Según el ticket</p>
            <p className="mt-0.5 text-lg font-black text-amber-200">218,40 €</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">No suma en tus cuentas hasta que decidas.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span
            className={`flex h-10 items-center justify-center rounded-lg bg-pilotos-yellow text-xs font-black text-pilotos-black transition duration-150 ${
              pulsado ? 'scale-95 brightness-90' : 'scale-100'
            }`}
          >
            Aceptar
          </span>
          <span className="flex h-10 items-center justify-center rounded-lg border border-white/[0.16] text-xs font-semibold text-zinc-200">
            Que lo rehaga
          </span>
        </div>
      </div>

      <div
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0B0D12]/95 transition duration-300 ${
          t >= 5200 ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white transition duration-500 ease-out ${
            t >= 5200 ? 'scale-100' : 'scale-50'
          }`}
        >
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
        <p className="text-base font-black text-white">Parte aceptado</p>
        <p
          className={`flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-200 transition duration-500 ${
            t >= 5900 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
        >
          <Bell className="h-3.5 w-3.5 text-pilotos-yellow" /> El conductor ya lo sabe
        </p>
      </div>
    </div>
  );
}

/* ── Cierre del periodo ──────────────────────────────────────────────── */

export function PantallaCierre({ t }: { t: number }) {
  const cifras = [
    { e: 'Ingresos', v: '6.420 €', c: 'text-white' },
    { e: 'Combustible', v: '1.180 €', c: 'text-white' },
    { e: 'Neto', v: '5.240 €', c: 'text-pilotos-yellow' },
    { e: 'Gastos', v: '540 €', c: 'text-white' },
  ];

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-9">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-white">Cierre · Octubre</p>
        <Ejemplo />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {cifras.map((c, i) => (
          <div
            key={c.e}
            className={`rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 ${entra(t >= 400 + i * 350)}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{c.e}</p>
            <p className={`mt-1 text-lg font-black ${c.c}`}>{c.v}</p>
          </div>
        ))}
      </div>

      <p className={`mt-5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 ${entra(t >= 2200)}`}>
        Reparto
      </p>
      <div className={`mt-2 ${entra(t >= 2200)}`}>
        <div className="flex h-5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full origin-left bg-pilotos-yellow transition duration-1000 ease-out ${
              t >= 2600 ? 'scale-x-100' : 'scale-x-0'
            }`}
            style={{ width: '55%' }}
          />
          <div
            className={`h-full origin-left bg-sky-400 transition duration-1000 ease-out ${
              t >= 3000 ? 'scale-x-100' : 'scale-x-0'
            }`}
            style={{ width: '45%' }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="flex items-center gap-1.5 text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-pilotos-yellow" /> Patrón
            </p>
            <p className="mt-0.5 text-base font-black text-white">2.882 €</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-sky-400" /> Asalariado
            </p>
            <p className="mt-0.5 text-base font-black text-white">2.358 €</p>
          </div>
        </div>
        <p
          className={`mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-300 ${entra(t >= 3800)}`}
        >
          Seguridad Social del asalariado: <span className="text-white">−310 €</span>
        </p>
      </div>

      <div className="mt-auto">
        <div
          className={`flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.08] text-sm font-black text-emerald-300 ${entra(t >= 5000)}`}
        >
          <Check className="h-4 w-4" strokeWidth={3} /> Cierre guardado
        </div>
      </div>
    </div>
  );
}
