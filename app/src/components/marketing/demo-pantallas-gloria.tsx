/**
 * Pantallas de la demo (/demo) donde GlorIA hace de apoyo por WhatsApp, y la
 * de mantenimientos de la flota. Misma convención que demo-pantallas.tsx:
 * cada una recibe `t` (ms de su escena) y solo anima transform/opacity.
 *
 *   PantallaMantenimientos     estado de la flota y escalones de aviso.
 *   PantallaGloriaAsalariado   el asalariado sube una factura y GlorIA la registra.
 *   PantallaGloriaPropietario  el propietario sube un documento y consulta.
 *
 * Fiel al producto: por WhatsApp se suben documentos y facturas y se consulta;
 * el parte diario NO entra por aquí, solo por la app.
 */

import type { ReactNode } from 'react';
import { Check, Wrench } from 'lucide-react';
import { Ejemplo, entra } from './demo-pantallas';

/* ── Mantenimientos ──────────────────────────────────────────────────── */

const barras = [
  { n: 'Cambio de aceite · T-04', e: 'Faltan 250 km', p: 90, c: 'bg-amber-400', x: 'text-amber-300' },
  { n: 'ITV · T-02', e: 'Vence en 12 días', p: 82, c: 'bg-pilotos-yellow', x: 'text-pilotos-yellow' },
  { n: 'Ruedas · T-01', e: 'Pasado de fecha', p: 100, c: 'bg-red-500', x: 'text-red-300' },
  { n: 'Seguro · T-03', e: 'Al día', p: 28, c: 'bg-emerald-400', x: 'text-emerald-300' },
];

