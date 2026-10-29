'use client';

/**
 * Conductores de la flota (2026-10-29).
 *
 * Es el mismo alta que el onboarding, pero para después: el propietario puede
 * dar de alta a uno o a varios a la vez, cada uno con su email, su condición
 * económica y su vehículo; quitar a uno (corta el acceso al momento y conserva
 * su historial); sustituirlo; y volver a darle de alta si regresa.
 *
 * Quién es el usuario: el propietario del taxi, con el móvil, que contrata y
 * despide a poca gente. Acción principal: «Añadir conductores». Fricción que
 * resolvemos: antes esto no funcionaba, no pedía el email (sin él el conductor
 * no puede activar su cuenta) y no dejaba elegir el reparto ni el vehículo.
 */

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Plus, Trash2, UserMinus, RotateCcw, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { Card, Badge, Button, Input, Skeleton } from '@/components/ui';
import { getUsuarios, createConductor, updateConductor, assignVehiculoConductor } from '@/lib/api';
import type { ModeloReparto } from '@/lib/api';
import { ApiError } from '@/lib/api/fetcher';
import type { Conductor, Vehiculo } from '@/types';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Fila {
  clave: number;
  nombre: string;
  telefono: string;
  email: string;
  modelo: ModeloReparto;
  valor: string;
  vehiculo_id: string;
  error?: string;
  hecho?: boolean;
}

interface Edicion {
  conductor: Conductor;
  nombre: string;
  telefono: string;
  modelo: ModeloReparto;
  valor: string;
  cuotaSS: string;
  vehiculos: string[];
}

const SELECT_CLASES =
  'h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-pilot-lime focus:outline-none focus:ring-1 focus:ring-pilot-lime';

let contadorFilas = 0;

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message || porDefecto : porDefecto;
}

/** Texto de la condición económica vigente de un conductor. */
function textoReparto(c: Conductor): string | null {
  const cfg = c.configuracion;
  if (!cfg) return null;
  const n = Number(cfg.porcentaje_conductor);
  return cfg.modelo_reparto === 'FIJO_DIARIO' ? `${n} € al día` : `${n} % del reparto`;
}

/** Lo mismo que valida el servidor, para avisar antes de enviar nada. */
function validarFila(f: Fila): string | null {
  if (!f.nombre.trim()) return 'Falta el nombre.';
  if (!f.telefono.trim()) return 'Falta el teléfono.';
  if (!EMAIL_VALIDO.test(f.email.trim())) return 'Pon un email válido: ahí recibirá el código para activar su cuenta.';
  return validarValor(f.modelo, f.valor);
}

function validarValor(modelo: ModeloReparto, valor: string): string | null {
  const n = Number(valor);
  if (valor.trim() === '' || !Number.isFinite(n) || n < 0) return 'Indica cuánto cobra el conductor.';
  if (modelo === 'PORCENTAJE' && n > 100) return 'El porcentaje no puede pasar de 100.';
  if (modelo === 'FIJO_DIARIO' && n > 999.99) return 'El fijo diario no puede pasar de 999,99 €.';
  return null;
}

function CampoReparto({
  modelo, valor, onModelo, onValor,
}: { modelo: ModeloReparto; valor: string; onModelo: (m: ModeloReparto) => void; onValor: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800/60 bg-black/20 p-3">
      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Condición económica</label>
        <select className={SELECT_CLASES} value={modelo} onChange={(e) => onModelo(e.target.value as ModeloReparto)}>
          <option value="PORCENTAJE">Reparto (%)</option>
          <option value="FIJO_DIARIO">Fijo diario (€)</option>
        </select>
      </div>
      <Input
        label={modelo === 'PORCENTAJE' ? '% del conductor' : '€ al día'}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onValor(e.target.value)}
      />
    </div>
  );
}

