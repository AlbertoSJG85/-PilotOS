'use client';

/**
 * Acceso a PilotOS según NexOS Pay (Pay ADR-0019 y ADR-0020, DT-040).
 *
 * - Los últimos 5 días de prueba, si no ha contratado, se ve un aviso con la
 *   cuenta atrás en toda la app (panel y vista del conductor).
 * - Terminada la prueba sin contratar, Pay corta el acceso: se puede entrar,
 *   pero todo está bloqueado y solo queda «Reactivar PilotOS».
 *
 * PilotOS no enseña precios ni pide la tarjeta: «Activar» lleva a la página de
 * NexOS Pay, que calcula el precio con lo que el patrón tenga dado de alta en
 * ese momento (tarifa + asalariados + vehículos).
 *
 * Si Pay no responde no se enseña nada ni se bloquea a nadie.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Hourglass, Loader2, Lock, BadgeCheck, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { clearSession } from '@/lib/auth';
import { contratarSuscripcion, getEstadoAcceso, type EstadoAcceso } from '@/lib/api';

const CONFIRMANDO = new Set(['pendiente_metodo_pago', 'preparada']);

const fechaHora = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : null;

interface Ctx {
  acceso: EstadoAcceso | null;
  vuelta: boolean;
  trabajando: boolean;
  error: string | null;
  contratar: () => void;
}

const AccesoCtx = createContext<Ctx | null>(null);

/** Hook común: abre la página «Contratar» de NexOS Pay. */
function useContratar() {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contratar = useCallback(async () => {
    setError(null);
    setTrabajando(true);
    try {
      const r = await contratarSuscripcion();
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setError(r.message || 'Ahora mismo no se puede activar. Inténtalo en unos minutos.');
    } catch {
      setError('Ahora mismo no se puede activar. Inténtalo en unos minutos.');
    }
    setTrabajando(false);
  }, []);
  return { trabajando, error, contratar };
}

