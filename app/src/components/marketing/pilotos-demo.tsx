'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Gauge,
  MessageCircle,
  Pause,
  Play,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

type DemoMessage = {
  author: 'GlorIA' | 'Conductor' | 'Sistema';
  text: string;
};

type DemoScene = {
  chip: string;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  duration: number;
  focus: 'phone' | 'dashboard' | 'split';
  messages: DemoMessage[];
  stats: Array<{ label: string; value: string; tone?: 'yellow' | 'green' | 'red' }>;
  checklist: string[];
};

const scenes: DemoScene[] = [
  {
    chip: 'Demo operativa',
    eyebrow: 'PilotOS by NexOS',
    title: 'Gestion inteligente',
    accent: 'para flotas',
    description:
      'Una demo guiada para ver como PilotOS transforma mensajes, partes, tickets y alertas en control operativo diario.',
    duration: 5600,
    focus: 'split',
    messages: [
      { author: 'Sistema', text: 'Turno iniciado. Flota sincronizada.' },
      { author: 'GlorIA', text: 'Hoy tienes 6 vehiculos activos y 2 revisiones pendientes.' },
    ],
    stats: [
      { label: 'Vehiculos activos', value: '6' },
      { label: 'Control diario', value: '87%' },
      { label: 'Alertas', value: '2', tone: 'red' },
    ],
    checklist: ['Operacion diaria', 'Ingresos y gastos', 'Mantenimientos', 'Reportes'],
  },
  {
    chip: 'Parte diario',
    eyebrow: '01. Entrada natural',
    title: 'El conductor envia',
    accent: 'su parte por WhatsApp',
    description:
      'GlorIA recoge los datos del turno y PilotOS prepara el registro sin perseguir mensajes sueltos.',
    duration: 7800,
    focus: 'phone',
    messages: [
      {
        author: 'Conductor',
        text: 'Turno terminado. Km 43.210 a 43.386. Bruto 218,40 euros. Combustible 42 euros. Datafono 86 euros.',
      },
      {
        author: 'GlorIA',
        text: 'Recibido. Falta adjuntar ticket de taximetro y combustible para dejar el parte listo.',
      },
      { author: 'Conductor', text: 'Te mando las fotos ahora.' },
      { author: 'Sistema', text: 'Parte preparado. Pendiente de validacion.' },
    ],
    stats: [
      { label: 'Km declarados', value: '176' },
      { label: 'Bruto turno', value: '218,40' },
      { label: 'Tickets', value: '2/2', tone: 'green' },
    ],
    checklist: ['Datos capturados', 'Tickets vinculados', 'Parte preparado'],
  },
  {
    chip: 'Validacion',
    eyebrow: '02. Menos errores manuales',
    title: 'PilotOS revisa',
    accent: 'lo importante',
    description:
      'El sistema comprueba kilometraje, importes, adjuntos obligatorios y estados antes de cerrar el registro.',
    duration: 7200,
    focus: 'dashboard',
    messages: [
      { author: 'Sistema', text: 'Km fin mayor que km inicio.' },
      { author: 'Sistema', text: 'Combustible informado con ticket adjunto.' },
      { author: 'GlorIA', text: 'Parte listo para que el patron lo confirme.' },
    ],
    stats: [
      { label: 'Validaciones OK', value: '4' },
      { label: 'Incidencias', value: '0', tone: 'green' },
      { label: 'Estado', value: 'Listo' },
    ],
    checklist: ['Km coherentes', 'Tickets presentes', 'Calculo preparado'],
  },
  {
    chip: 'Gastos',
    eyebrow: '03. Economia ordenada',
    title: 'Ingresos, gastos',
    accent: 'y combustible conectados',
    description:
      'Cada movimiento queda asociado al conductor, vehiculo y periodo para evitar hojas dispersas y descuadres.',
    duration: 7200,
    focus: 'dashboard',
    messages: [
      { author: 'Sistema', text: 'Combustible: 42,00 euros asociado al vehiculo T-04.' },
      { author: 'Sistema', text: 'Datafono: 86,00 euros registrado en el turno.' },
      { author: 'GlorIA', text: 'El resumen del dia ya refleja bruto, neto y ajustes.' },
    ],
    stats: [
      { label: 'Bruto diario', value: '1.284' },
      { label: 'Gastos dia', value: '312' },
      { label: 'Neto estimado', value: '972', tone: 'green' },
    ],
    checklist: ['Gastos diarios', 'Importes conciliados', 'Resumen operativo'],
  },
  {
    chip: 'Alertas',
    eyebrow: '04. Mantenimiento y avisos',
    title: 'Lo repetitivo',
    accent: 'se convierte en aviso',
    description:
      'ITV, revisiones, seguros, averias y documentos pendientes aparecen antes de que el problema llegue tarde.',
    duration: 7200,
    focus: 'split',
    messages: [
      { author: 'GlorIA', text: 'T-02 tiene ITV en 12 dias y revision de aceite pendiente.' },
      { author: 'Sistema', text: 'Alerta creada. Prioridad media.' },
      { author: 'GlorIA', text: 'Puedo preparar el recordatorio para el patron y el conductor.' },
    ],
    stats: [
      { label: 'Alertas activas', value: '4', tone: 'red' },
      { label: 'Mantenimientos', value: '3' },
      { label: 'Pendientes criticos', value: '0', tone: 'green' },
    ],
    checklist: ['ITV y seguros', 'Averias', 'Recordatorios', 'Trazabilidad'],
  },
  {
    chip: 'Control final',
    eyebrow: '05. De un vistazo',
    title: 'El patron ve',
    accent: 'el negocio claro',
    description:
      'El dashboard resume estado general, alertas, metricas principales y actividad reciente para decidir rapido.',
    duration: 8200,
    focus: 'dashboard',
    messages: [
      { author: 'Sistema', text: '6 partes recibidos. 5 validados. 1 pendiente de confirmacion.' },
      { author: 'GlorIA', text: 'Resumen listo: actividad, gastos, mantenimiento y alertas.' },
      { author: 'Sistema', text: 'Reporte mensual preparado para revision.' },
    ],
    stats: [
      { label: 'Partes recibidos', value: '6/6', tone: 'green' },
      { label: 'Ingresos mes', value: '24,8k' },
      { label: 'Reporte', value: 'Listo', tone: 'green' },
    ],
    checklist: ['Estado general', 'Metricas clave', 'Actividad reciente', 'Reporte mensual'],
  },
];

