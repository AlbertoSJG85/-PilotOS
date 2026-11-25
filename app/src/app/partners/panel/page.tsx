'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button, Skeleton } from '@/components/ui';
import { partnersApi, ErrorPartners, type PanelPartner, type Tramo } from '@/lib/api/partners';

/**
 * Panel de la asociación (PilotOS Partners, DT-041). Solo números: ni nombres
 * de socios ni quién ha pagado. Todo sale de NexOS Pay a través de PilotOS.
 */

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function nombreMes(periodo: string, conAnio = true): string {
  const [a, m] = periodo.split('-').map(Number);
  const texto = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

function Dato({ titulo, valor, detalle, destacado }: { titulo: string; valor: string; detalle?: string; destacado?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{titulo}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${destacado ? 'text-pilotos-yellow' : 'text-zinc-100'}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-zinc-400">{detalle}</p>}
    </div>
  );
}

/** Barra de progreso hacia el siguiente tramo, con las marcas de cada escalón. */
function ProgresoTramos({ tramos, pagando }: { tramos: Tramo[]; pagando: number }) {
  const orden = [...tramos].sort((a, b) => a.desde - b.desde);
  const tope = Math.max(orden[orden.length - 1]?.desde ?? 1, pagando) * 1.1;
  const pos = (n: number) => `${Math.min(100, (n / tope) * 100)}%`;
  return (
    <div className="pt-6">
      <div className="relative h-3 rounded-full bg-zinc-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-pilotos-yellow transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: pos(pagando) }}
        />
        {orden.map((t) => (
          <div key={t.desde} className="absolute -top-6 -translate-x-1/2 text-center" style={{ left: pos(t.desde) }}>
            <span className={`text-xs font-semibold ${pagando >= t.desde ? 'text-pilotos-yellow' : 'text-zinc-500'}`}>{t.porcentaje} %</span>
            <div className={`mx-auto mt-1 h-5 w-0.5 ${pagando >= t.desde ? 'bg-zinc-950/60' : 'bg-zinc-600'}`} />
          </div>
        ))}
      </div>
      <div className="relative mt-2 h-4 text-[11px] text-zinc-500">
        {orden.map((t) => (
          <span key={t.desde} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pos(t.desde) }}>{t.desde}</span>
        ))}
      </div>
    </div>
  );
}

function CodigoParaCompartir({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  const enlace = typeof window !== 'undefined' ? `${window.location.origin}/onboarding?ref=${encodeURIComponent(codigo)}` : '';
  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles: el enlace sigue visible para copiarlo a mano */ }
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Date de alta en PilotOS con el código de la asociación: ${enlace}`)}`;
  return (
    <section className="rounded-2xl border border-dashed border-pilotos-yellow/40 bg-zinc-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Código para los socios</p>
      <p className="mt-1 text-2xl font-bold tracking-[0.12em] text-pilotos-yellow">{codigo}</p>
      <p className="mt-3 break-all rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">{enlace}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" className="w-full sm:flex-1" onClick={copiar} aria-live="polite">
          {copiado ? 'Enlace copiado' : 'Copiar enlace'}
        </Button>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="w-full sm:flex-1">
          <Button variant="outline" className="w-full">Enviar por WhatsApp</Button>
        </a>
      </div>
      <p className="mt-3 text-xs text-zinc-500">El enlace ya lleva el código puesto. Usarlo no cambia lo que paga el socio.</p>
    </section>
  );
}