export function AccesoPilotOS({ children }: { children: React.ReactNode }) {
  const [acceso, setAcceso] = useState<EstadoAcceso | null>(null);
  const [vuelta, setVuelta] = useState(false);
  const { trabajando, error, contratar } = useContratar();
  const intentos = useRef(0);
  const enCurso = useRef(false);

  // Una sola consulta a la vez: al cortarse el acceso, cada petición de la
  // página responde 402 y avisa; basta con preguntar una vez.
  const cargar = useCallback(() => {
    if (enCurso.current) return;
    enCurso.current = true;
    getEstadoAcceso()
      .then((r) => setAcceso(r.data ?? null))
      .catch(() => {})
      .finally(() => { enCurso.current = false; });
  }, []);

  useEffect(() => {
    setVuelta(new URLSearchParams(window.location.search).get('contratacion') === 'vuelta');
    cargar();
    // Pay corta mientras la app está abierta (402) o el usuario vuelve a la pestaña.
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    window.addEventListener('pilotos:acceso-cortado', cargar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('pilotos:acceso-cortado', cargar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  // Al volver de Pay la tarjeta tarda unos segundos en confirmarse: se
  // pregunta de nuevo cada 3 s (máx. 10 veces) mientras siga bloqueado.
  useEffect(() => {
    if (!vuelta || !acceso?.bloqueado || intentos.current >= 10) return;
    const t = setTimeout(() => { intentos.current += 1; cargar(); }, 3000);
    return () => clearTimeout(t);
  }, [vuelta, acceso, cargar]);

  if (acceso?.disponible && acceso.bloqueado) {
    return <PantallaReactivar acceso={acceso} vuelta={vuelta} trabajando={trabajando} error={error} contratar={contratar} />;
  }

  return (
    <AccesoCtx.Provider value={{ acceso, vuelta, trabajando, error, contratar }}>
      {children}
    </AccesoCtx.Provider>
  );
}

/** Estado de acceso cargado por `AccesoPilotOS` (null si Pay no responde o fuera de la puerta). */
export function useAccesoPilotOS(): EstadoAcceso | null {
  return useContext(AccesoCtx)?.acceso ?? null;
}

/**
 * Qué decirle al patrón sobre el cobro al dar de alta o de baja un asalariado
 * o un vehículo adicional (decisión de Alberto, 2026-11-25): se cobra lo que
 * haya el día del cobro; los días hasta entonces no se cobran. Sin importes:
 * los precios son de Pay.
 */
export function notaFacturacion(acceso: EstadoAcceso | null, cambio: 'alta' | 'baja'): string | null {
  if (!acceso?.disponible || !acceso.cobraExtras || !acceso.esPatron) return null;
  if (cambio === 'baja') return acceso.enPrueba ? null : 'Deja de cobrarse a partir de tu próxima factura.';
  return acceso.enPrueba
    ? 'Mientras dure tu prueba gratuita no se cobra; se sumará a tu cuota cuando empieces a pagar.'
    : 'Su suplemento irá en tu próxima factura. Los días hasta entonces no se cobran.';
}

/** Aviso de los últimos días de prueba. Se coloca arriba del contenido de cada vista. */
export function AvisoPrueba({ className }: { className?: string }) {
  const ctx = useContext(AccesoCtx);
  const [cerradoExito, setCerradoExito] = useState(false);
  if (!ctx?.acceso?.disponible) return null;
  const { acceso, vuelta, trabajando, error, contratar } = ctx;

  // Vuelta de Pay con la tarjeta ya puesta: confirmación breve.
  if (vuelta && acceso.contratada && acceso.esPatron && !cerradoExito) {
    return (
      <div role="status" className={cn('flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4', className)}>
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">Todo listo</p>
          <p className="mt-0.5 text-sm text-zinc-400">Tu plan de PilotOS está activado. Las facturas te llegarán por correo.</p>
        </div>
        <button onClick={() => setCerradoExito(true)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Cerrar aviso">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!acceso.cuentaAtras || !acceso.diasRestantes) return null;

  const dias = acceso.diasRestantes;
  const ultimo = dias <= 1;
  const urgente = dias <= 2;
  const titulo = ultimo ? 'Último día de prueba gratuita' : `Te quedan ${dias} días de prueba gratuita`;
  const confirmando = acceso.estadoContratacion && CONFIRMANDO.has(acceso.estadoContratacion);
  const faltaTarjeta = acceso.estadoContratacion === 'pendiente_metodo_pago';

  const texto = acceso.esPatron
    ? faltaTarjeta
      ? 'Ya aceptaste el plan: solo falta tu tarjeta para seguir sin cortes.'
      : `Si quieres seguir disfrutando de PilotOS, actívalo antes del ${fechaHora(acceso.pruebaFinAt)}. No se cobra nada hasta que termine la prueba.`
    : 'Tu patrón tiene que activar PilotOS para que podáis seguir usándolo.';

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center',
        urgente ? 'border-red-500/40 bg-red-500/10' : 'border-pilot-lime/40 bg-pilot-lime/10',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', urgente ? 'bg-red-500/15' : 'bg-pilot-lime/15')}>
          <Hourglass className={cn('h-5 w-5', urgente ? 'text-red-300' : 'text-pilot-lime')} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{titulo}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{texto}</p>
          {error && <p className="mt-1 text-xs text-red-300" role="alert">{error}</p>}
        </div>
      </div>
      {acceso.esPatron && !(vuelta && confirmando && !faltaTarjeta) && (
        <Button className="w-full shrink-0 sm:w-auto" disabled={trabajando} onClick={contratar}>
          {trabajando ? 'Abriendo…' : faltaTarjeta ? 'Añadir tarjeta' : 'Activar PilotOS'}
        </Button>
      )}
    </div>
  );
}

function PantallaReactivar({
  acceso, vuelta, trabajando, error, contratar,
}: { acceso: EstadoAcceso; vuelta: boolean; trabajando: boolean; error: string | null; contratar: () => void }) {
  const finPrueba = acceso.motivo === 'trial_ended_contract_required';
  const confirmando = vuelta && acceso.estadoContratacion && CONFIRMANDO.has(acceso.estadoContratacion);
  const faltaTarjeta = acceso.estadoContratacion === 'pendiente_metodo_pago';

  let titulo: string;
  let texto: string;
  let accion: string | null = null;
  if (!acceso.esPatron) {
    titulo = 'PilotOS está en pausa';
    texto = 'Tu patrón tiene que reactivar PilotOS para que puedas seguir usándolo. Tus datos están guardados.';
  } else if (confirmando) {
    titulo = 'Estamos confirmando tu tarjeta';
    texto = 'Tarda unos segundos. En cuanto esté, PilotOS se abre solo.';
  } else if (finPrueba) {
    titulo = 'Tu prueba gratuita ha terminado';
    texto = faltaTarjeta
      ? 'Ya aceptaste el plan: añade tu tarjeta para volver a usar PilotOS. Tus datos están guardados.'
      : 'Tus partes, vehículos y conductores están guardados. Para volver a usar PilotOS, reactívalo: verás el precio exacto antes de aceptar.';
    accion = faltaTarjeta ? 'Añadir tarjeta' : 'Reactivar PilotOS';
  } else {
    titulo = 'El acceso a PilotOS está suspendido';
    texto = 'Tus datos están guardados. Escríbenos y lo resolvemos contigo.';
  }

  async function salir() {
    await clearSession();
    window.location.href = '/login';
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Image src="/branding/pilotos/logo-compact.png" alt="PilotOS" width={130} height={34} className="mx-auto h-8 w-auto object-contain" priority />
        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pilot-lime/15">
            {confirmando
              ? <Loader2 className="h-6 w-6 animate-spin text-pilot-lime motion-reduce:animate-none" aria-hidden />
              : <Lock className="h-6 w-6 text-pilot-lime" aria-hidden />}
          </div>
          <h1 className="mt-5 text-xl font-semibold text-zinc-100">{titulo}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{texto}</p>
          {accion && (
            <Button size="lg" className="mt-6 w-full" disabled={trabajando} onClick={contratar}>
              {trabajando ? 'Abriendo…' : accion}
            </Button>
          )}
          {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
        </div>
        <button onClick={salir} className="mt-6 text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
