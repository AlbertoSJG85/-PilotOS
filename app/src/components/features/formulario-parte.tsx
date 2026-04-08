'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, CardTitle } from '@/components/ui';
import { crearParte, uploadFoto, vincularFoto } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';
import { Camera, ChevronLeft, ChevronRight, Check, AlertTriangle, Loader2 } from 'lucide-react';
import type { Vehiculo } from '@/types';

const STEPS = ['Vehículo', 'Kilometraje', 'Ingresos', 'Tickets', 'Confirmar'];

interface Props {
  vehiculos: Vehiculo[];
  /** Ruta a la que redirigir tras enviar el parte. Por defecto /partes */
  returnPath?: string;
}

interface FormData {
  vehiculo_id: string;
  fecha_trabajada: string;
  km_inicio: number | '';
  km_fin: number | '';
  ingreso_bruto: number | '';
  ingreso_datafono: number | '';
  combustible: number | '';
  varios: number | '';
  concepto_varios: string;
}

/** Fecha de hoy en local (no UTC) para el campo date */
function localTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type UploadStep = '' | 'parte' | 'taxi' | 'gasoil';

const uploadLabel: Record<UploadStep, string> = {
  '': 'Enviando...',
  parte: 'Guardando parte...',
  taxi: 'Subiendo ticket taxímetro...',
  gasoil: 'Subiendo ticket combustible...',
};