export function PantallaMantenimientos({ t }: { t: number }) {
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-9">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-black text-white">
          <Wrench className="h-4 w-4 text-pilotos-yellow" /> Flota
        </p>
        <Ejemplo />
      </div>

      <div className="mt-3 space-y-2.5">
        {barras.map((b, i) => (
          <div
            key={b.n}
            className={`rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 ${entra(t >= 300 + i * 350)}`}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold text-white">{b.n}</p>
              <p className={`text-[11px] font-bold ${b.x}`}>{b.e}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full origin-left rounded-full transition duration-1000 ease-out ${b.c} ${
                  t >= 900 + i * 350 ? 'scale-x-100' : 'scale-x-0'
                }`}
                style={{ width: `${b.p}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Escalones de aviso: el sistema avisa con margen, no el día que vence. */}
      <p className={`mt-5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 ${entra(t >= 2800)}`}>
        Te avisa antes de que venza
      </p>
      <div className={`relative mt-4 ${entra(t >= 2800)}`}>
        <div className="absolute left-2 right-2 top-[7px] h-0.5 rounded-full bg-white/10" />
        <div
          className={`absolute left-2 top-[7px] h-0.5 origin-left rounded-full bg-pilotos-yellow transition duration-[1400ms] ease-out ${
            t >= 3200 ? 'scale-x-100' : 'scale-x-0'
          }`}
          style={{ width: 'calc(100% - 1rem)' }}
        />
        <div className="relative flex justify-between">
          {['1.000 km', '500 km', '250 km', 'Vence'].map((paso, i) => (
            <div key={paso} className="flex flex-col items-center gap-1.5">
              <span
                className={`h-4 w-4 rounded-full border-2 transition duration-300 ${
                  t >= 3200 + i * 450
                    ? i === 3
                      ? 'border-red-400 bg-red-400'
                      : 'border-pilotos-yellow bg-pilotos-yellow'
                    : 'border-white/25 bg-[#0B0D12]'
                }`}
              />
              <span className="text-[10px] font-semibold text-zinc-400">{paso}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Piezas del chat ─────────────────────────────────────────────────── */

function CabeceraChat({ rol }: { rol: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#18242C] px-4 pb-3 pt-9">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-pilotos-yellow text-sm font-black text-pilotos-black">
          G
        </span>
        <div>
          <p className="text-sm font-bold text-white">GlorIA</p>
          <p className="text-[11px] font-semibold text-emerald-300">PilotOS</p>
        </div>
      </div>
      <span className="rounded-full border border-pilotos-yellow/40 bg-pilotos-yellow/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-pilotos-yellow">
        {rol}
      </span>
    </div>
  );
}

function Burbuja({
  de,
  visible,
  children,
}: {
  de: 'glora' | 'usuario';
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 shadow-lg transition duration-500 ease-out ${
        de === 'usuario'
          ? 'self-end rounded-br-md bg-[#075E54] text-white'
          : 'self-start rounded-bl-md bg-[#202C33] text-zinc-100'
      } ${visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      {children}
    </div>
  );
}

function Foto({ titulo, lineas }: { titulo: string; lineas: string[] }) {
  return (
    <div className="w-[150px] rounded-md bg-zinc-100 p-2.5 font-mono text-[9px] leading-[14px] text-zinc-700">
      <p className="font-bold tracking-widest text-zinc-900">{titulo}</p>
      {lineas.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}

function Fondo({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-[#0B141A]">
      {children}
    </div>
  );
}

/* ── GlorIA con el asalariado: sube una factura ──────────────────────── */

export function PantallaGloriaAsalariado({ t }: { t: number }) {
  const tocaTarjeta = t >= 3800 && t < 4200;

  return (
    <Fondo>
      <CabeceraChat rol="Asalariado" />
      <div className="flex flex-1 flex-col justify-end gap-2.5 bg-[linear-gradient(180deg,#0B141A,#081016)] p-4">
        <Burbuja de="usuario" visible={t >= 700}>
          <Foto titulo="TALLER MECÁNICO" lineas={['Cambio pastillas', 'Mano de obra', 'TOTAL  86,50 €']} />
          <p className="mt-1.5 text-[11px] text-white/80">Factura del taller</p>
        </Burbuja>

        <Burbuja de="glora" visible={t >= 2000}>
          Factura de taller de <b>86,50 €</b>. ¿Cómo la pagaste?
        </Burbuja>

        <div
          className={`flex gap-2 self-start transition duration-500 ease-out ${
            t >= 2600 && t < 4200 ? 'translate-y-0 opacity-100' : t >= 4200 ? 'opacity-0' : 'translate-y-2 opacity-0'
          }`}
        >
          <span className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-zinc-200">
            Efectivo
          </span>
          <span
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition duration-150 ${
              tocaTarjeta
                ? 'scale-95 border-pilotos-yellow bg-pilotos-yellow text-pilotos-black'
                : 'border-white/20 text-zinc-200'
            }`}
          >
            Tarjeta
          </span>
        </div>

        <Burbuja de="usuario" visible={t >= 4300}>
          Tarjeta
        </Burbuja>

        <Burbuja de="glora" visible={t >= 5000}>
          <span className="flex items-center gap-1.5 font-bold text-emerald-300">
            <Check className="h-4 w-4" strokeWidth={3} /> Gasto registrado
          </span>
          <span className="mt-0.5 block text-zinc-300">Taxi T-02 · 86,50 € · factura guardada</span>
        </Burbuja>
      </div>
    </Fondo>
  );
}

/* ── GlorIA con el propietario: documento y consulta ─────────────────── */

export function PantallaGloriaPropietario({ t }: { t: number }) {
  return (
    <Fondo>
      <CabeceraChat rol="Propietario" />
      <div className="flex flex-1 flex-col justify-end gap-2.5 bg-[linear-gradient(180deg,#0B141A,#081016)] p-4">
        <Burbuja de="usuario" visible={t >= 700}>
          <Foto titulo="SEGURO VEHÍCULO" lineas={['Matrícula T-03', 'Póliza ·····482', 'Hasta 14/03/2027']} />
          <p className="mt-1.5 text-[11px] text-white/80">Póliza del seguro</p>
        </Burbuja>

        <Burbuja de="glora" visible={t >= 2000}>
          <span className="flex items-center gap-1.5 font-bold text-emerald-300">
            <Check className="h-4 w-4" strokeWidth={3} /> Documento recibido
          </span>
          <span className="mt-0.5 block text-zinc-300">Seguro hasta 14/03/2027. Confírmalo en la app.</span>
        </Burbuja>

        <Burbuja de="usuario" visible={t >= 3600}>
          ¿Cómo van los mantenimientos?
        </Burbuja>

        <Burbuja de="glora" visible={t >= 4800}>
          <ul className="space-y-1">
            <li className="flex justify-between gap-4">
              <span>Aceite T-04</span>
              <span className="font-bold text-amber-300">250 km</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>ITV T-02</span>
              <span className="font-bold text-pilotos-yellow">12 días</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Lo demás</span>
              <span className="font-bold text-emerald-300">Al día</span>
            </li>
          </ul>
        </Burbuja>
      </div>
    </Fondo>
  );
}
