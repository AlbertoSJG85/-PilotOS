/**
 * Pantallas animadas de la demo (/demo). Cada una recibe `t`, los
 * milisegundos transcurridos en su escena, y se pinta en consecuencia:
 * solo transform/opacity, con transiciones CSS. El reloj lo lleva la demo.
 *
 *   1. El conductor rellena el parte en la app (con la foto del ticket).
 *   2. Al patrón le llegan los avisos de GlorIA (parte con diferencia, ITV).
 *   3. El patrón abre PilotOS en su móvil y lo ve todo de un vistazo.
 *
 * Fiel al producto: el parte entra por la app, no por WhatsApp; GlorIA
 * avisa. Las cifras son de ejemplo y van rotuladas.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, Camera, Check, ChevronRight, Gauge, Mail, Wrench } from 'lucide-react';


/** Tiempo "infinito": la pantalla se pinta en su estado final. */
export const FINAL = 999_999;

/* ── Piezas comunes ──────────────────────────────────────────────────── */

export const entra = (on: boolean) =>
  `transition duration-500 ease-out ${on ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`;

export function Telefono({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-[272px] rounded-[2.4rem] border border-white/[0.12] bg-[#020304] p-2 shadow-[0_50px_120px_-40px_rgba(0,0,0,1)]">
      <div className="relative h-[540px] overflow-hidden rounded-[1.9rem] bg-[#0B0D12]">
        <div
          aria-hidden
          className="absolute left-1/2 top-2.5 z-30 h-4 w-20 -translate-x-1/2 rounded-full bg-black"
        />
        {children}
      </div>
    </div>
  );
}

export function Ejemplo() {
  return (
    <span className="rounded-full border border-white/[0.14] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
      Ejemplo
    </span>
  );
}

/* ── 1. El conductor rellena el parte ────────────────────────────────── */

function Campo({
  etiqueta,
  valor,
  inicio,
  t,
}: {
  etiqueta: string;
  valor: string;
  inicio: number;
  t: number;
}) {
  const escrito = t >= inicio + 400;
  const escribiendo = t >= inicio - 100 && !escrito;
  return (
    <div
      className={`rounded-lg border px-3 py-2 transition duration-300 ${
        escribiendo ? 'border-pilotos-yellow/70 bg-pilotos-yellow/[0.06]' : 'border-white/10 bg-white/[0.04]'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{etiqueta}</p>
      <div className="relative mt-0.5 h-5">
        <span
          className={`absolute inset-0 text-sm font-bold text-white transition duration-300 ${
            escrito ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          }`}
        >
          {valor}
        </span>
        {!escrito && (
          <span
            aria-hidden
            className={`absolute left-0 top-0.5 h-4 w-px bg-pilotos-yellow ${escribiendo ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </div>
    </div>
  );
}

export function PantallaParte({ t }: { t: number }) {
  const ticket = t >= 3700;
  const escaneando = t >= 4300;
  const leido = t >= 5200;
  const pulsado = t >= 6200 && t < 6500;
  const enviado = t >= 6500;

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-9">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-white">Parte de hoy</p>
        <span className="rounded-md bg-pilotos-yellow px-2 py-0.5 text-[11px] font-black text-pilotos-black">
          T-04
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <Campo etiqueta="Kilómetros" valor="43.210 → 43.386" inicio={700} t={t} />
        <Campo etiqueta="Ingreso bruto" valor="198,40 €" inicio={1700} t={t} />
        <Campo etiqueta="Combustible" valor="42,00 €" inicio={2700} t={t} />
      </div>

      {/* Foto del ticket */}
      <div className="relative mt-3 h-[150px] overflow-hidden rounded-xl">
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-zinc-500 transition duration-300 ${
            ticket ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Camera className="h-6 w-6" />
          <span className="text-xs font-semibold">Foto del ticket</span>
        </div>

        <div
          className={`absolute inset-0 rounded-xl bg-zinc-100 p-3 font-mono text-[10px] leading-4 text-zinc-700 shadow-lg transition duration-500 ease-out ${
            ticket ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <p className="text-center font-bold tracking-widest text-zinc-900">TAXÍMETRO</p>
          <div className="mt-1 flex justify-between"><span>Carreras</span><span>186,40</span></div>
          <div className="flex justify-between"><span>Suplementos</span><span>32,00</span></div>
          <div className="mt-1 border-t border-dashed border-zinc-400 pt-1 flex justify-between text-sm font-bold text-zinc-900">
            <span>TOTAL</span><span>218,40 €</span>
          </div>
          <div
            aria-hidden
            className={`absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-pilotos-yellow/50 to-transparent transition duration-700 ease-in-out ${
              escaneando && !leido ? 'translate-y-[130px] opacity-100' : escaneando ? 'translate-y-[130px] opacity-0' : '-translate-y-8 opacity-0'
            }`}
          />
          <span
            className={`absolute bottom-2 right-2 flex h-6 items-center gap-1 rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white transition duration-300 ${
              leido ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            }`}
          >
            <Check className="h-3 w-3" /> Leído
          </span>
        </div>
      </div>

      <div className="mt-auto">
        <div
          className={`flex h-11 items-center justify-center rounded-lg bg-pilotos-yellow text-sm font-black text-pilotos-black transition duration-150 ${
            pulsado ? 'scale-95 brightness-90' : 'scale-100'
          }`}
        >
          Enviar parte
        </div>
      </div>

      {/* Confirmación */}
      <div
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0B0D12]/95 transition duration-300 ${
          enviado ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white transition duration-500 ease-out ${
            enviado ? 'scale-100' : 'scale-50'
          }`}
        >
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
        <p className="text-base font-black text-white">Parte enviado</p>
      </div>
    </div>
  );
}

/* ── 2. Al patrón le llegan los avisos ───────────────────────────────── */

function Aviso({
  visible,
  tono,
  icono,
  titulo,
  texto,
  correo,
}: {
  visible: boolean;
  tono: 'ambar' | 'amarillo';
  icono: ReactNode;
  titulo: string;
  texto: string;
  correo?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.09] p-3 backdrop-blur-md transition duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-pilotos-yellow text-[11px] font-black text-pilotos-black">
          G
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">GlorIA</p>
        <span className="ml-auto text-[10px] text-zinc-500">ahora</span>
      </div>
      <p
        className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${
          tono === 'ambar' ? 'text-amber-300' : 'text-pilotos-yellow'
        }`}
      >
        {icono}
        {titulo}
      </p>
      <p className="mt-1 text-[13px] leading-5 text-zinc-100">{texto}</p>
      {correo && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400">
          <Mail className="h-3 w-3" /> También por correo
        </p>
      )}
    </div>
  );
}

export function PantallaAviso({ t }: { t: number }) {
  return (
    <div className="flex h-full flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(255,183,3,0.16),transparent_60%)] px-4 pb-4 pt-12">
      <p className="text-center text-5xl font-light tracking-tight text-white">08:15</p>
      <p className="mt-1 text-center text-xs text-zinc-400">Lunes</p>

      <div className="mt-8 space-y-3">
        <Aviso
          visible={t >= 900}
          tono="ambar"
          icono={<AlertTriangle className="h-3.5 w-3.5" />}
          titulo="Revisa este parte"
          texto="El taxímetro del T-04 marca 20 € más de lo declarado."
          correo
        />
        <Aviso
          visible={t >= 2900}
          tono="amarillo"
          icono={<Wrench className="h-3.5 w-3.5" />}
          titulo="Mantenimiento"
          texto="La ITV del T-02 vence en 12 días."
          correo
        />
      </div>
    </div>
  );
}

/* ── 3. El patrón abre su dashboard desde el móvil ───────────────────── */

const kpis = [
  { etiqueta: 'Partes hoy', valor: '6/6', tono: 'text-emerald-300' },
  { etiqueta: 'Alertas', valor: '2', tono: 'text-red-300' },
  { etiqueta: 'Ingresos', valor: '1.284 €', tono: 'text-white' },
  { etiqueta: 'Neto est.', valor: '972 €', tono: 'text-pilotos-yellow' },
];

export function PantallaDashboard({ t }: { t: number }) {
  const abierto = t >= 1600;
  const toque = t >= 700 && t < 1500;

  return (
    <div className="relative h-full">
      {/* Pantalla de inicio del móvil */}
      <div className="flex h-full flex-col bg-[linear-gradient(180deg,#14181f,#0B0D12)] px-5 pt-14">
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {Array.from({ length: 12 }).map((_, i) =>
            i === 5 ? (
              <div key={i} className="relative flex flex-col items-center gap-1.5">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl bg-pilotos-yellow text-pilotos-black shadow-[0_8px_24px_-8px_rgba(255,183,3,0.8)] transition duration-200 ${
                    toque ? 'scale-90' : 'scale-100'
                  }`}
                >
                  <Gauge className="h-6 w-6" />
                </span>
                <span
                  aria-hidden
                  className={`absolute left-1/2 top-6 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pilotos-yellow ${
                    t >= 700 && t < 800
                      ? 'scale-50 opacity-80'
                      : t >= 800 && t < 1500
                        ? 'scale-[1.8] opacity-0 transition duration-700 ease-out'
                        : 'scale-50 opacity-0'
                  }`}
                />
                <span className="text-[9px] font-semibold text-zinc-300">PilotOS</span>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className="h-12 w-12 rounded-xl bg-white/[0.07]" />
                <span className="h-1.5 w-8 rounded bg-white/[0.06]" />
              </div>
            ),
          )}
        </div>
      </div>

      {/* Dashboard que se abre */}
      <div
        className={`absolute inset-0 z-10 flex flex-col bg-[#0B0D12] px-4 pb-4 pt-9 transition duration-500 ease-out ${
          abierto ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-white">Hoy en tu flota</p>
          <Ejemplo />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {kpis.map((k, i) => (
            <div
              key={k.etiqueta}
              className={`rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 ${entra(t >= 2100 + i * 250)}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{k.etiqueta}</p>
              <p className={`mt-1 text-lg font-black ${k.tono}`}>{k.valor}</p>
            </div>
          ))}
        </div>

        <p className={`mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500 ${entra(t >= 3300)}`}>
          Requiere tu atención
        </p>
        <div className="mt-2 space-y-2">
          <div
            className={`flex items-center gap-2.5 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2.5 ${entra(t >= 3500)}`}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white">Parte T-04</p>
              <p className="text-[11px] text-amber-200">20 € de diferencia</p>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          </div>
          <div
            className={`flex items-center gap-2.5 rounded-lg border border-pilotos-yellow/30 bg-pilotos-yellow/[0.07] px-3 py-2.5 ${entra(t >= 3900)}`}
          >
            <Wrench className="h-4 w-4 shrink-0 text-pilotos-yellow" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white">ITV · T-02</p>
              <p className="text-[11px] text-zinc-300">Vence en 12 días</p>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          </div>
        </div>

        <div className={`mt-4 space-y-2.5 ${entra(t >= 4500)}`}>
          {[
            { n: 'Aceite · T-04', p: 90, c: 'bg-amber-400' },
            { n: 'Seguro · T-03', p: 28, c: 'bg-emerald-400' },
          ].map((b) => (
            <div key={b.n}>
              <p className="mb-1 text-[11px] font-semibold text-zinc-300">{b.n}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full origin-left rounded-full transition duration-1000 ease-out ${b.c} ${
                    t >= 4700 ? 'scale-x-100' : 'scale-x-0'
                  }`}
                  style={{ width: `${b.p}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