const sceneIcons = [Gauge, MessageCircle, CheckCircle2, ReceiptText, Wrench, BarChart3];

function toneClass(tone?: 'yellow' | 'green' | 'red') {
  if (tone === 'green') return 'text-emerald-300';
  if (tone === 'red') return 'text-red-300';
  return 'text-pilotos-yellow';
}

function PhoneDemo({ scene, sceneIndex }: { scene: DemoScene; sceneIndex: number }) {
  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <div className="absolute -inset-8 rounded-full bg-pilotos-yellow/10 blur-3xl" />
      <div
        className={`relative rounded-[2rem] border border-white/12 bg-[#020304] p-2 shadow-2xl shadow-black/70 transition ${
          scene.focus === 'dashboard' ? 'opacity-55 blur-[1px]' : 'opacity-100'
        }`}
      >
        <div className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#0B141A]">
          <div className="flex items-center gap-3 border-b border-white/10 bg-[#18242C] px-4 pb-3 pt-7">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-pilotos-yellow text-sm font-black text-pilotos-black">
              G
            </div>
            <div>
              <p className="text-sm font-bold text-white">GlorIA - PilotOS</p>
              <p className="text-xs font-semibold text-emerald-300">en linea</p>
            </div>
          </div>

          <div className="flex min-h-[360px] flex-col justify-end gap-3 bg-[linear-gradient(180deg,#0B141A,#081016)] p-4">
            {scene.messages.map((message, index) => (
              <div
                key={`${sceneIndex}-${message.text}`}
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-5 opacity-0 shadow-lg animate-[demoMessage_520ms_cubic-bezier(.16,1,.3,1)_forwards] ${
                  message.author === 'Conductor'
                    ? 'self-end rounded-br-md bg-[#075E54] text-white'
                    : message.author === 'Sistema'
                      ? 'self-center rounded-lg border border-pilotos-yellow/20 bg-pilotos-yellow/10 text-pilotos-yellow'
                      : 'self-start rounded-bl-md bg-[#202C33] text-zinc-100'
                }`}
                style={{ animationDelay: `${360 + index * 780}ms` }}
              >
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">
                  {message.author}
                </span>
                {message.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardDemo({ scene, sceneIndex }: { scene: DemoScene; sceneIndex: number }) {
  const Icon = sceneIcons[sceneIndex] ?? Gauge;

  return (
    <div
      className={`relative rounded-lg border border-pilotos-yellow/20 bg-[#090B10] p-4 shadow-2xl shadow-black/60 transition ${
        scene.focus === 'phone' ? 'opacity-55 blur-[1px]' : 'opacity-100'
      }`}
    >
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-pilotos-yellow text-pilotos-black">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pilotos-yellow">
              Panel operativo
            </p>
            <h3 className="text-lg font-black text-white">Flota - Hoy</h3>
          </div>
        </div>
        <span className="hidden items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300 sm:inline-flex">
          <ShieldCheck className="h-4 w-4" />
          Monitorizando
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {scene.stats.map((stat, index) => (
          <div
            key={`${sceneIndex}-${stat.label}`}
            className="translate-y-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 opacity-0 animate-[demoRise_620ms_cubic-bezier(.16,1,.3,1)_forwards]"
            style={{ animationDelay: `${220 + index * 160}ms` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{stat.label}</p>
            <p className={`mt-3 text-2xl font-black ${toneClass(stat.tone)}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Checklist del flujo</h4>
            <Clock3 className="h-4 w-4 text-pilotos-yellow" />
          </div>
          <div className="space-y-3">
            {scene.checklist.map((item, index) => (
              <div
                key={`${sceneIndex}-${item}`}
                className="flex items-center gap-3 opacity-0 animate-[demoRise_520ms_cubic-bezier(.16,1,.3,1)_forwards]"
                style={{ animationDelay: `${520 + index * 180}ms` }}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-pilotos-yellow" />
                <span className="text-sm text-zinc-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Estado operativo</h4>
            <AlertTriangle className="h-4 w-4 text-pilotos-yellow" />
          </div>
          {['Partes', 'Gastos', 'Mantenimientos', 'Reportes'].map((item, index) => (
            <div key={item} className="py-2">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-300">{item}</span>
                <span className="font-bold text-white">{88 - index * 8}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-pilotos-yellow transition-all duration-700"
                  style={{ width: `${88 - index * 8}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PilotOSDemo() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);
  const scene = scenes[current];

  useEffect(() => {
    if (!playing) return;

    const start = Date.now();
    const interval = window.setInterval(() => {
      const progress = Math.min(100, ((Date.now() - start) / scene.duration) * 100);
      setTick(progress);
    }, 80);

    const timer = window.setTimeout(() => {
      setCurrent((value) => (value + 1) % scenes.length);
      setTick(0);
    }, scene.duration);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [current, playing, scene.duration]);

  const totalProgress = useMemo(
    () => ((current + tick / 100) / scenes.length) * 100,
    [current, tick],
  );

  function goTo(index: number) {
    setCurrent(index);
    setTick(0);
    setPlaying(true);
  }

  function replay() {
    setCurrent(0);
    setTick(0);
    setPlaying(true);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-pilotos-black text-white">
      <style>{`
        @keyframes demoMessage {
          from { opacity: 0; transform: translateY(14px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes demoRise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-white/10">
        <div className="h-full bg-pilotos-yellow transition-[width] duration-100" style={{ width: `${totalProgress}%` }} />
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
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-white transition hover:border-pilotos-yellow/40"
              aria-label={playing ? 'Pausar demo' : 'Reproducir demo'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={replay}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-white transition hover:border-pilotos-yellow/40"
              aria-label="Repetir demo"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <Link
              href="/onboarding"
              className="hidden min-h-10 items-center justify-center gap-2 rounded-lg bg-pilotos-yellow px-4 text-sm font-black text-pilotos-black transition hover:bg-[#ffc533] sm:inline-flex"
            >
              Solicitar demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-10">
          <div className="max-w-xl">
            <p className="mb-4 inline-flex items-center rounded-full border border-pilotos-yellow/30 bg-pilotos-yellow/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-pilotos-yellow">
              {scene.chip}
            </p>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-zinc-500">{scene.eyebrow}</p>
            <h1 key={`title-${current}`} className="mt-4 text-5xl font-black leading-[0.95] tracking-normal text-white opacity-0 animate-[demoRise_620ms_cubic-bezier(.16,1,.3,1)_forwards] sm:text-6xl">
              {scene.title}
              <span className="block text-pilotos-yellow">{scene.accent}</span>
            </h1>
            <p key={`desc-${current}`} className="mt-6 max-w-lg text-base leading-7 text-zinc-300 opacity-0 animate-[demoRise_620ms_cubic-bezier(.16,1,.3,1)_forwards] [animation-delay:180ms]">
              {scene.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {scenes.map((item, index) => (
                <button
                  key={item.eyebrow}
                  type="button"
                  onClick={() => goTo(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    index === current ? 'w-12 bg-pilotos-yellow' : 'w-2.5 bg-white/25 hover:bg-white/45'
                  }`}
                  aria-label={`Ir a escena ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => goTo((current + 1) % scenes.length)}
            className="grid cursor-pointer gap-5 text-left lg:grid-cols-[0.82fr_1.18fr] lg:items-center"
            aria-label="Avanzar demo"
          >
            <PhoneDemo key={`phone-${current}`} scene={scene} sceneIndex={current} />
            <DashboardDemo key={`dashboard-${current}`} scene={scene} sceneIndex={current} />
          </button>
        </div>

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
