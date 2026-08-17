import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';

export const metadata: Metadata = {
  title: 'PilotOS | Gestion inteligente para flotas',
  description:
    'PilotOS centraliza partes diarios, ingresos, gastos, mantenimientos, alertas y reportes para gestionar flotas con control operativo de un vistazo.',
};

const painPoints = [
  'WhatsApps sueltos',
  'Partes manuales',
  'Hojas desordenadas',
  'Falta de control diario',
  'Errores en gastos, ingresos y mantenimientos',
];

const solutionPoints = [
  'Centraliza la informacion operativa, economica y documental',
  'Automatiza registros y reduce tareas repetitivas',
  'Controla ingresos, gastos, partes y mantenimientos',
  'Muestra el estado diario de la flota de forma clara',
];

const features = [
  {
    title: 'Control diario',
    text: 'Partes, kilometraje, actividad y validaciones en una vista operativa consistente.',
    icon: CalendarCheck,
  },
  {
    title: 'Conductores / asalariados',
    text: 'Roles claros para patron, conductor y administracion NexOS sin mezclar permisos.',
    icon: UsersRound,
  },
  {
    title: 'Ingresos y gastos',
    text: 'Registro ordenado de combustible, tickets, varios y movimientos economicos.',
    icon: ReceiptText,
  },
  {
    title: 'Mantenimientos',
    text: 'Seguimiento de revisiones, averias, ITV, seguros y obligaciones recurrentes.',
    icon: Wrench,
  },
  {
    title: 'Alertas automaticas',
    text: 'Avisos para vencimientos, incidencias, documentos pendientes y tareas criticas.',
    icon: AlertTriangle,
  },
  {
    title: 'Reportes mensuales',
    text: 'Resumenes preparados para entender resultados, costes y actividad del periodo.',
    icon: FileText,
  },
  {
    title: 'WhatsApp operativo',
    text: 'Entrada natural de informacion mediante GlorIA como identidad visible del sistema.',
    icon: MessageCircle,
  },
  {
    title: 'Dashboard de control',
    text: 'Metricas, alertas y actividad reciente para tomar decisiones sin perder tiempo.',
    icon: BarChart3,
  },
];

const dashboardStats = [
  { label: 'Estado general', value: '87%', detail: 'Flota operativa' },
  { label: 'Alertas activas', value: '4', detail: '2 requieren revision' },
  { label: 'Ingresos mes', value: '24,8k', detail: 'Estimacion consolidada' },
  { label: 'Actividad reciente', value: '18', detail: 'Registros validados' },
];

/** Las cuatro capacidades que el hero enseña sobre la fotografia. */
const heroCards = [
  { label: 'Partes diarios', icon: CalendarCheck },
  { label: 'Gastos', icon: ReceiptText },
  { label: 'Alertas', icon: AlertTriangle },
  { label: 'Reportes', icon: FileText },
];