function Historial({ filas }: { filas: PanelPartner['historial'] }) {
  const meses = [...filas].reverse(); // del más antiguo al actual
  const max = Math.max(1, ...meses.map((m) => m.clientes_pagando));
  const hayDatos = meses.some((m) => m.clientes_pagando > 0);
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold text-zinc-100">Socios que pagan, mes a mes</h2>
      {!hayDatos ? (
        <p className="mt-3 text-sm text-zinc-400">
          Aún no hay ningún mes con socios pagando. Los socios cuentan desde el primer mes que pagan; la prueba gratuita no cuenta.
        </p>
      ) : (
        <>
          <div className="mt-5 flex h-32 items-end gap-1.5" role="img" aria-label="Socios que pagan en los últimos 12 meses">
            {meses.map((m, i) => (
              <div key={m.periodo} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-zinc-400">{m.clientes_pagando || ''}</span>
                <div
                  className={`w-full rounded-t ${i === meses.length - 1 ? 'bg-pilotos-yellow' : 'bg-zinc-600'}`}
                  style={{ height: `${Math.max(2, (m.clientes_pagando / max) * 96)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {meses.map((m) => (
              <span key={m.periodo} className="flex-1 text-center text-[10px] text-zinc-500">{nombreMes(m.periodo, false).slice(0, 3)}</span>
            ))}
          </div>
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="py-2 font-medium">Mes</th>
                <th className="py-2 pl-3 text-right font-medium">Pagan</th>
                <th className="py-2 pl-3 text-right font-medium">Tramo</th>
                <th className="py-2 pl-3 text-right font-medium">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.filter((m) => m.clientes_pagando > 0).map((m) => (
                <tr key={m.periodo} className="border-b border-zinc-800/60 last:border-0">
                  <td className="py-2.5 text-zinc-200">
                    {nombreMes(m.periodo)}
                    <span className={`ml-2 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${m.liquidado ? 'bg-emerald-500/10 text-emerald-400' : m.periodo === filas[0].periodo ? 'bg-pilotos-yellow/10 text-pilotos-yellow' : 'bg-zinc-800 text-zinc-400'}`}>
                      {m.liquidado ? 'Liquidado' : m.periodo === filas[0].periodo ? 'En curso' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-zinc-200">{m.clientes_pagando}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-zinc-400">{m.porcentaje} %</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums font-medium text-zinc-100">{euros.format(m.comision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Liquidaciones({ lista }: { lista: PanelPartner['liquidaciones'] }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold text-zinc-100">Liquidaciones</h2>
      <p className="mt-1 text-xs text-zinc-500">Se liquida cada trimestre, con el tramo de cada mes.</p>
      {lista.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">Todavía no hay ninguna liquidación. La primera llegará al cerrar el trimestre en el que haya socios pagando.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-800">
          {lista.map((l) => (
            <li key={l.periodo} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-100">{l.trimestre ?? nombreMes(l.periodo)}</p>
                  {l.fecha && <p className="text-xs text-zinc-500">Liquidada el {fecha(l.fecha)}</p>}
                </div>
                <p className="text-lg font-bold tabular-nums text-pilotos-yellow">{euros.format(l.importe)}</p>
              </div>
              {l.meses.length > 0 && (
                <p className="mt-1 text-xs text-zinc-400">
                  {l.meses.map((m) => `${nombreMes(m.periodo, false)}: ${m.clientes_pagando} socios al ${m.porcentaje} %`).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function PanelPartnersPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<PanelPartner | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setError('');
    partnersApi.panel()
      .then(setDatos)
      .catch((err) => {
        if (err instanceof ErrorPartners && err.status === 401) { router.replace('/partners'); return; }
        setError(err instanceof ErrorPartners ? err.message : 'No se han podido cargar los datos.');
      });
  }, [router]);

  useEffect(() => { cargar(); }, [cargar]);

  async function salir() {
    await partnersApi.salir().catch(() => undefined);
    router.replace('/partners');
  }

  const mes = datos?.mes_actual;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/branding/pilotos/logo-compact.png" alt="PilotOS" width={120} height={32} className="h-8 w-auto shrink-0" />
            <span className="hidden rounded-full border border-pilotos-yellow/30 bg-pilotos-yellow/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-pilotos-yellow sm:inline">Partners</span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {datos && <p className="truncate text-sm text-zinc-300">{datos.cuenta.nombre}</p>}
            <Button variant="ghost" size="sm" onClick={salir}>Salir</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:py-8">
        {error && (
          <div role="alert" className="rounded-2xl border border-red-800/50 bg-red-950/30 p-5">
            <p className="text-sm text-red-300">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={cargar}>Reintentar</Button>
          </div>
        )}

        {!datos && !error && <Cargando />}

        {datos && mes && (
          <>
            {/* Lo primero que se busca: cuánto lleva la asociación este mes. */}
            <section className="rounded-2xl border border-zinc-800 border-t-pilotos-yellow border-t-2 bg-zinc-900 p-5 sm:p-6">
              <p className="text-sm text-zinc-400">{nombreMes(mes.periodo)} · mes en curso</p>
              <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-4xl font-bold tabular-nums text-pilotos-yellow sm:text-5xl">{euros.format(mes.comision_estimada)}</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    Comisión de este mes: {mes.clientes_pagando} {mes.clientes_pagando === 1 ? 'socio paga' : 'socios pagan'}
                    {mes.clientes_pagando > 0 && <> al {mes.porcentaje} %</>}
                  </p>
                </div>
                <p className="text-xs text-zinc-500 sm:text-right">Estimación: el tramo se fija al cerrar el mes.</p>
              </div>
              <ProgresoTramos tramos={datos.tramos} pagando={mes.clientes_pagando} />
              <p className="mt-3 text-sm text-zinc-300">
                {mes.siguiente_tramo
                  ? mes.clientes_pagando === 0
                    ? `Con el primer socio que pague, la asociación empieza en el ${mes.siguiente_tramo.porcentaje} %.`
                    : `Faltan ${mes.siguiente_tramo.faltan} ${mes.siguiente_tramo.faltan === 1 ? 'socio' : 'socios'} pagando para pasar al ${mes.siguiente_tramo.porcentaje} %.`
                  : 'La asociación está en el tramo más alto.'}
              </p>
            </section>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dato titulo="Socios dados de alta" valor={String(datos.socios.total)} detalle={datos.socios.este_mes > 0 ? `${datos.socios.este_mes} este mes` : 'Con el código de la asociación'} />
              <Dato titulo="Pagan este mes" valor={String(mes.clientes_pagando)} detalle="Los de prueba gratuita aún no cuentan" />
              <Dato titulo="Tramo actual" valor={`${mes.porcentaje || datos.tramos[0]?.porcentaje || 0} %`} detalle="Sobre la cuota sin impuestos" />
              <Dato titulo="Pendiente de liquidar" valor={euros.format(datos.pendiente_de_liquidar)} detalle="Se paga al cerrar el trimestre" destacado />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <div className="space-y-4">
                <Historial filas={datos.historial} />
                <Liquidaciones lista={datos.liquidaciones} />
              </div>
              <div className="space-y-4">
                <CodigoParaCompartir codigo={datos.cuenta.codigo} />
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="text-sm font-semibold text-zinc-100">Cómo se calcula</h2>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                    {[...datos.tramos].sort((a, b) => a.desde - b.desde).map((t, i, arr) => (
                      <li key={t.desde} className="flex justify-between gap-3">
                        <span>{arr[i + 1] ? `De ${t.desde} a ${arr[i + 1].desde - 1} socios pagando` : `Desde ${t.desde} socios pagando`}</span>
                        <span className="font-semibold tabular-nums text-zinc-200">{t.porcentaje} %</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-zinc-500">
                    El porcentaje se aplica a la cuota de todos los socios que pagan ese mes, sin impuestos. La prueba gratuita no cuenta.
                  </p>
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
