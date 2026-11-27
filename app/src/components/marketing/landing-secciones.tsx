import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Camera,
  Check,
  FileText,
  Mail,
  MessageCircle,
  Paperclip,
  ReceiptText,
  Sparkles,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { PantallaAviso, PantallaParte, Telefono } from './demo-pantallas';
import { PantallaRevision } from './demo-pantallas-extra';
import { PantallaGloriaAsalariado, PantallaGloriaPropietario } from './demo-pantallas-gloria';

/**
 * Secciones de la landing que van bajo el hero. Son componentes de servidor
 * (sin estado): las pantallas de móvil son las mismas de la demo, pintadas en
 * un instante fijo de su animación, así que la landing y /demo cuentan lo
 * mismo. Todo lo que se menciona existe en el producto: el parte entra por la
 * app; GlorIA avisa, recibe facturas y documentos y responde consultas.
 */

function delay(ms: number): CSSProperties {
  return { '--reveal-delay': `${ms}ms` } as CSSProperties;
}

function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-pilotos-yellow/30 bg-pilotos-yellow/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-pilotos-yellow">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

/* ── El problema: el caos de siempre, en imagen ──────────────────────── */

export function Problema() {
  return (
    <section className="relative px-5 py-24 sm:px-8 lg:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-10 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.08),transparent_70%)] blur-2xl"
      />
      <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div data-reveal>
          <Etiqueta>El problema</Etiqueta>
          <h2 className="max-w-xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Tu negocio vive en WhatsApps, papeles y hojas sueltas.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">
            Y cada dato que se pierde es dinero que no ves: un parte que no llega, un ticket que
            no cuadra, una ITV que caduca sin que nadie se acuerde.
          </p>
        </div>

        {/* Collage: lo que hoy pasa por tu móvil. */}
        <div className="relative mx-auto grid w-full max-w-xl gap-4 sm:grid-cols-2" data-reveal style={delay(100)}>
          <div className="rounded-2xl border border-white/10 bg-[#0B141A] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,1)] sm:-rotate-2">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
              <MessageCircle className="h-4 w-4 text-emerald-400" /> WhatsApp
            </p>
            <div className="space-y-2 text-[13px] leading-5">
              <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#202C33] px-3 py-2 text-zinc-100">
                Te paso el parte luego
              </p>
              <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#202C33] px-3 py-2 text-zinc-100">
                [foto borrosa del ticket]
              </p>
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#075E54] px-3 py-2 text-white">
                ¿Y los km de ayer?
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0D12] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,1)] sm:translate-y-6 sm:rotate-1">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
              <FileText className="h-4 w-4 text-sky-400" /> Hoja de cálculo
            </p>
            <div className="grid grid-cols-4 gap-1 text-[10px] text-zinc-300">
              {['Día', 'Km', 'Bruto', 'Comb.', '12', '176', '198', '—', '13', '—', '221', '42', '14', '190', '??', '38'].map(
                (c, i) => (
                  <span
                    key={i}
                    className={`rounded px-1.5 py-1 text-center ${
                      i < 4
                        ? 'bg-white/10 font-bold'
                        : c === '—' || c === '??'
                          ? 'border border-red-400/50 bg-red-500/10 text-red-300'
                          : 'bg-white/[0.04]'
                    }`}
                  >
                    {c}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/[0.08] p-4 sm:col-span-2 sm:-rotate-1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-white">La ITV venció hace 3 días</p>
              <p className="text-xs text-zinc-400">Nadie lo apuntó. Nadie avisó.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Cómo funciona: tres pasos con las pantallas reales ──────────────── */

// Instante fijo en el que todos los avisos y mensajes ya han entrado.
const FIN = 99_999;

const pasos = [
  {
    n: '1',
    titulo: 'El asalariado hace el parte en la app',
    detalle: 'Km, ingresos y foto del ticket. Un minuto, desde el móvil.',
    pantalla: <PantallaParte t={6000} />,
  },
  {
    n: '2',
    titulo: 'PilotOS lo compara con el ticket',
    detalle: 'Si algo no cuadra, queda retenido y decides tú.',
    pantalla: <PantallaRevision t={3600} />,
  },
  {
    n: '3',
    titulo: 'GlorIA te avisa de lo importante',
    detalle: 'Partes con diferencias y mantenimientos por vencer.',
    pantalla: <PantallaAviso t={FIN} />,
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative px-5 py-24 sm:px-8 lg:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-1/4 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.09),transparent_68%)] blur-2xl"
      />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <Etiqueta>Cómo funciona</Etiqueta>
          <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Tres pasos. Tú solo decides lo que importa.
          </h2>
        </div>

        {/* En móvil se desliza de lado; desde lg, tres columnas. */}
        <ol className="-mx-5 mt-16 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-8 lg:overflow-visible lg:px-0">
          {pasos.map((paso, i) => (
            <li
              key={paso.n}
              data-reveal
              style={delay(i * 120)}
              className="w-[300px] shrink-0 snap-center lg:w-auto"
            >
              <div aria-hidden>
                <Telefono>{paso.pantalla}</Telefono>
              </div>
              <div className="mx-auto mt-7 max-w-[272px]">
                <p className="flex items-center gap-3 text-base font-bold leading-snug text-white">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pilotos-yellow text-sm font-black text-pilotos-black">
                    {paso.n}
                  </span>
                  {paso.titulo}
                </p>
                <p className="mt-2 pl-11 text-sm leading-6 text-zinc-400">{paso.detalle}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex justify-center" data-reveal>
          <Link
            href="/demo"
            className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-pilotos-yellow/40 bg-pilotos-yellow/10 px-5 text-sm font-bold text-pilotos-yellow transition duration-200 hover:-translate-y-0.5 hover:bg-pilotos-yellow/20"
          >
            Ver la demo animada
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Funciones: lo que te quita de encima, cada una con su imagen ────── */

function Tarjeta({
  icono: Icono,
  titulo,
  texto,
  indice,
  children,
}: {
  icono: typeof Wrench;
  titulo: string;
  texto: string;
  indice: number;
  children: ReactNode;
}) {
  return (
    <article
      data-reveal
      style={delay((indice % 3) * 80)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0D12] p-6 shadow-[0_24px_60px_-36px_rgba(0,0,0,1)] transition duration-200 hover:-translate-y-1 hover:border-pilotos-yellow/30"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.14),transparent_70%)] opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-pilotos-yellow text-pilotos-black shadow-[0_8px_24px_-8px_rgba(255,183,3,0.7)]">
        <Icono className="h-5 w-5" />
      </div>
      <h3 className="relative text-lg font-bold text-white">{titulo}</h3>
      <p className="relative mt-2 text-sm leading-6 text-zinc-400">{texto}</p>
      <div aria-hidden className="relative mt-6 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        {children}
      </div>
    </article>
  );
}

export function Funciones() {
  return (
    <section className="relative px-5 py-24 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl" data-reveal>
          <Etiqueta>Lo que te quita de encima</Etiqueta>
          <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Menos perseguir. Más control.
          </h2>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Tarjeta
            indice={0}
            icono={ReceiptText}
            titulo="Partes que cuadran"
            texto="Cada parte se compara con la foto del ticket. Si algo no cuadra, te lo enseña."
          >
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between text-zinc-300">
                <span>Kilómetros</span>
                <Check className="h-4 w-4 text-emerald-400" strokeWidth={3} />
              </li>
              <li className="flex items-center justify-between text-zinc-300">
                <span>Ticket del taxímetro</span>
                <Check className="h-4 w-4 text-emerald-400" strokeWidth={3} />
              </li>
              <li className="flex items-center justify-between rounded-md bg-amber-400/10 px-2 py-1.5 font-semibold text-amber-300">
                <span>Importe: 20 € de diferencia</span>
                <AlertTriangle className="h-4 w-4" />
              </li>
            </ul>
          </Tarjeta>

          <Tarjeta
            indice={1}
            icono={Wrench}
            titulo="Mantenimientos al día"
            texto="ITV, seguro y revisiones por kilómetros y por fecha, con aviso antes de que venzan."
          >
            <div className="space-y-3">
              {[
                { n: 'ITV · T-02', e: '12 días', p: 82, c: 'bg-pilotos-yellow' },
                { n: 'Aceite · T-04', e: '250 km', p: 90, c: 'bg-amber-400' },
                { n: 'Seguro · T-03', e: 'Al día', p: 28, c: 'bg-emerald-400' },
              ].map((b) => (
                <div key={b.n}>
                  <p className="mb-1 flex justify-between text-[11px] font-semibold text-zinc-300">
                    <span>{b.n}</span>
                    <span className="text-zinc-400">{b.e}</span>
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${b.c}`} style={{ width: `${b.p}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta
            indice={2}
            icono={Bell}
            titulo="Avisos que importan"
            texto="GlorIA te avisa por WhatsApp y también por correo, solo de lo que necesita tu atención."
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 rounded-lg bg-[#202C33] px-3 py-2 text-[11px] text-zinc-100">
                <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                La ITV del T-02 vence en 12 días
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-3 py-2 text-[11px] text-zinc-300">
                <Mail className="h-4 w-4 shrink-0 text-sky-400" />
                Copia por correo
              </div>
            </div>
          </Tarjeta>

          <Tarjeta
            indice={3}
            icono={Camera}
            titulo="Gastos y documentos con una foto"
            texto="Factura del taller, seguro, ITV: mándalas por WhatsApp o súbelas en la app."
          >
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.06] px-3 py-2 text-zinc-200">
                <span>Taller · T-02</span>
                <span className="flex items-center gap-2 font-bold text-white">
                  86,50 € <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ITV', 'Seguro', 'Factura'].map((d) => (
                  <span key={d} className="rounded-full border border-white/15 px-2.5 py-1 font-semibold text-zinc-300">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </Tarjeta>

          <Tarjeta
            indice={4}
            icono={UsersRound}
            titulo="Cada uno, lo suyo"
            texto="El asalariado hace su parte y ve su mes. El propietario revisa, acepta y cierra."
          >
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-white/[0.06] p-2.5">
                <p className="font-bold text-white">Asalariado</p>
                <p className="mt-1 text-zinc-400">Parte · su mes</p>
              </div>
              <div className="rounded-lg bg-pilotos-yellow/10 p-2.5">
                <p className="font-bold text-pilotos-yellow">Propietario</p>
                <p className="mt-1 text-zinc-300">Revisa · decide</p>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta
            indice={5}
            icono={FileText}
            titulo="Cierre de mes sin hojas"
            texto="Ingresos, combustible, gastos y reparto entre propietario y asalariado, calculados."
          >
            <div>
              <div className="flex h-4 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-pilotos-yellow" style={{ width: '55%' }} />
                <div className="h-full bg-sky-400" style={{ width: '45%' }} />
              </div>
              <div className="mt-2.5 flex justify-between text-[11px] font-semibold text-zinc-300">
                <span>Propietario 55 %</span>
                <span>Asalariado 45 %</span>
              </div>
            </div>
          </Tarjeta>
        </div>
      </div>
    </section>
  );
}

/* ── Precios: la tarifa única de Pay (pilotos_taxi), sin letra pequeña ── */

// Cifras del catálogo de NexOS Pay (pilotos_taxi). Pay es la fuente de verdad:
// si cambia la tarifa allí, hay que cambiarla aquí en el mismo cambio.
const BASE = 5.99;
const POR_ASALARIADO = 2;
const POR_VEHICULO_EXTRA = 3;

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

const incluido = [
  'Partes diarios desde la app, comparados con el ticket',
  'Mantenimientos, ITV y seguro con aviso antes de vencer',
  'Gastos y documentos con una foto, también por WhatsApp',
  'GlorIA por WhatsApp y correo',
  'Cierre de mes y reparto calculados',
];

const ejemplos = [
  { quien: 'Autónomo con su taxi', taxis: 1, asalariados: 0 },
  { quien: 'Un taxi y un asalariado', taxis: 1, asalariados: 1 },
  { quien: 'Dos taxis y dos asalariados', taxis: 2, asalariados: 2 },
  { quien: 'Tres taxis y cuatro asalariados', taxis: 3, asalariados: 4 },
].map((e) => ({
  ...e,
  total: BASE + e.asalariados * POR_ASALARIADO + (e.taxis - 1) * POR_VEHICULO_EXTRA,
}));

export function Precios() {
  return (
    <section id="precios" className="relative scroll-mt-24 px-5 py-24 sm:px-8 lg:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/3 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.08),transparent_68%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <Etiqueta>Precios</Etiqueta>
          <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Un precio. Pagas solo lo que tienes.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-400">
            Sin planes que comparar. Empiezas con 30 días de prueba y decides al final.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* La tarifa. */}
          <article
            data-reveal
            className="relative overflow-hidden rounded-2xl border border-pilotos-yellow/30 bg-[#0B0D12] p-7 shadow-[0_40px_100px_-50px_rgba(255,183,3,0.35)] sm:p-9"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,183,3,0.7),transparent)]"
            />
            <p className="text-sm font-semibold text-zinc-300">PilotOS para tu taxi</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-6xl font-black tracking-tight text-white">5,99 €</span>
              <span className="text-base font-semibold text-zinc-400">/ mes</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">Impuestos aparte · incluye tu primer vehículo</p>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-2xl font-black text-pilotos-yellow">+ {POR_ASALARIADO} €</p>
                <p className="mt-1 text-sm text-zinc-300">por cada asalariado</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-2xl font-black text-pilotos-yellow">+ {POR_VEHICULO_EXTRA} €</p>
                <p className="mt-1 text-sm text-zinc-300">por cada vehículo más</p>
              </div>
            </div>

            <ul className="mt-7 space-y-3">
              {incluido.map((linea) => (
                <li key={linea} className="flex items-start gap-3 text-sm leading-6 text-zinc-300">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-pilotos-yellow" strokeWidth={3} />
                  {linea}
                </li>
              ))}
            </ul>

            <Link
              href="/onboarding"
              className="group mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-pilotos-yellow px-5 text-sm font-bold text-pilotos-black shadow-[0_10px_34px_-10px_rgba(255,183,3,0.65)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#ffc533]"
            >
              Empezar 30 días de prueba
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-3 text-center text-xs text-zinc-500">
              Antes de que acabe la prueba te avisamos y contratas con tarjeta si quieres seguir.
            </p>
          </article>

          {/* Cuánto pagarías tú. */}
          <aside data-reveal style={delay(120)} className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0B0D12]/60 p-7 sm:p-9">
            <p className="text-sm font-semibold text-zinc-300">¿Cuánto pagarías tú?</p>
            <ul className="mt-5 flex-1 divide-y divide-white/[0.08]">
              {ejemplos.map((e) => (
                <li key={e.quien} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-bold text-white">{e.quien}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {euros(BASE)}
                      {e.asalariados > 0 && ` + ${e.asalariados} × ${POR_ASALARIADO} €`}
                      {e.taxis > 1 && ` + ${e.taxis - 1} × ${POR_VEHICULO_EXTRA} €`}
                    </p>
                  </div>
                  <p className="shrink-0 text-xl font-black text-white">
                    {euros(e.total)}
                    <span className="ml-1 text-xs font-semibold text-zinc-500">/mes</span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg bg-white/[0.04] px-4 py-3 text-xs leading-5 text-zinc-400">
              Se cobra lo que tengas dado de alta el día del cobro. Si das de baja un asalariado o un
              vehículo, el mes siguiente ya no lo pagas.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

/* ── GlorIA: el apoyo por WhatsApp ───────────────────────────────────── */

const apoyos = [
  { icono: Bell, texto: 'Te avisa de mantenimientos y de partes con diferencias.' },
  { icono: Camera, texto: 'Recibe facturas y documentos, del asalariado y del propietario.' },
  { icono: MessageCircle, texto: 'Te responde cuando le preguntas cómo va tu negocio.' },
];

export function GloriaApoyo() {
  return (
    <section className="relative px-5 py-24 sm:px-8 lg:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.07),transparent_66%)] blur-3xl"
      />
      <div className="relative mx-auto grid max-w-7xl gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div data-reveal>
          <Etiqueta>GlorIA</Etiqueta>
          <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            GlorIA te echa una mano por WhatsApp.
          </h2>
          <ul className="mt-8 space-y-4">
            {apoyos.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-pilotos-yellow/25 bg-pilotos-yellow/10 text-pilotos-yellow">
                  <Icono className="h-5 w-5" />
                </span>
                <p className="text-base leading-6 text-zinc-200">{texto}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300">
            <Check className="h-4 w-4 text-pilotos-yellow" strokeWidth={3} />
            El parte diario se hace siempre en la app.
          </p>
        </div>

        {/* Dos conversaciones: el asalariado y el propietario. */}
        <div className="relative mx-auto flex w-full justify-center gap-6 lg:justify-end" data-reveal style={delay(100)}>
          <div aria-hidden className="shrink-0 sm:-rotate-2">
            <Telefono>
              <PantallaGloriaAsalariado t={FIN} />
            </Telefono>
          </div>
          <div aria-hidden className="hidden shrink-0 sm:mt-14 sm:block sm:rotate-2">
            <Telefono>
              <PantallaGloriaPropietario t={FIN} />
            </Telefono>
          </div>
        </div>
      </div>
    </section>
  );
}