export function FormularioParte({ vehiculos, returnPath = '/partes' }: Props) {
  const router = useRouter();
  const user = getSessionUser();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>('');
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const initialVehiculo = vehiculos.length === 1 ? vehiculos[0] : null;

  const [form, setForm] = useState<FormData>({
    vehiculo_id: initialVehiculo?.id ?? '',
    fecha_trabajada: localTodayString(),
    km_inicio: initialVehiculo?.km_actuales ?? '',
    km_fin: '',
    ingreso_bruto: '',
    ingreso_datafono: '',
    combustible: '',
    varios: '',
    concepto_varios: '',
  });

  const [ticketTaxi, setTicketTaxi] = useState<File | null>(null);
  const [ticketGasoil, setTicketGasoil] = useState<File | null>(null);
  const [previewTaxi, setPreviewTaxi] = useState<string | null>(null);
  const [previewGasoil, setPreviewGasoil] = useState<string | null>(null);
  const taxiInputRef = useRef<HTMLInputElement>(null);
  const gasoilInputRef = useRef<HTMLInputElement>(null);

  // Cuando el usuario cambia de vehículo, pre-rellenar km_inicio si no lo ha tocado
  const [kmEdited, setKmEdited] = useState(false);
  useEffect(() => {
    if (!kmEdited && form.vehiculo_id) {
      const v = vehiculos.find((v) => v.id === form.vehiculo_id);
      if (v) setForm((prev) => ({ ...prev, km_inicio: v.km_actuales }));
    }
  }, [form.vehiculo_id, kmEdited, vehiculos]);

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFileChange(type: 'taxi' | 'gasoil', file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'taxi') { setTicketTaxi(file); setPreviewTaxi(url); }
    else { setTicketGasoil(file); setPreviewGasoil(url); }
  }

  function getStepErrors(): string[] {
    const errs: string[] = [];
    if (step === 0) {
      if (!form.vehiculo_id) errs.push('Selecciona un vehículo');
      if (!form.fecha_trabajada) errs.push('La fecha es obligatoria');
    }
    if (step === 1) {
      if (form.km_inicio === '') errs.push('Km de inicio obligatorio');
      if (form.km_fin === '') errs.push('Km de fin obligatorio');
      if (form.km_inicio !== '' && form.km_fin !== '' && Number(form.km_fin) <= Number(form.km_inicio)) {
        errs.push('Km fin debe ser mayor que km inicio');
      }
    }
    if (step === 2) {
      if (form.ingreso_bruto === '') errs.push('Ingreso bruto obligatorio');
      if (form.ingreso_datafono === '') errs.push('Ingreso datáfono obligatorio');
      if (form.ingreso_bruto !== '' && form.ingreso_datafono !== '' &&
          Number(form.ingreso_bruto) < Number(form.ingreso_datafono)) {
        errs.push('El ingreso bruto debe ser ≥ al datáfono');
      }
      if (Number(form.varios) > 0 && !form.concepto_varios.trim()) {
        errs.push('Describe el concepto de "Varios"');
      }
    }
    if (step === 3) {
      if (!ticketTaxi) errs.push('El ticket del taxímetro es obligatorio');
      if (Number(form.combustible) > 0 && !ticketGasoil) {
        errs.push('El ticket de combustible es obligatorio cuando hay repostaje');
      }
    }
    return errs;
  }

  const stepErrors = getStepErrors();
  const canAdvance = stepErrors.length === 0;

  function handleNext() {
    if (!canAdvance) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep((s) => s + 1);
  }

  function prev() {
    setShowErrors(false);
    setStep((s) => s - 1);
  }

  function handleBack() {
    if (step > 0) { prev(); return; }
    // En step 0 → volver a la app conductor (no router.back() para evitar salir de la PWA)
    router.push(returnPath);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canAdvance || submitting) return;
    setSubmitting(true);
    setError('');

    try {
      // 1. Crear parte
      setUploadStep('parte');
      const res = await crearParte({
        vehiculo_id: form.vehiculo_id,
        conductor_id: user?.conductor_id || '',
        fecha_trabajada: form.fecha_trabajada,
        km_inicio: Number(form.km_inicio),
        km_fin: Number(form.km_fin),
        ingreso_bruto: Number(form.ingreso_bruto),
        ingreso_datafono: Number(form.ingreso_datafono),
        combustible: form.combustible !== '' ? Number(form.combustible) : undefined,
        varios: form.varios !== '' ? Number(form.varios) : undefined,
        concepto_varios: form.concepto_varios || undefined,
      });

      const parteId = res.data?.id;
      if (!parteId) throw new Error('No se obtuvo ID del parte');

      // 2. Subir ticket taxímetro
      if (ticketTaxi) {
        setUploadStep('taxi');
        const uploaded = await uploadFoto(ticketTaxi);
        await vincularFoto({ parte_diario_id: parteId, tipo: 'TICKET_TAXIMETRO', url: uploaded.url });
      }

      // 3. Subir ticket combustible si aplica
      if (ticketGasoil && Number(form.combustible) > 0) {
        setUploadStep('gasoil');
        const uploaded = await uploadFoto(ticketGasoil);
        await vincularFoto({ parte_diario_id: parteId, tipo: 'TICKET_GASOIL', url: uploaded.url });
      }

      router.push(returnPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al enviar el parte. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
      setUploadStep('');
    }
  }

  const selectedVehiculo = vehiculos.find((v) => v.id === form.vehiculo_id);

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg pb-10">

      {/* Barra de progreso */}
      <div className="mb-6 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 flex-col items-center">
            <div className={`h-1.5 w-full rounded-full transition-colors ${i <= step ? 'bg-amber-500' : 'bg-zinc-800'}`} />
            <span className={`mt-1 text-[10px] ${i === step ? 'text-amber-500 font-semibold' : 'text-zinc-600'}`}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* ── Step 0: Vehículo y Fecha ─────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardTitle>Vehículo y Fecha</CardTitle>
          <div className="mt-4 space-y-4">
            {vehiculos.length > 1 ? (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-300">Vehículo</label>
                <select
                  value={form.vehiculo_id}
                  onChange={(e) => update('vehiculo_id', e.target.value)}
                  className="flex h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Seleccionar vehículo...</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.matricula} — {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              selectedVehiculo && (
                <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Vehículo asignado</p>
                  <p className="font-bold text-zinc-100">{selectedVehiculo.matricula}</p>
                  <p className="text-sm text-zinc-400">{selectedVehiculo.marca} {selectedVehiculo.modelo}</p>
                </div>
              )
            )}
            <Input
              label="Fecha trabajada"
              type="date"
              value={form.fecha_trabajada}
              max={localTodayString()}
              onChange={(e) => update('fecha_trabajada', e.target.value)}
              required
            />
          </div>
        </Card>
      )}

      {/* ── Step 1: Kilometraje ──────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardTitle>Kilometraje</CardTitle>
          <div className="mt-4 space-y-4">
            <Input
              label="Km al inicio del turno"
              type="number"
              inputMode="numeric"
              value={form.km_inicio}
              onChange={(e) => {
                setKmEdited(true);
                update('km_inicio', e.target.value ? Number(e.target.value) : '');
              }}
              required
            />
            <Input
              label="Km al fin del turno"
              type="number"
              inputMode="numeric"
              value={form.km_fin}
              onChange={(e) => update('km_fin', e.target.value ? Number(e.target.value) : '')}
              required
            />
            {form.km_inicio !== '' && form.km_fin !== '' && Number(form.km_fin) > Number(form.km_inicio) && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                <p className="text-xs text-zinc-400 mb-1">Km recorridos hoy</p>
                <p className="text-3xl font-black text-amber-400">
                  {(Number(form.km_fin) - Number(form.km_inicio)).toLocaleString('es-ES')}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Step 2: Ingresos ─────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardTitle>Ingresos del turno</CardTitle>
          <div className="mt-4 space-y-4">
            <Input
              label="Total recaudado (€)"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={form.ingreso_bruto}
              onChange={(e) => update('ingreso_bruto', e.target.value ? Number(e.target.value) : '')}
              required
            />
            <Input
              label="De eso, por datáfono (€)"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={form.ingreso_datafono}
              onChange={(e) => update('ingreso_datafono', e.target.value ? Number(e.target.value) : '')}
              required
            />
            {form.ingreso_bruto !== '' && form.ingreso_datafono !== '' && (
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 flex justify-between text-sm">
                <span className="text-zinc-400">Efectivo en mano</span>
                <span className="font-bold text-zinc-100">
                  {(Number(form.ingreso_bruto) - Number(form.ingreso_datafono)).toFixed(2)} €
                </span>
              </div>
            )}

            <div className="border-t border-zinc-800/60 pt-4 space-y-4">
              <Input
                label="Combustible gastado (€) — deja en 0 si no repostaste"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={form.combustible}
                onChange={(e) => update('combustible', e.target.value ? Number(e.target.value) : '')}
              />
              <Input
                label="Otros gastos del turno (€) — opcional"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={form.varios}
                onChange={(e) => update('varios', e.target.value ? Number(e.target.value) : '')}
              />
              {Number(form.varios) > 0 && (
                <Input
                  label="Concepto — ¿en qué se gastó?"
                  value={form.concepto_varios}
                  onChange={(e) => update('concepto_varios', e.target.value)}
                  placeholder="Ej: Lavado, parking, herramienta..."
                  required
                />
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 3: Tickets / Fotos ──────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardTitle>Tickets del turno</CardTitle>
          <div className="mt-4 space-y-6">

            {/* Ticket taxímetro — obligatorio */}
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-300">
                Ticket taxímetro <span className="text-red-400">*</span>
              </p>
              {/* Sin capture="environment" para que iOS permita elegir cámara o galería */}
              <input
                ref={taxiInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange('taxi', e.target.files?.[0] || null)}
              />
              {previewTaxi ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={previewTaxi} alt="Ticket taxímetro" className="h-44 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => taxiInputRef.current?.click()}
                    className="absolute right-2 top-2 flex items-center gap-1.5 rounded-xl bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" /> Cambiar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => taxiInputRef.current?.click()}
                  className="flex h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-amber-500/70 hover:text-amber-500 active:bg-zinc-800 transition-colors"
                >
                  <Camera className="h-8 w-8" />
                  <div className="text-center">
                    <p className="text-sm font-semibold">Foto del ticket</p>
                    <p className="text-xs mt-0.5 text-zinc-600">Cámara o galería</p>
                  </div>
                </button>
              )}
            </div>

            {/* Ticket combustible — solo si repostó */}
            {Number(form.combustible) > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">
                  Ticket combustible <span className="text-red-400">*</span>
                </p>
                <input
                  ref={gasoilInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange('gasoil', e.target.files?.[0] || null)}
                />
                {previewGasoil ? (
                  <div className="relative rounded-xl overflow-hidden">
                    <img src={previewGasoil} alt="Ticket combustible" className="h-44 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => gasoilInputRef.current?.click()}
                      className="absolute right-2 top-2 flex items-center gap-1.5 rounded-xl bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Camera className="h-3.5 w-3.5" /> Cambiar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => gasoilInputRef.current?.click()}
                    className="flex h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-blue-500/70 hover:text-blue-400 active:bg-zinc-800 transition-colors"
                  >
                    <Camera className="h-8 w-8" />
                    <div className="text-center">
                      <p className="text-sm font-semibold">Foto del ticket de gasoil</p>
                      <p className="text-xs mt-0.5 text-zinc-600">Cámara o galería</p>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Step 4: Confirmar ─────────────────────────────────────────── */}
      {step === 4 && (
        <Card>
          <CardTitle>Confirmar y enviar</CardTitle>
          <div className="mt-4 space-y-1 text-sm">
            <ConfirmRow
              label="Vehículo"
              value={selectedVehiculo ? `${selectedVehiculo.matricula}` : '-'}
            />
            <ConfirmRow label="Fecha" value={form.fecha_trabajada} />
            <ConfirmRow
              label="Kilómetros"
              value={`${Number(form.km_inicio).toLocaleString('es-ES')} → ${Number(form.km_fin).toLocaleString('es-ES')}`}
            />
            <ConfirmRow
              label="Recorrido"
              value={`${(Number(form.km_fin) - Number(form.km_inicio)).toLocaleString('es-ES')} km`}
            />
            <ConfirmRow label="Total recaudado" value={`${Number(form.ingreso_bruto).toFixed(2)} €`} />
            <ConfirmRow label="Datáfono" value={`${Number(form.ingreso_datafono).toFixed(2)} €`} />
            <ConfirmRow
              label="Efectivo"
              value={`${(Number(form.ingreso_bruto) - Number(form.ingreso_datafono)).toFixed(2)} €`}
            />
            {Number(form.combustible) > 0 && (
              <ConfirmRow label="Combustible" value={`${Number(form.combustible).toFixed(2)} €`} />
            )}
            {Number(form.varios) > 0 && (
              <ConfirmRow
                label={`Varios (${form.concepto_varios})`}
                value={`${Number(form.varios).toFixed(2)} €`}
              />
            )}
            <ConfirmRow
              label="Ticket taxímetro"
              value={ticketTaxi ? '✓ Adjunto' : '✗ Falta'}
              highlight={!ticketTaxi}
            />
            {Number(form.combustible) > 0 && (
              <ConfirmRow
                label="Ticket combustible"
                value={ticketGasoil ? '✓ Adjunto' : '✗ Falta'}
                highlight={!ticketGasoil}
              />
            )}
          </div>
          <p className="mt-4 text-xs text-zinc-600 text-center">
            Una vez enviado el parte no podrá modificarse.
          </p>
        </Card>
      )}

      {/* Errores de validación */}
      {(showErrors || step === 4) && stepErrors.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-950/60 border border-red-900/50 p-4 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-1">
            {stepErrors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Error de envío */}
      {error && (
        <div className="mt-3 rounded-xl bg-red-950/60 border border-red-900/50 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Navegación */}
      <div className="mt-6 flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
          className="h-14 px-5 border-zinc-800 text-zinc-400"
          disabled={submitting}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={handleNext}
            className="flex-1 h-14 text-base font-bold"
          >
            Siguiente <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={submitting}
            className="flex-1 h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-500"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {uploadLabel[uploadStep]}
              </>
            ) : (
              <><Check className="h-5 w-5 mr-2" /> Enviar Parte</>
            )}
          </Button>
        )}
      </div>
    </form>
  );
}

function ConfirmRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-zinc-800/60 py-2">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-red-400' : 'text-zinc-100'}`}>{value}</span>
    </div>
  );
}
