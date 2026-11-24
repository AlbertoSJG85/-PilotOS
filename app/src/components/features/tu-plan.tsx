'use client';

/**
 * Tu plan de PilotOS (Pay ADR-0019).
 *
 * PilotOS no enseña precios ni pide la tarjeta: el botón lleva a la página
 * «Contratar» de NexOS Pay, que enseña el precio real (tarifa + asalariados +
 * vehículos), pide los datos de facturación y registra la tarjeta. Al volver,
 * aquí solo se lee el estado.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, CreditCard, Clock, Loader2 } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { getEstadoSuscripcion, contratarSuscripcion, type EstadoSuscripcion } from '@/lib/api';

const fecha = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : null;

export function TuPlan() {
  const vuelta = useSearchParams().get('contratacion') === 'vuelta';
  const [estado, setEstado] = useState<EstadoSuscripcion | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    getEstadoSuscripcion().then((r) => setEstado(r.data ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
    // Al volver de Pay la tarjeta puede tardar unos segundos en confirmarse.
    if (!vuelta) return;
    const t = setTimeout(cargar, 4000);
    return () => clearTimeout(t);
  }, [cargar, vuelta]);

  async function contratar() {
    setError(null);
    setTrabajando(true);
    try {
      const r = await contratarSuscripcion();
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setError(r.message || 'Ahora mismo no se puede contratar. Inténtalo en unos minutos.');
    } catch {
      setError('Ahora mismo no se puede contratar. Inténtalo en unos minutos.');
    } finally {
      setTrabajando(false);
    }
  }

  // Sin Pay en este entorno no se enseña nada: no se promete lo que no se puede cumplir.
  if (!estado?.disponible) return null;

  const e = estado.estado;
  const tarjeta = estado.tarjeta?.ultimos4 ? `${estado.tarjeta.marca ?? 'Tarjeta'} ···· ${estado.tarjeta.ultimos4}` : 'Tarjeta registrada';
  let icono = <CreditCard className="h-5 w-5 text-pilot-lime" />;
  let titulo = 'Activa tu plan de PilotOS';
  let texto = estado.pruebaFinAt && e === 'prueba'
    ? `Tu prueba gratuita termina el ${fecha(estado.pruebaFinAt)}. Añade tu tarjeta para seguir sin cortes: no se cobra nada hasta ese día.`
    : 'Contrata para seguir usando PilotOS. Verás el precio exacto antes de aceptar.';
  let accion: string | null = 'Contratar';

  if (vuelta && e === 'pendiente_metodo_pago') {
    icono = <Loader2 className="h-5 w-5 animate-spin text-pilot-lime motion-reduce:animate-none" />;
    titulo = 'Estamos confirmando tu tarjeta';
    texto = 'Tarda unos segundos. Si no se actualiza, recarga la página.';
    accion = null;
  } else if (e === 'pendiente_metodo_pago') {
    titulo = 'Te falta añadir la tarjeta';
    texto = 'Ya aceptaste el plan. Termina de registrar tu tarjeta para activarlo.';
    accion = 'Añadir tarjeta';
  } else if (e === 'preparada') {
    icono = <Clock className="h-5 w-5 text-emerald-400" />;
    titulo = 'Todo listo';
    texto = `${tarjeta}. El primer cobro será el ${fecha(estado.pruebaFinAt) ?? 'día que termine tu prueba'}.`;
    accion = null;
  } else if (e === 'activa') {
    icono = <BadgeCheck className="h-5 w-5 text-emerald-400" />;
    titulo = 'Plan activo';
    texto = `${tarjeta}. Las facturas te llegan por correo cada mes.`;
    accion = null;
  }

  return (
    <Card className="mb-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800">{icono}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100">{titulo}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{texto}</p>
          </div>
        </div>
        {accion && (
          <div className="shrink-0">
            <Button size="sm" disabled={trabajando} onClick={contratar}>
              {trabajando ? 'Abriendo…' : accion}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-300" role="alert">{error}</p>}
    </Card>
  );
}