export function ConductoresFlota({
  vehiculos,
  onCambio,
}: {
  vehiculos: Vehiculo[];
  /** Avisa a la página para que recargue lo suyo (los vehículos enseñan sus conductores). */
  onCambio: () => void;
}) {
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [panelAlta, setPanelAlta] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [errorPanel, setErrorPanel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [quitando, setQuitando] = useState<Conductor | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [verAntiguos, setVerAntiguos] = useState(false);

  const vehiculosActivos = vehiculos.filter((v) => v.activo);

  const cargar = useCallback(async () => {
    try {
      const r = await getUsuarios({ incluirInactivos: true });
      setConductores(r.data ?? []);
      setErrorCarga(null);
    } catch (err) {
      setErrorCarga(mensajeDe(err, 'No se pudieron cargar los conductores.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const activos = conductores.filter((c) => c.activo);
  const antiguos = conductores.filter((c) => !c.activo && !c.es_patron);

  // ── Alta de uno o varios ──────────────────────────────────────────────
  function filaNueva(parcial: Partial<Fila> = {}): Fila {
    contadorFilas += 1;
    return {
      clave: contadorFilas,
      nombre: '', telefono: '', email: '',
      modelo: 'PORCENTAJE', valor: '50',
      // Con un solo vehículo no hay nada que elegir: se asigna solo.
      vehiculo_id: vehiculosActivos.length === 1 ? vehiculosActivos[0].id : '',
      ...parcial,
    };
  }

  function abrirAlta(parcial?: Partial<Fila>) {
    setAviso(null);
    setErrorPanel(null);
    setFilas([filaNueva(parcial)]);
    setPanelAlta(true);
  }

  function cambiarFila(clave: number, cambios: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambios, error: undefined } : f)));
  }

  async function darDeAlta() {
    setErrorPanel(null);
    const pendientes = filas.filter((f) => !f.hecho);

    const conErrores = pendientes.map((f) => ({ ...f, error: validarFila(f) ?? undefined }));
    if (conErrores.some((f) => f.error)) {
      setFilas((fs) => fs.map((f) => conErrores.find((c) => c.clave === f.clave) ?? f));
      return;
    }

    setEnviando(true);
    let hechos = 0;
    let actuales = [...filas];
    for (const f of pendientes) {
      try {
        await createConductor({
          nombre: f.nombre.trim(),
          telefono: f.telefono.trim(),
          email: f.email.trim().toLowerCase(),
          modelo_reparto: f.modelo,
          porcentaje_conductor: Number(f.valor),
          ...(f.vehiculo_id ? { vehiculo_id: f.vehiculo_id } : {}),
        });
        hechos += 1;
        actuales = actuales.map((x) => (x.clave === f.clave ? { ...x, hecho: true, error: undefined } : x));
      } catch (err) {
        const sinPro = err instanceof ApiError && err.code === 'pro_required_for_employees';
        if (sinPro) {
          setErrorPanel(mensajeDe(err, 'Para añadir asalariados necesitas PilotOS Pro.'));
          break; // el resto fallaría por lo mismo
        }
        actuales = actuales.map((x) =>
          x.clave === f.clave ? { ...x, error: mensajeDe(err, 'No se pudo dar de alta.') } : x,
        );
      }
      setFilas(actuales);
    }
    setFilas(actuales);
    setEnviando(false);

    if (hechos > 0) {
      await cargar();
      onCambio();
    }
    if (actuales.every((x) => x.hecho)) {
      setPanelAlta(false);
      setAviso(
        hechos === 1
          ? 'Conductor dado de alta. Le hemos enviado un correo para que active su cuenta.'
          : `${hechos} conductores dados de alta. Cada uno recibirá un correo para activar su cuenta.`,
      );
    }
  }

  // ── Quitar / sustituir / reactivar ────────────────────────────────────
  async function quitar(c: Conductor, sustituir: boolean) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await updateConductor(c.id, { activo: false });
      const reparto = c.configuracion;
      const vehiculoHeredado = c.vehiculosAsignados?.[0]?.vehiculo.id;
      setQuitando(null);
      await cargar();
      onCambio();
      if (sustituir) {
        abrirAlta({
          ...(reparto ? { modelo: reparto.modelo_reparto as ModeloReparto, valor: String(Number(reparto.porcentaje_conductor)) } : {}),
          ...(vehiculoHeredado ? { vehiculo_id: vehiculoHeredado } : {}),
        });
        setAviso(`${c.usuario.nombre} ya no tiene acceso. Rellena los datos de quien le sustituye.`);
      } else {
        setAviso(`${c.usuario.nombre} ya no tiene acceso. Sus partes anteriores se conservan.`);
      }
    } catch (err) {
      setErrorAccion(mensajeDe(err, 'No se pudo quitar al conductor.'));
    } finally {
      setTrabajando(false);
    }
  }

  async function reactivar(c: Conductor) {
    setErrorAccion(null);
    setTrabajando(true);
    try {
      await updateConductor(c.id, { activo: true });
      setAviso(`${c.usuario.nombre} vuelve a tener acceso.`);
      await cargar();
      onCambio();
    } catch (err) {
      setErrorAccion(mensajeDe(err, 'No se pudo reactivar al conductor.'));
    } finally {
      setTrabajando(false);
    }
  }

  // ── Edición ───────────────────────────────────────────────────────────
  function abrirEdicion(c: Conductor) {
    setAviso(null);
    setErrorAccion(null);
    const cfg = c.configuracion;
    setEdicion({
      conductor: c,
      nombre: c.usuario.nombre ?? '',
      telefono: c.usuario.telefono ?? '',
      modelo: (cfg?.modelo_reparto as ModeloReparto) ?? 'PORCENTAJE',
      valor: cfg ? String(Number(cfg.porcentaje_conductor)) : '50',
      cuotaSS: c.cuota_ss_mensual != null ? String(Number(c.cuota_ss_mensual)) : '',
      vehiculos: (c.vehiculosAsignados ?? []).map((va) => va.vehiculo.id),
    });
  }

  async function guardarEdicion() {
    if (!edicion) return;
    const errValor = validarValor(edicion.modelo, edicion.valor);
    if (errValor) { setErrorAccion(errValor); return; }
    setErrorAccion(null);
    setTrabajando(true);
    const c = edicion.conductor;
    try {
      await updateConductor(c.id, {
        ...(c.cuenta_activada ? {} : { nombre: edicion.nombre.trim(), telefono: edicion.telefono.trim() }),
        modelo_reparto: edicion.modelo,
        porcentaje_conductor: Number(edicion.valor),
        cuota_ss_mensual: edicion.cuotaSS.trim() === '' ? null : Number(edicion.cuotaSS),
      });

      // Vehículos: la asignación es por coche y pisa la lista entera de ese coche,
      // así que se manda la lista COMPLETA de sus conductores con este añadido o quitado.
      const antes = new Set((c.vehiculosAsignados ?? []).map((va) => va.vehiculo.id));
      const despues = new Set(edicion.vehiculos);
      for (const v of vehiculosActivos) {
        if (antes.has(v.id) === despues.has(v.id)) continue;
        const ids = activos
          .filter((x) => x.id !== c.id && (x.vehiculosAsignados ?? []).some((va) => va.vehiculo.id === v.id))
          .map((x) => x.id);
        if (despues.has(v.id)) ids.push(c.id);
        await assignVehiculoConductor(v.id, ids);
      }

      setEdicion(null);
      setAviso('Cambios guardados.');
      await cargar();
      onCambio();
    } catch (err) {
      setErrorAccion(mensajeDe(err, 'No se pudieron guardar los cambios.'));
    } finally {
      setTrabajando(false);
    }
  }

  // ── Pintado ───────────────────────────────────────────────────────────
  function TarjetaConductor({ c }: { c: Conductor }) {
    const reparto = textoReparto(c);
    const pendiente = !c.es_patron && c.cuenta_activada === false;
    return (
      <Card className={`space-y-2 ${!c.activo ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-zinc-100">{c.usuario?.nombre}</p>
            <p className="text-sm text-zinc-500">{c.usuario?.telefono}</p>
            {c.usuario?.email && !c.usuario.email.endsWith('@pilotos.app') && (
              <p className="truncate text-xs text-zinc-600">{c.usuario.email}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={c.es_patron ? 'warning' : 'info'}>{c.es_patron ? 'Propietario' : 'Asalariado'}</Badge>
            {!c.activo && <Badge variant="danger">Sin acceso</Badge>}
            {pendiente && c.activo && <Badge variant="warning">Pendiente de activar</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
          {reparto && !c.es_patron && <span>{reparto}</span>}
          {(c.vehiculosAsignados?.length ?? 0) > 0 && (
            <span>Vehículo: {c.vehiculosAsignados?.map((va) => va.vehiculo.matricula).join(', ')}</span>
          )}
        </div>

        {!c.es_patron && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-white/5 pt-2">
            {c.activo ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => abrirEdicion(c)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setErrorAccion(null); setQuitando(c); }}>
                  <UserMinus className="h-3.5 w-3.5" /> Quitar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" disabled={trabajando} onClick={() => reactivar(c)}>
                <RotateCcw className="h-3.5 w-3.5" /> Volver a dar acceso
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Conductores</h2>
        <Button size="sm" onClick={() => abrirAlta()} disabled={panelAlta}>
          <UserPlus className="h-4 w-4" /> Añadir conductores
        </Button>
      </div>

      {aviso && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
        </p>
      )}

      {/* ── Alta de uno o varios ── */}
      {panelAlta && (
        <Card className="mb-4 space-y-4 border border-pilot-lime/30 p-4">
          <div>
            <h3 className="font-medium text-white">Dar de alta conductores</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Cada uno recibe un correo de bienvenida y activa su cuenta con un código que le llega a su email.
            </p>
          </div>

          {filas.map((f, i) => (
            <div
              key={f.clave}
              className={`space-y-3 rounded-lg border p-3 ${f.hecho ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-zinc-800 bg-zinc-900/60'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Conductor {i + 1}</span>
                {f.hecho ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Dado de alta</span>
                ) : (
                  filas.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Quitar al conductor ${i + 1} de la lista`}
                      className="text-zinc-500 hover:text-red-400"
                      onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )
                )}
              </div>

              {!f.hecho && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Nombre" placeholder="Nombre completo" value={f.nombre} onChange={(e) => cambiarFila(f.clave, { nombre: e.target.value })} />
                    <Input label="Teléfono" type="tel" placeholder="34600000000" autoComplete="off" value={f.telefono} onChange={(e) => cambiarFila(f.clave, { telefono: e.target.value })} />
                  </div>
                  <div>
                    <Input label="Email del conductor" type="email" placeholder="conductor@email.com" autoComplete="off" value={f.email} onChange={(e) => cambiarFila(f.clave, { email: e.target.value })} />
                    <p className="mt-1 text-[11px] text-zinc-500">Suyo de verdad: aquí recibe el código para activar su cuenta y para recuperar la contraseña.</p>
                  </div>
                  <CampoReparto
                    modelo={f.modelo}
                    valor={f.valor}
                    onModelo={(modelo) => cambiarFila(f.clave, { modelo, valor: modelo === 'PORCENTAJE' ? '50' : '' })}
                    onValor={(valor) => cambiarFila(f.clave, { valor })}
                  />
                  {vehiculosActivos.length > 1 && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-zinc-300">Vehículo</label>
                      <select className={SELECT_CLASES} value={f.vehiculo_id} onChange={(e) => cambiarFila(f.clave, { vehiculo_id: e.target.value })}>
                        <option value="">Sin asignar todavía</option>
                        {vehiculosActivos.map((v) => <option key={v.id} value={v.id}>{v.matricula}</option>)}
                      </select>
                    </div>
                  )}
                  {f.error && <p className="text-sm font-medium text-red-400">{f.error}</p>}
                </>
              )}
            </div>
          ))}

          {errorPanel && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorPanel}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={darDeAlta} disabled={enviando}>
              {enviando ? 'Dando de alta…' : (() => {
                const n = filas.filter((f) => !f.hecho).length;
                return n > 1 ? `Dar de alta a ${n} conductores` : 'Dar de alta';
              })()}
            </Button>
            <Button size="sm" variant="outline" disabled={enviando} onClick={() => setFilas((fs) => [...fs, filaNueva()])}>
              <Plus className="h-4 w-4" /> Añadir otro
            </Button>
            <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setPanelAlta(false)}>
              {filas.some((f) => f.hecho) ? 'Cerrar' : 'Cancelar'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Quitar ── */}
      {quitando && (
        <Card className="mb-4 space-y-3 border border-red-500/30 bg-red-950/10 p-4">
          <p className="font-medium text-zinc-100">¿Quitar a {quitando.usuario.nombre}?</p>
          <p className="text-sm text-zinc-400">
            Dejará de poder entrar ahora mismo. Sus partes anteriores se conservan y, si vuelve, podrás darle acceso otra vez.
          </p>
          {errorAccion && <p className="text-sm font-medium text-red-400">{errorAccion}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={trabajando} onClick={() => quitar(quitando, true)}>
              {trabajando ? 'Quitando…' : 'Quitar y añadir sustituto'}
            </Button>
            <Button size="sm" variant="outline" disabled={trabajando} onClick={() => quitar(quitando, false)}>
              Solo quitar
            </Button>
            <Button size="sm" variant="ghost" disabled={trabajando} onClick={() => setQuitando(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* ── Editar ── */}
      {edicion && (
        <Card className="mb-4 space-y-4 border border-pilot-lime/30 p-4">
          <h3 className="font-medium text-white">Editar a {edicion.conductor.usuario.nombre}</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre"
              value={edicion.nombre}
              disabled={edicion.conductor.cuenta_activada}
              onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
            />
            <Input
              label="Teléfono"
              type="tel"
              value={edicion.telefono}
              disabled={edicion.conductor.cuenta_activada}
              onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })}
            />
          </div>
          {edicion.conductor.cuenta_activada && (
            <p className="-mt-2 text-[11px] text-zinc-500">
              Ya activó su cuenta: su nombre y su teléfono son suyos y no se cambian desde aquí.
            </p>
          )}

          <CampoReparto
            modelo={edicion.modelo}
            valor={edicion.valor}
            onModelo={(modelo) => setEdicion({ ...edicion, modelo, valor: modelo === 'PORCENTAJE' ? '50' : '' })}
            onValor={(valor) => setEdicion({ ...edicion, valor })}
          />
          <p className="-mt-2 text-[11px] text-zinc-500">
            El cambio vale para los partes nuevos; los ya calculados conservan el reparto con el que se hicieron.
          </p>

          <Input
            label="Cuota mensual de la Seguridad Social (€) — opcional"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={edicion.cuotaSS}
            onChange={(e) => setEdicion({ ...edicion, cuotaSS: e.target.value })}
          />

          {vehiculosActivos.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium text-zinc-300">Vehículos con los que trabaja</legend>
              {vehiculosActivos.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={edicion.vehiculos.includes(v.id)}
                    onChange={(e) => setEdicion({
                      ...edicion,
                      vehiculos: e.target.checked ? [...edicion.vehiculos, v.id] : edicion.vehiculos.filter((id) => id !== v.id),
                    })}
                  />
                  {v.matricula} <span className="text-zinc-500">{v.marca} {v.modelo}</span>
                </label>
              ))}
            </fieldset>
          )}

          {errorAccion && <p className="text-sm font-medium text-red-400">{errorAccion}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={guardarEdicion} disabled={trabajando}>{trabajando ? 'Guardando…' : 'Guardar'}</Button>
            <Button size="sm" variant="ghost" disabled={trabajando} onClick={() => setEdicion(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* ── Lista ── */}
      {cargando ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : errorCarga ? (
        <Card className="border-red-500/20 bg-red-500/5 py-6 text-center">
          <p className="font-medium text-red-400">{errorCarga}</p>
          <Button variant="outline" className="mt-4" onClick={() => { setCargando(true); cargar(); }}>Reintentar</Button>
        </Card>
      ) : (
        <>
          {activos.filter((c) => !c.es_patron).length === 0 && !panelAlta && (
            <Card className="mb-3 py-8 text-center">
              <p className="text-sm text-zinc-300">Todavía no tienes conductores asalariados.</p>
              <p className="mt-1 text-xs text-zinc-500">Cuando contrates a alguien, añádelo aquí con su email y su condición económica.</p>
            </Card>
          )}
          <div className="space-y-3">
            {activos.map((c) => <TarjetaConductor key={c.id} c={c} />)}
          </div>

          {antiguos.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                className="text-sm text-zinc-400 hover:text-zinc-200"
                onClick={() => setVerAntiguos((v) => !v)}
                aria-expanded={verAntiguos}
              >
                {verAntiguos ? 'Ocultar' : 'Ver'} antiguos conductores ({antiguos.length})
              </button>
              {verAntiguos && (
                <div className="mt-3 space-y-3">
                  {errorAccion && !quitando && !edicion && <p className="text-sm font-medium text-red-400">{errorAccion}</p>}
                  {antiguos.map((c) => <TarjetaConductor key={c.id} c={c} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
