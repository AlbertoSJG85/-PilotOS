'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarCheck,
  Check,
  Gauge,
  MessageCircle,
  Pause,
  Play,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  FINAL,
  PantallaAviso,
  PantallaDashboard,
  PantallaParte,
  Telefono,
  entra,
} from './demo-pantallas';
import { PantallaCierre, PantallaRevision } from './demo-pantallas-extra';
import {
  PantallaGloriaAsalariado,
  PantallaGloriaPropietario,
  PantallaMantenimientos,
} from './demo-pantallas-gloria';

/**
 * Demo de PilotOS (/demo): un móvil que se anima y, al lado, lo que PilotOS
 * hace en cada momento.
 *
 * Ocho escenas: el parte (app), su revisión, los avisos, los mantenimientos,
 * GlorIA con el asalariado y con el propietario (WhatsApp), el dashboard y
 * el cierre del mes. Todo es fiel al producto: el parte entra por la app;
 * por WhatsApp se suben facturas y documentos y se consulta.
 *
 * Con prefers-reduced-motion no hay secuencia: se ven todas las escenas
 * ya terminadas, una debajo de otra.
 */

type Tono = 'ok' | 'warn' | 'info';
type Evento = { t: number; tono: Tono; texto: string };

type Escena = {
  paso: string;
  resumen: string;
  titulo: string;
  acento: string;
  icono: LucideIcon;
  duracion: number;
  Pantalla: ComponentType<{ t: number }>;
  eventos: Evento[];
};

