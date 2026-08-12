'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getPartes, getMe } from '@/lib/api';
import { getSessionUser, clearSession } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, LogOut, CheckCircle, Clock, AlertCircle, AlertTriangle, LayoutDashboard, ArrowRight } from 'lucide-react';
import type { ParteDiario, Vehiculo } from '@/types';
import { ResumenMesConductor } from '@/components/features/resumen-mes-conductor';

/** Primer día del mes en curso, en YYYY-MM-DD (filtro del listado de partes). */
function primerDiaDelMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Fecha local en formato YYYY-MM-DD, sin conversión UTC */
function localDateString(date?: string | Date): string {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function EstadoIcon({ estado }: { estado: string }) {
  if (estado === 'ENVIADO')              return <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (estado === 'PENDIENTE_VALIDACION') return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
  if (estado === 'FOTO_SUSTITUIDA')      return <Clock className="h-4 w-4 text-amber-400 shrink-0" />;
  return <AlertCircle className="h-4 w-4 text-zinc-600 shrink-0" />;
}

export default function ConductorHome() {
  const user = getSessionUser();
  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const conductorId = user?.conductor_id;
    Promise.all([
      // Se piden los partes del mes en curso, no los 7 últimos: el mini-panel
      // necesita el mes entero para sus medias, y la lista de abajo se recorta
      // en pantalla.
      getPartes({ conductor_id: conductorId || undefined, desde: primerDiaDelMes() })
        .then((r) => setPartes(r.data || []))
        .catch(() => {}),
      getMe()
        .then((r) => {
          if (r.vehiculos && r.vehiculos.length > 0) {
            setVehiculo(r.vehiculos[0] as Vehiculo);
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [user?.conductor_id]);

  function handleLogout() {
    clearSession();
    window.location.href = '/login';
  }

  const esPatron = !!user?.es_patron;
  // Partes propios retenidos: tienen diferencias y NO cuentan todavía. El
  // asalariado tiene que verlo aquí, no enterarse cuando le cuadren la nómina.
  const retenidos = partes.filter((p) => p.estado === 'PENDIENTE_VALIDACION');

  const today = localDateString();
  const parteHoy = partes.find((p) => {
    const fecha = typeof p.fecha_trabajada === 'string'
      ? p.fecha_trabajada.slice(0, 10)
      : localDateString(p.fecha_trabajada);
    return fecha === today;
  });

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto">

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-safe-top pb-4 border-b border-zinc-800">
        <Image
          src="/branding/pilotos/logo-compact.png"
          alt="PilotOS"
          width={140}
          height={36}
          className="h-9 w-auto object-contain"
          priority
        />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-200 truncate max-w-[120px]">{user?.nombre || 'Conductor'}</p>
            <p className="text-[10px] text-zinc-500">Conductor</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-5 py-6 space-y-5">

        {/* Vehículo */}
        {loading ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4 animate-pulse">
            <div className="h-3 w-20 bg-zinc-800 rounded mb-3" />
            <div className="h-7 w-32 bg-zinc-800 rounded mb-2" />
            <div className="h-4 w-40 bg-zinc-800 rounded" />
          </div>
        ) : vehiculo ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Tu vehículo</p>
            <p className="text-xl font-bold text-zinc-100 tracking-wider font-mono">{vehiculo.matricula}</p>
            <p className="text-sm text-zinc-400">{vehiculo.marca} {vehiculo.modelo}</p>
            <p className="text-xs text-zinc-600 mt-1">{vehiculo.km_actuales?.toLocaleString('es-ES')} km</p>
          </div>
        ) : null}

        {/* Lo que lleva este mes — solo para el asalariado: el dueño tiene
            el panel de gestión entero. */}
        {!esPatron && <ResumenMesConductor partes={partes} loading={loading} />}

        {/* Acción principal del DUEÑO: su trabajo es controlar el negocio.
            Registrar un parte lo hará solo si además conduce, así que baja a
            secundaria (2026-08-12, decisión de Alberto). El asalariado ve lo
            contrario: para él lo primero es el parte. */}
        {!loading && esPatron && (
          <div className="space-y-3">
            <Link
              href="/admin"
              className="block w-full rounded-2xl bg-pilot-lime hover:bg-pilot-lime-dim active:scale-[0.98] transition-all py-8 text-center shadow-lg shadow-pilot-lime/20"
            >
              <LayoutDashboard className="h-8 w-8 mx-auto mb-2 text-zinc-950" />
              <span className="text-2xl font-black text-zinc-950 tracking-tight">PANEL DE GESTIÓN</span>
              <p className="text-xs text-zinc-950/60 mt-1 font-medium">Ingresos, flota, alertas e informes</p>
            </Link>

            {!parteHoy && (
              <Link
                href="/conductor/parte/nuevo"
                className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 active:bg-zinc-800 transition-colors"
              >
                <FileText className="h-5 w-5 text-pilot-lime shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-200">Nuevo parte</p>
                  <p className="text-xs text-zinc-500">Si hoy has trabajado tú</p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 text-zinc-600" />
              </Link>
            )}
          </div>
        )}

        {/* Partes retenidos: diferencias pendientes de que el dueño decida */}
        {!loading && retenidos.length > 0 && (
          <div className="rounded-2xl border border-amber-800/50 bg-amber-950/30 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-300">
                  {retenidos.length === 1
                    ? 'Un parte tuyo tiene diferencias'
                    : `${retenidos.length} partes tuyos tienen diferencias`}
                </p>
                {/* Solo QUE pasa algo, nunca QUÉ: el detalle es del dueño. */}
                <p className="text-xs text-amber-200/80 mt-1">
                  Hay datos que no cuadran con la documentación aportada.{' '}
                  {retenidos.length === 1 ? 'Ese parte' : 'Esos partes'}{' '}
                  <strong>todavía no cuenta{retenidos.length === 1 ? '' : 'n'}</strong>: está pendiente de que el
                  dueño lo revise.
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {retenidos.map((p) => (
                <Link
                  key={p.id}
                  href={`/conductor/parte/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-amber-900/50 bg-black/30 px-4 py-3 active:bg-zinc-800 transition-colors"
                >
                  <span className="text-sm font-medium text-zinc-200">{formatDate(p.fecha_trabajada)}</span>
                  <span className="flex items-center gap-2 text-xs text-amber-300">
                    Ver el parte <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Botón principal del asalariado */}
        {!loading && !esPatron && (
          parteHoy ? (
            <div className="space-y-3">
              {/* En verde solo si el parte está limpio. Si quedó retenido, el
                  aviso ámbar de arriba ya lo cuenta y aquí no se celebra nada. */}
              {parteHoy.estado === 'PENDIENTE_VALIDACION' ? (
                <div className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-5 text-center">
                  <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-zinc-200">Parte de hoy enviado, con diferencias</p>
                  <p className="text-base font-bold text-zinc-100 mt-1">
                    {formatCurrency(Number(parteHoy.ingreso_bruto))}
                  </p>
                  <p className="text-xs text-amber-300/80 mt-1">Pendiente de que el dueño lo revise</p>
                </div>
              ) : (
                <div className="w-full rounded-2xl bg-emerald-950/60 border border-emerald-800/50 p-5 text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-emerald-300">Parte de hoy enviado</p>
                  <p className="text-base font-bold text-emerald-400 mt-1">
                    {formatCurrency(Number(parteHoy.ingreso_bruto))}
                  </p>
                </div>
              )}
              <Link
                href={`/conductor/parte/${parteHoy.id}`}
                className="block w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-4 text-center text-sm font-medium text-zinc-300 active:bg-zinc-800 transition-colors"
              >
                Ver detalle del parte de hoy →
              </Link>
            </div>
          ) : (
            <Link
              href="/conductor/parte/nuevo"
              className="block w-full rounded-2xl bg-pilot-lime hover:bg-pilot-lime-dim active:scale-[0.98] transition-all py-8 text-center shadow-lg shadow-pilot-lime/20"
            >
              <FileText className="h-8 w-8 mx-auto mb-2 text-zinc-950" />
              <span className="text-2xl font-black text-zinc-950 tracking-tight">NUEVO PARTE</span>
              <p className="text-xs text-zinc-950/60 mt-1 font-medium">Registrar jornada de hoy</p>
            </Link>
          )
        )}

        {/* Loader */}
        {loading && (
          <div className="rounded-2xl bg-zinc-800/40 animate-pulse h-32" />
        )}

        {/* Últimos partes */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
            Últimos partes
          </p>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[60px] rounded-xl bg-zinc-800/40 animate-pulse" />
              ))}
            </div>
          ) : partes.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 py-10 text-center">
              <p className="text-sm text-zinc-500">Sin partes registrados todavía.</p>
              <p className="text-xs text-zinc-600 mt-1">Empieza registrando tu primera jornada.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {partes.slice(0, 7).map((p) => (
                <Link
                  key={p.id}
                  href={`/conductor/parte/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 active:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <EstadoIcon estado={p.estado} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {formatDate(p.fecha_trabajada)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {p.km_fin && p.km_inicio
                          ? `${(p.km_fin - p.km_inicio).toLocaleString('es-ES')} km`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-zinc-100 shrink-0 ml-3">
                    {formatCurrency(Number(p.ingreso_bruto))}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* El acceso al panel de gestión ya no vive aquí abajo: para el dueño
            es la acción principal y está arriba del todo. */}

      </main>

      <div className="h-safe-bottom" />
    </div>
  );
}