/** Retardo de aparicion, para escalonar tarjetas dentro de una misma rejilla. */
function delay(ms: number): CSSProperties {
  return { '--reveal-delay': `${ms}ms` } as CSSProperties;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-pilotos-yellow/30 bg-pilotos-yellow/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-pilotos-yellow">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

function CtaLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const classes =
    variant === 'primary'
      ? 'bg-pilotos-yellow text-pilotos-black shadow-[0_10px_34px_-10px_rgba(255,183,3,0.65)] hover:bg-[#ffc533] hover:shadow-[0_16px_44px_-10px_rgba(255,183,3,0.8)]'
      : 'border border-white/[0.16] bg-white/[0.06] text-white backdrop-blur hover:border-pilotos-yellow/40 hover:bg-pilotos-yellow/10';

  return (
    <Link
      href={href}
      className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold transition duration-200 hover:-translate-y-0.5 ${classes}`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Filete luminoso que cose una seccion con la siguiente. */
function Costura() {
  return (
    <div
      aria-hidden
      className="pointer-events-none mx-auto h-px w-full max-w-7xl bg-[linear-gradient(90deg,transparent,rgba(255,183,3,0.28),transparent)]"
    />
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-pilotos-black text-white">
      <ScrollReveal />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-pilotos-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
          <Image
            src="/branding/pilotos/logo-full.png"
            alt="PilotOS"
            width={190}
            height={56}
            className="h-10 w-auto object-contain sm:h-12"
            priority
          />
          <Link
            href="/login"
            className="rounded-lg border border-white/[0.14] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-pilotos-yellow/40 hover:text-white"
          >
            Acceder
          </Link>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────
          Cabina real de fondo, entrando desde la derecha, con el
          texto sobre negro a la izquierda. */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden px-5 pb-16 pt-28 sm:px-8 sm:pt-32 lg:px-12">
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="/img/hero-cabina.webp"
            alt="Interior de un vehiculo en marcha de noche, con el volante y el cuadro digital iluminados"
            fill
            priority
            sizes="100vw"
            className="hero-foto object-cover object-[68%_center]"
          />
        </div>

        {/* Degradados: el texto siempre cae sobre negro solido. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,#05070B_0%,rgba(5,7,11,0.97)_28%,rgba(5,7,11,0.72)_52%,rgba(5,7,11,0.42)_78%,rgba(5,7,11,0.78)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,11,0.9)_0%,rgba(5,7,11,0.25)_35%,rgba(5,7,11,0.6)_72%,#05070B_100%)]"
        />
        {/* Iluminacion amarilla muy contenida. */}
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute -left-32 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.16),transparent_66%)] blur-2xl"
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <div className="max-w-4xl">
            <p
              className="hero-entra mb-5 text-sm font-semibold uppercase tracking-[0.28em] text-pilotos-yellow"
              style={{ animationDelay: '0.75s' }}
            >
              PilotOS by NexOS
            </p>
            <h1
              className="hero-entra max-w-3xl text-5xl font-black leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl"
              style={{ animationDelay: '0.9s' }}
            >
              Gestion inteligente para flotas
            </h1>
            <p
              className="hero-entra mt-6 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl"
              style={{ animationDelay: '1.05s' }}
            >
              Centraliza la operacion diaria, reduce errores manuales y convierte partes,
              gastos, mantenimientos y alertas en una vision de negocio clara.
            </p>
            <div
              className="hero-entra mt-8 flex flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '1.2s' }}
            >
              <CtaLink href="/demo">Solicitar demo</CtaLink>
              <CtaLink href="/demo" variant="secondary">
                Ver como funciona
              </CtaLink>
            </div>
          </div>

          <div className="mt-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {heroCards.map(({ label, icon: Icon }, i) => (
              <div
                key={label}
                className="hero-tarjeta rounded-xl border border-white/[0.12] bg-[#0B0D12]/80 p-4 shadow-[0_18px_44px_-18px_rgba(0,0,0,0.9)] backdrop-blur-md transition duration-200 hover:-translate-y-1 hover:border-pilotos-yellow/30"
                style={{ animationDelay: `${1.35 + i * 0.1}s` }}
              >
                <Icon className="mb-3 h-5 w-5 text-pilotos-yellow" />
                <p className="text-sm font-semibold text-zinc-100">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Costura />

      {/* ── EL PROBLEMA ────────────────────────────────────── */}
      <section className="relative px-5 py-24 sm:px-8 lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-10 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.07),transparent_70%)] blur-2xl"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div data-reveal>
            <SectionLabel>El problema</SectionLabel>
            <h2 className="max-w-2xl text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              Muchas flotas siguen funcionando con informacion dispersa.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">
              Cuando cada dato vive en un canal distinto, el control diario se vuelve lento,
              los errores se multiplican y el negocio pierde visibilidad justo cuando mas la
              necesita.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {painPoints.map((point, i) => (
              <div
                key={point}
                data-reveal
                style={delay(i * 70)}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-white/[0.08] bg-[#0B0D12] p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,1)] transition duration-200 hover:-translate-y-1 hover:border-white/[0.16]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold leading-6 text-zinc-200">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Costura />

      {/* ── LA SOLUCION ────────────────────────────────────── */}
      <section id="como-funciona" className="relative px-5 py-24 sm:px-8 lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 top-1/4 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.09),transparent_68%)] blur-2xl"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div
            data-reveal
            className="relative overflow-hidden rounded-2xl border border-pilotos-yellow/20 bg-pilotos-panel shadow-[0_50px_120px_-40px_rgba(0,0,0,1)]"
          >
            <Image
              src="/branding/pilotos/dashboard-mockup.png"
              alt="Dashboard operativo de PilotOS"
              width={1800}
              height={1100}
              sizes="(max-width: 1024px) 100vw, 52vw"
              className="h-auto w-full object-cover"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06]"
            />
          </div>

          <div data-reveal style={delay(90)}>
            <SectionLabel>La solucion</SectionLabel>
            <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              Un sistema operativo para controlar la flota sin perseguir datos.
            </h2>
            <p className="mt-5 text-base leading-7 text-zinc-400">
              PilotOS ordena la actividad diaria y la transforma en control operativo,
              trazabilidad y decisiones mas rapidas dentro del ecosistema NexOS.
            </p>
            <div className="mt-8 grid gap-4">
              {solutionPoints.map((point) => (
                <div
                  key={point}
                  className="flex gap-3 rounded-lg border border-transparent p-2 transition hover:border-white/[0.08] hover:bg-white/[0.02]"
                >
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-pilotos-yellow" />
                  <p className="text-sm leading-6 text-zinc-200">{point}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Costura />

      {/* ── FUNCIONALIDADES ────────────────────────────────── */}
      <section className="relative px-5 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl" data-reveal>
            <SectionLabel>Funcionalidades</SectionLabel>
            <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              Todo lo importante de la operacion, conectado en una misma capa.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ title, text, icon: Icon }, i) => (
              <article
                key={title}
                data-reveal
                style={delay((i % 4) * 70 + Math.floor(i / 4) * 60)}
                className="group relative min-h-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0D12] p-5 shadow-[0_24px_60px_-36px_rgba(0,0,0,1)] transition duration-200 hover:-translate-y-1.5 hover:border-pilotos-yellow/30"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.14),transparent_70%)] opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100"
                />
                <div className="relative mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-pilotos-yellow text-pilotos-black shadow-[0_8px_24px_-8px_rgba(255,183,3,0.7)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="relative text-base font-bold text-white">{title}</h3>
                <p className="relative mt-3 text-sm leading-6 text-zinc-400">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Costura />

      {/* ── GLORIA ─────────────────────────────────────────── */}
      <section className="relative px-5 py-24 sm:px-8 lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.07),transparent_66%)] blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div data-reveal>
            <SectionLabel>GlorIA / IA</SectionLabel>
            <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              La capa conversacional que convierte mensajes en operacion.
            </h2>
            <p className="mt-5 text-base leading-7 text-zinc-400">
              PilotOS puede apoyarse en GlorIA para recibir informacion, consultar datos y
              activar automatizaciones. Hacia el cliente, GlorIA sigue siendo la identidad
              visible; PilotOS aporta el contexto operativo de flotas.
            </p>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-3">
            {/* Hilo que une los tres pasos. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-12 hidden h-px bg-[linear-gradient(90deg,transparent,rgba(255,183,3,0.35),transparent)] sm:block"
            />
            {[
              { title: 'Recibe', text: 'Partes, tickets y avisos desde el canal operativo.', icon: MessageCircle },
              { title: 'Interpreta', text: 'Clasifica informacion y detecta tareas pendientes.', icon: Bot },
              { title: 'Activa', text: 'Prepara registros, alertas y consultas recurrentes.', icon: Sparkles },
            ].map(({ title, text, icon: Icon }, i) => (
              <div
                key={title}
                data-reveal
                style={delay(i * 110)}
                className="relative rounded-xl border border-white/[0.1] bg-pilotos-panel p-5 shadow-[0_28px_70px_-40px_rgba(0,0,0,1)] transition duration-200 hover:-translate-y-1 hover:border-pilotos-yellow/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-pilotos-yellow/25 bg-pilotos-yellow/10">
                  <Icon className="h-5 w-5 text-pilotos-yellow" />
                </div>
                <h3 className="mt-5 text-base font-bold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Costura />

      {/* ── DE UN VISTAZO ──────────────────────────────────── */}
      <section className="relative px-5 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div data-reveal>
              <SectionLabel>De un vistazo</SectionLabel>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                Estado, alertas, metricas y actividad reciente sin ruido.
              </h2>
              <p className="mt-5 text-base leading-7 text-zinc-400">
                El dashboard operativo resume lo que necesita revisar un responsable de flota
                antes de decidir donde actuar.
              </p>
            </div>

            <div
              data-reveal
              className="rounded-2xl border border-pilotos-yellow/20 bg-[#090B10] p-5 shadow-[0_60px_140px_-50px_rgba(0,0,0,1)]"
            >
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pilotos-yellow">
                    Panel operativo
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white">Hoy en tu flota</h3>
                </div>
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  Control estable
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {dashboardStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 transition duration-200 hover:border-pilotos-yellow/25 hover:bg-white/[0.05]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      {stat.label}
                    </p>
                    <p className="mt-4 text-3xl font-black text-white">{stat.value}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{stat.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">Actividad reciente</h4>
                    <Clock3 className="h-4 w-4 text-pilotos-yellow" />
                  </div>
                  {['Parte validado T-04', 'Combustible registrado', 'ITV programada', 'Ticket pendiente de revision'].map(
                    (item) => (
                      <div key={item} className="flex items-center justify-between border-t border-white/10 py-3">
                        <span className="text-sm text-zinc-300">{item}</span>
                        <span className="h-2 w-2 rounded-full bg-pilotos-yellow shadow-[0_0_10px_rgba(255,183,3,0.8)]" />
                      </div>
                    ),
                  )}
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">Metricas principales</h4>
                    <Gauge className="h-4 w-4 text-pilotos-yellow" />
                  </div>
                  {['Ingresos', 'Combustible', 'Gastos', 'Mantenimiento'].map((item, index) => (
                    <div key={item} className="py-3">
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-zinc-300">{item}</span>
                        <span className="font-semibold text-white">{82 - index * 9}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="barra-metrica h-2 rounded-full bg-pilotos-yellow"
                          style={{ width: `${82 - index * 9}%`, ...delay(120 + index * 110) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Costura />

      {/* ── CIERRE ─────────────────────────────────────────── */}
      <section id="solicitar-demo" className="relative overflow-hidden px-5 py-28 sm:px-8 lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,183,3,0.11),transparent_64%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl text-center" data-reveal>
          <Image
            src="/branding/pilotos/logo-compact.png"
            alt="PilotOS"
            width={180}
            height={48}
            className="mx-auto h-12 w-auto object-contain"
          />
          <h2 className="mt-8 text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Convierte la gestion de tu flota en un sistema automatico, ordenado y controlado.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400">
            PilotOS deja preparado el trabajo diario para que el equipo opere con menos friccion
            y mas trazabilidad desde el primer dia.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <CtaLink href="/demo">Solicitar demo</CtaLink>
            <CtaLink href="/login" variant="secondary">
              Acceder a PilotOS
            </CtaLink>
          </div>
        </div>
      </section>
    </main>
  );
}