const escenas: Escena[] = [
  {
    paso: 'Parte diario',
    resumen: 'Desde la app, con foto del ticket',
    titulo: 'El asalariado',
    acento: 'rellena el parte',
    icono: CalendarCheck,
    duracion: 8600,
    Pantalla: PantallaParte,
    eventos: [
      { t: 700, tono: 'info', texto: 'Rellena el parte desde la app: km, ingresos y combustible' },
      { t: 3700, tono: 'info', texto: 'Sube la foto del ticket del taxímetro (obligatoria)' },
      { t: 5200, tono: 'ok', texto: 'PilotOS lee el ticket: 218,40 €' },
      { t: 6500, tono: 'ok', texto: 'Parte enviado. Ya no se puede modificar' },
    ],
  },
  {
    paso: 'Revisión',
    resumen: 'PilotOS compara, tú decides',
    titulo: 'PilotOS compara',
    acento: 'y tú decides',
    icono: ShieldCheck,
    duracion: 7400,
    Pantalla: PantallaRevision,
    eventos: [
      { t: 500, tono: 'info', texto: 'Compara el ticket con lo que declaró el asalariado' },
      { t: 1000, tono: 'ok', texto: 'Kilómetros y fecha coherentes con el parte anterior' },
      { t: 1500, tono: 'ok', texto: 'El combustible coincide con su ticket' },
      { t: 2100, tono: 'warn', texto: 'Importe distinto: 218,40 € en el ticket, 198,40 € declarado' },
      { t: 2700, tono: 'warn', texto: 'Parte retenido: no suma en tus cuentas hasta que decidas' },
      { t: 4700, tono: 'ok', texto: 'Lo aceptas, o pides que lo rehagan' },
      { t: 5900, tono: 'ok', texto: 'El asalariado recibe la notificación' },
    ],
  },
  {
    paso: 'Avisos',
    resumen: 'WhatsApp y correo',
    titulo: 'GlorIA',
    acento: 'te avisa',
    icono: Bell,
    duracion: 6400,
    Pantalla: PantallaAviso,
    eventos: [
      { t: 900, tono: 'warn', texto: 'Aviso al propietario: hay un parte que revisar' },
      { t: 2900, tono: 'info', texto: 'Aviso al propietario: un mantenimiento está por vencer' },
      { t: 3700, tono: 'ok', texto: 'Llegan por WhatsApp y también por correo' },
      { t: 4700, tono: 'ok', texto: 'Solo avisos que importan, sin ruido' },
    ],
  },
  {
    paso: 'Mantenimientos',
    resumen: 'ITV, seguro, revisiones',
    titulo: 'Cada coche',
    acento: 'al día',
    icono: Wrench,
    duracion: 6200,
    Pantalla: PantallaMantenimientos,
    eventos: [
      { t: 500, tono: 'info', texto: 'Los km de cada coche se actualizan con cada parte' },
      { t: 1300, tono: 'ok', texto: 'Vigila revisiones, ITV y seguros, por km y por fecha' },
      { t: 3200, tono: 'ok', texto: 'Avisa con margen: 1.000, 500 y 250 km antes' },
      { t: 4700, tono: 'warn', texto: 'Si se pasa, sigue recordándotelo' },
    ],
  },
  {
    paso: 'GlorIA · asalariado',
    resumen: 'Sube facturas por WhatsApp',
    titulo: 'El asalariado',
    acento: 'sube una factura',
    icono: ReceiptText,
    duracion: 7000,
    Pantalla: PantallaGloriaAsalariado,
    eventos: [
      { t: 700, tono: 'info', texto: 'Manda por WhatsApp la foto de una factura o recibo' },
      { t: 2000, tono: 'ok', texto: 'GlorIA la lee y la clasifica: taller, 86,50 €' },
      { t: 2700, tono: 'info', texto: 'Pregunta solo lo que falta: la forma de pago' },
      { t: 5000, tono: 'ok', texto: 'Gasto registrado en su vehículo y su periodo' },
      { t: 5700, tono: 'info', texto: 'El parte, siempre desde la app' },
    ],
  },
  {
    paso: 'GlorIA · propietario',
    resumen: 'Documentos y consultas',
    titulo: 'El propietario',
    acento: 'sube y pregunta',
    icono: MessageCircle,
    duracion: 7600,
    Pantalla: PantallaGloriaPropietario,
    eventos: [
      { t: 700, tono: 'info', texto: 'Manda la foto del seguro, la ITV o una factura de taller' },
      { t: 2000, tono: 'ok', texto: 'GlorIA la guarda en el coche y propone los datos' },
      { t: 2900, tono: 'info', texto: 'Tú la confirmas en la app' },
      { t: 3700, tono: 'info', texto: 'También le puedes preguntar por tu negocio' },
      { t: 4900, tono: 'ok', texto: 'Responde con tus datos reales: mantenimientos y estado' },
    ],
  },
  {
    paso: 'Dashboard',
    resumen: 'Todo de un vistazo',
    titulo: 'Tú lo ves',
    acento: 'en tu móvil',
    icono: Gauge,
    duracion: 7800,
    Pantalla: PantallaDashboard,
    eventos: [
      { t: 700, tono: 'info', texto: 'Abres PilotOS desde el móvil, sin instalar nada raro' },
      { t: 2200, tono: 'ok', texto: 'Cómo va el día: partes, ingresos y neto' },
      { t: 3500, tono: 'warn', texto: 'Lo que requiere tu atención, arriba' },
      { t: 4700, tono: 'ok', texto: 'Mantenimientos con su estado, sin buscar nada' },
    ],
  },
  {
    paso: 'Cierre del mes',
    resumen: 'Reparto y Seguridad Social',
    titulo: 'Fin de mes',
    acento: 'cuentas claras',
    icono: Check,
    duracion: 7200,
    Pantalla: PantallaCierre,
    eventos: [
      { t: 400, tono: 'ok', texto: 'Suma solo los partes aceptados' },
      { t: 1400, tono: 'ok', texto: 'Calcula ingresos, combustible, neto y gastos del periodo' },
      { t: 2600, tono: 'ok', texto: 'Reparte entre propietario y asalariado según tu configuración' },
      { t: 3800, tono: 'ok', texto: 'Descuenta la Seguridad Social del asalariado' },
      { t: 5000, tono: 'ok', texto: 'Cierre guardado para consultarlo cuando quieras' },
    ],
  },
];

const DURACION_TOTAL = escenas.reduce((suma, e) => suma + e.duracion, 0);

/* ── Panel «Qué hace PilotOS» ────────────────────────────────────────── */

function IconoTono({ tono }: { tono: Tono }) {
  if (tono === 'ok') {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (tono === 'warn') {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pilotos-yellow/15">
      <span className="h-1.5 w-1.5 rounded-full bg-pilotos-yellow" />
    </span>
  );
}

function PanelQueHace({ eventos, t }: { eventos: Evento[]; t: number }) {
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0B0D12]/80 p-5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-pilotos-yellow">
        Qué hace PilotOS
      </p>
      <ul className="mt-4 space-y-3">
        {eventos.map((e) => (
          <li key={e.texto} className={`flex gap-3 text-sm leading-5 text-zinc-200 ${entra(t >= e.t)}`}>
            <IconoTono tono={e.tono} />
            <span>{e.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Demo ────────────────────────────────────────────────────────────── */

const CONSULTA_MOVIMIENTO = '(prefers-reduced-motion: reduce)';

/** true si la persona pide menos movimiento (en el servidor, false). */
function useMenosMovimiento() {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia(CONSULTA_MOVIMIENTO);
      consulta.addEventListener('change', avisar);
      return () => consulta.removeEventListener('change', avisar);
    },
    () => window.matchMedia(CONSULTA_MOVIMIENTO).matches,
    () => false,
  );
}

export function PilotOSDemo() {
  const [estado, setEstado] = useState({ escena: 0, t: 0 });
  const [playing, setPlaying] = useState(true);
  const reducido = useMenosMovimiento();
  const { escena, t } = estado;

  useEffect(() => {
    if (!playing || reducido) return;
    const id = window.setInterval(() => {
      setEstado((s) => {
        const siguiente = s.t + 100;
        return siguiente >= escenas[s.escena].duracion
          ? { escena: (s.escena + 1) % escenas.length, t: 0 }
          : { escena: s.escena, t: siguiente };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, reducido]);

  const progresoTotal = useMemo(() => {
    if (reducido) return 100;
    const previo = escenas.slice(0, escena).reduce((suma, e) => suma + e.duracion, 0);
    return ((previo + t) / DURACION_TOTAL) * 100;
  }, [escena, t, reducido]);

  function ir(indice: number) {
    setEstado({ escena: indice, t: 0 });
    setPlaying(true);
  }

  const actual = escenas[escena];

  return (
    <main className="relative min-h-screen overflow-hidden bg-pilotos-black text-white">
      <style>{`
        @keyframes demoRise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .demo-titulo { animation: none !important; opacity: 1 !important; }
        }
      `}</style>

      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-white/10">
        <div
          className="h-full bg-pilotos-yellow transition-[width] duration-100"
          style={{ width: `${progresoTotal}%` }}
        />
      </div>

      <div className="absolute inset-0">
        <Image
          src="/branding/pilotos/landing-hero-mockup.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#05070B_0%,rgba(5,7,11,0.88)_45%,#05070B_100%)]" />
      </div>

      <section className="relative z-10 flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/branding/pilotos/logo-full.png"
              alt="PilotOS"
              width={176}
              height={52}
              className="h-11 w-auto object-contain"
              priority
            />
          </Link>
          <div className="flex items-center gap-2">
            {!reducido && (
              <>
                <button
                  type="button"
                  onClick={() => setPlaying((value) => !value)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-white transition hover:border-pilotos-yellow/40"
                  aria-label={playing ? 'Pausar demo' : 'Reproducir demo'}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => ir(0)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-white transition hover:border-pilotos-yellow/40"
                  aria-label="Repetir demo"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </>
            )}
            <Link
              href="/onboarding"
              className="hidden min-h-11 items-center justify-center gap-2 rounded-lg bg-pilotos-yellow px-4 text-sm font-black text-pilotos-black transition hover:bg-[#ffc533] sm:inline-flex"
            >
              Solicitar demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <p className="sr-only">
          El asalariado rellena el parte en la app con la foto del ticket. PilotOS lo compara y
          retiene lo que no cuadra para que el propietario decida. GlorIA avisa por WhatsApp y por
          correo, vigila los mantenimientos y permite subir facturas y documentos por WhatsApp, tanto
          al asalariado como al propietario. El propietario lo ve todo en su móvil y cierra el mes
          con el reparto y la Seguridad Social.
        </p>

        {!reducido ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
            <div className="text-center">
              <p className="mb-3 inline-flex items-center rounded-full border border-pilotos-yellow/30 bg-pilotos-yellow/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-pilotos-yellow">
                {escena + 1} / {escenas.length} · {actual.paso}
              </p>
              <h1
                key={`titulo-${escena}`}
                className="demo-titulo text-4xl font-black leading-none text-white opacity-0 animate-[demoRise_500ms_cubic-bezier(.16,1,.3,1)_forwards] sm:text-5xl"
              >
                {actual.titulo} <span className="text-pilotos-yellow">{actual.acento}</span>
              </h1>
            </div>

            <div className="grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[250px_272px_1fr] lg:gap-10">
              {/* Pasos (escritorio) */}
              <nav aria-label="Pasos de la demo" className="hidden lg:block">
                <ol className="space-y-1">
                  {escenas.map((e, i) => {
                    const Icono = e.icono;
                    const activa = i === escena;
                    return (
                      <li key={e.paso}>
                        <button
                          type="button"
                          onClick={() => ir(i)}
                          aria-current={activa ? 'step' : undefined}
                          className={`group w-full rounded-xl px-3 py-2.5 text-left transition duration-300 ${
                            activa ? 'bg-white/[0.06]' : 'opacity-50 hover:opacity-90'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition duration-300 ${
                                activa ? 'bg-pilotos-yellow text-pilotos-black' : 'bg-white/10 text-zinc-300'
                              }`}
                            >
                              <Icono className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-white">{e.paso}</span>
                              <span className="block truncate text-xs text-zinc-400">{e.resumen}</span>
                            </span>
                          </span>
                          <span className="mt-2 block h-0.5 overflow-hidden rounded-full bg-white/10">
                            <span
                              className="block h-full origin-left bg-pilotos-yellow transition-transform duration-100 ease-linear"
                              style={{ transform: `scaleX(${activa ? t / e.duracion : i < escena ? 1 : 0})` }}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              {/* Móvil */}
              <div aria-hidden className="mx-auto">
                <Telefono>
                  <actual.Pantalla key={`pantalla-${escena}`} t={t} />
                </Telefono>
              </div>

              {/* Qué hace PilotOS */}
              <div key={`panel-${escena}`} className="mx-auto w-full max-w-md lg:max-w-none">
                <PanelQueHace eventos={actual.eventos} t={t} />
              </div>
            </div>

            {/* Selector (móvil) */}
            <div className="flex flex-wrap justify-center gap-1 lg:hidden">
              {escenas.map((e, i) => (
                <button
                  key={e.paso}
                  type="button"
                  onClick={() => ir(i)}
                  aria-label={`Ver paso ${i + 1}: ${e.paso}`}
                  aria-current={escena === i ? 'step' : undefined}
                  className="flex h-11 w-9 items-center justify-center"
                >
                  <span
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      escena === i ? 'w-8 bg-pilotos-yellow' : 'w-2.5 bg-white/25'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Sin movimiento: todas las escenas ya terminadas. */
          <div className="mx-auto w-full max-w-5xl flex-1 space-y-16 py-10">
            <h1 className="text-center text-4xl font-black leading-none text-white sm:text-5xl">
              Así funciona <span className="text-pilotos-yellow">PilotOS</span>
            </h1>
            {escenas.map((e) => (
              <div key={e.paso} className="grid items-center gap-8 lg:grid-cols-[272px_1fr] lg:gap-12">
                <div aria-hidden className="mx-auto">
                  <Telefono>
                    <e.Pantalla t={FINAL} />
                  </Telefono>
                </div>
                <div>
                  <h2 className="mb-4 text-2xl font-black text-white">
                    {e.titulo} <span className="text-pilotos-yellow">{e.acento}</span>
                  </h2>
                  <PanelQueHace eventos={e.eventos} t={FINAL} />
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-zinc-500">
            Demo visual local. No crea registros, no toca backend y no modifica datos reales.
          </p>
          <div className="flex gap-3">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/12 px-4 text-sm font-bold text-white transition hover:border-pilotos-yellow/40"
            >
              Volver a la landing
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pilotos-yellow px-4 text-sm font-black text-pilotos-black transition hover:bg-[#ffc533]"
            >
              Solicitar demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
