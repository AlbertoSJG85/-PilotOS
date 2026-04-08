'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, CardTitle, CardDescription } from '@/components/ui';
import { guardarOnboarding, completarOnboarding, getOnboarding } from '@/lib/api';
import { ChevronLeft, ChevronRight, Check, Loader2, Plus, Trash2, Wallet, Users, Fuel, Car } from 'lucide-react';

const STEPS = [
  'Datos del propietario',
  'Vehiculo',
  'Asalariados',
  'Gastos fijos',
  'Confirmacion',
] as const;

type Asalariado = {
  nombre: string;
  telefono: string;
  modelo_reparto: string;
  porcentaje_conductor: number;
};

type GastoFijo = {
  descripcion: string;
  importe: number;
  periodicidad: string;
  tipo: string;
};

type OnboardingData = {
  telefono: string;
  nombre_patron: string;
  email_patron: string;
  nif_cif: string;
  nombre_comercial: string;
  tipo_actividad: string;
  matricula: string;
  marca_modelo: string;
  km_actuales: string;
  tipo_combustible: string;
  tipo_transmision: string;
  asalariados: Asalariado[];
  gastos_fijos: GastoFijo[];
};

const INITIAL: OnboardingData = {
  telefono: '',
  nombre_patron: '',
  email_patron: '',
  nif_cif: '',
  nombre_comercial: '',
  tipo_actividad: 'TAXI',
  matricula: '',
  marca_modelo: '',
  km_actuales: '',
  tipo_combustible: 'DIESEL',
  tipo_transmision: 'AUTOMATICA',
  asalariados: [],
  gastos_fijos: [],
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');

  // Cargar borrador si existe el telefono en el state (podría ampliarse a persistencia en URL/Session)
  useEffect(() => {
    if (data.telefono.length >= 9 && step === 0) {
      // Podríamos intentar recuperar draft aquí si hiciera falta
    }
  }, [data.telefono, step]);

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  const addAsalariado = () => {
    set('asalariados', [
      ...data.asalariados,
      { nombre: '', telefono: '', modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50 }
    ]);
  };

  const removeAsalariado = (index: number) => {
    set('asalariados', data.asalariados.filter((_, i) => i !== index));
  };

  const updateAsalariado = (index: number, fields: Partial<Asalariado>) => {
    const newAsalariados = [...data.asalariados];
    newAsalariados[index] = { ...newAsalariados[index], ...fields };
    set('asalariados', newAsalariados);
  };

  const addGasto = () => {
    set('gastos_fijos', [
      ...data.gastos_fijos,
      { descripcion: '', importe: 0, periodicidad: 'MENSUAL', tipo: 'OTRO' }
    ]);
  };

  const removeGasto = (index: number) => {
    set('gastos_fijos', data.gastos_fijos.filter((_, i) => i !== index));
  };

  const updateGasto = (index: number, fields: Partial<GastoFijo>) => {
    const newGastos = [...data.gastos_fijos];
    newGastos[index] = { ...newGastos[index], ...fields };
    set('gastos_fijos', newGastos);
  };

  function validateStep(): string | null {
    switch (step) {
      case 0:
        if (!data.telefono.trim()) return 'El teléfono es obligatorio';
        if (!data.nombre_patron.trim()) return 'El nombre del Propietario es obligatorio';
        if (!data.email_patron.trim()) return 'El Gmail es obligatorio (se usará para Google Drive)';
        if (!data.email_patron.trim().toLowerCase().endsWith('@gmail.com')) return 'Debe ser una cuenta Gmail válida (@gmail.com)';
        return null;
      case 1:
        if (!data.matricula.trim()) return 'La matrícula es obligatoria';
        if (!data.marca_modelo.trim()) return 'Marca y modelo son obligatorios';
        if (!data.km_actuales || Number(data.km_actuales) < 0) return 'Los km actuales son obligatorios';
        return null;
      case 2:
        for (const [i, a] of data.asalariados.entries()) {
          if (!a.nombre.trim()) return `El nombre del asalariado ${i + 1} es obligatorio`;
          if (!a.telefono.trim()) return `El teléfono del asalariado ${i + 1} es obligatorio`;
        }
        return null;
      default:
        return null;
    }
  }

  async function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');

    setSaving(true);
    try {
      await guardarOnboarding({
        telefono: data.telefono,
        nombre_patron: data.nombre_patron || undefined,
        email_patron: data.email_patron || undefined,
        nif_cif: data.nif_cif || undefined,
        nombre_comercial: data.nombre_comercial || undefined,
        tipo_actividad: data.tipo_actividad,
        matricula: data.matricula || undefined,
        marca_modelo: data.marca_modelo || undefined,
        km_actuales: data.km_actuales ? Number(data.km_actuales) : undefined,
        tipo_combustible: data.tipo_combustible || undefined,
        tipo_transmision: data.tipo_transmision || undefined,
        asalariados: data.asalariados,
        gastos_fijos: data.gastos_fijos,
      } as any);
    } catch {
      // Draft fail non-blocking
    } finally {
      setSaving(false);
    }
    setStep((s) => s + 1);
  }

  async function handleComplete(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCompleting(true);

    try {
      await completarOnboarding(data.telefono);
      router.replace('/login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al completar el onboarding';
      setError(msg);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-zinc-100">
            Pilot<span className="text-amber-500">OS</span>
          </h1>
          <p className="mt-1 text-xs tracking-widest text-zinc-600 uppercase font-black">Pre-produccion</p>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-zinc-500 mb-2">
            <span>Paso {step + 1} de {STEPS.length}</span>
            <span className="text-amber-500 font-medium">{STEPS[step]}</span>
          </div>
          <div className="h-1 rounded-full bg-zinc-800">
            <div
              className="h-1 rounded-full bg-amber-500 transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <Card className="border-zinc-800 bg-zinc-950">
          <form onSubmit={(e) => { e.preventDefault(); step === STEPS.length - 1 ? handleComplete(e) : handleNext(); }}>
            {/* Step 0: Datos del propietario */}
            {step === 0 && (
              <div className="space-y-4">
                <CardTitle>Datos del Propietario</CardTitle>
                <CardDescription>Información del titular de la licencia y empresa.</CardDescription>
                <Input
                  label="Teléfono Móvil *"
                  type="tel"
                  placeholder="34600000001"
                  value={data.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                  required
                />
                <Input
                  label="Nombre completo del Propietario *"
                  placeholder="Juan García López"
                  value={data.nombre_patron}
                  onChange={(e) => set('nombre_patron', e.target.value)}
                  required
                />
                <div>
                  <Input
                    label="Gmail *"
                    type="email"
                    placeholder="tu@gmail.com"
                    value={data.email_patron}
                    onChange={(e) => set('email_patron', e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-zinc-500">Se usará para Google Drive (facturas y documentos)</p>
                </div>
                <Input
                  label="NIF / CIF (opcional)"
                  placeholder="12345678A"
                  value={data.nif_cif}
                  onChange={(e) => set('nif_cif', e.target.value)}
                />
                <Input
                  label="Nombre comercial (Opcional)"
                  placeholder="Taxi García"
                  value={data.nombre_comercial}
                  onChange={(e) => set('nombre_comercial', e.target.value)}
                />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-300">Tipo de actividad</label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    value={data.tipo_actividad}
                    onChange={(e) => set('tipo_actividad', e.target.value)}
                  >
                    <option value="TAXI">Taxi</option>
                    <option value="VTC">VTC</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 1: Vehículo */}
            {step === 1 && (
              <div className="space-y-4">
                <CardTitle>Vehículo Principal</CardTitle>
                <CardDescription>Configura los datos base de tu herramienta de trabajo.</CardDescription>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Matrícula *"
                    placeholder="1234 ABC"
                    value={data.matricula}
                    onChange={(e) => set('matricula', e.target.value.toUpperCase())}
                    required
                  />
                  <Input
                    label="Km actuales *"
                    type="number"
                    placeholder="120000"
                    value={data.km_actuales}
                    onChange={(e) => set('km_actuales', e.target.value)}
                    required
                    min={0}
                  />
                </div>
                <Input
                  label="Marca y modelo del coche *"
                  placeholder="Toyota Corolla"
                  value={data.marca_modelo}
                  onChange={(e) => set('marca_modelo', e.target.value)}
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-300">Tipo Combustible</label>
                    <select
                      className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      value={data.tipo_combustible}
                      onChange={(e) => set('tipo_combustible', e.target.value)}
                    >
                      <option value="DIESEL">Diesel</option>
                      <option value="GASOLINA">Gasolina</option>
                      <option value="HIBRIDO">Hibrido</option>
                      <option value="ELECTRICO">Electrico</option>
                      <option value="GLP">GLP</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-zinc-300">Transmisión</label>
                    <select
                      className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      value={data.tipo_transmision}
                      onChange={(e) => set('tipo_transmision', e.target.value)}
                    >
                      <option value="AUTOMATICA">Automático</option>
                      <option value="MANUAL">Manual</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Asalariados */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Asalariados</CardTitle>
                    <CardDescription>Añade conductores y define su reparto.</CardDescription>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addAsalariado} className="gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
                    <Plus className="h-4 w-4" /> Añadir Conductor
                  </Button>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
                  {data.asalariados.length === 0 ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-10 text-center">
                      <Users className="mx-auto h-12 w-12 text-zinc-800 mb-4" />
                      <p className="text-sm text-zinc-400">¿Eres conductor único?</p>
                      <p className="text-xs text-zinc-600 mt-1">Si no tienes asalariados, pulsa siguiente.</p>
                    </div>
                  ) : (
                    data.asalariados.map((a, i) => (
                      <div key={i} className="relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4 shadow-sm">
                        <button
                          type="button"
                          onClick={() => removeAsalariado(i)}
                          className="absolute top-3 right-3 p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        <div className="flex items-center gap-2 text-zinc-400">
                          <Users className="h-4 w-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">Conductor #{i + 1}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Nombre"
                            placeholder="Nombre completo"
                            value={a.nombre}
                            onChange={(e) => updateAsalariado(i, { nombre: e.target.value })}
                            className="h-10"
                          />
                          <Input
                            label="Teléfono"
                            placeholder="34..."
                            value={a.telefono}
                            onChange={(e) => updateAsalariado(i, { telefono: e.target.value })}
                            className="h-10"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4 items-end bg-black/20 p-3 rounded-lg border border-zinc-800/50">
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Condición Económica</label>
                            <select
                              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
                              value={a.modelo_reparto}
                              onChange={(e) => updateAsalariado(i, { modelo_reparto: e.target.value })}
                            >
                              <option value="PORCENTAJE">Reparto (%)</option>
                              <option value="FIJO_DIARIO">Fijo Diario (€)</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black text-right block">
                              {a.modelo_reparto === 'PORCENTAJE' ? '% CONDUCTOR' : 'EUROS / DÍA'}
                            </label>
                            <Input
                              type="number"
                              value={a.porcentaje_conductor}
                              onChange={(e) => updateAsalariado(i, { porcentaje_conductor: Number(e.target.value) })}
                              className="h-9 text-right font-mono"
                              min={0}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Gastos fijos */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Gastos Fijos</CardTitle>
                    <CardDescription>Gastos mensuales (Autónomo, Seguro, Gestoría...)</CardDescription>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addGasto} className="gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                    <Plus className="h-4 w-4" /> Añadir Gasto
                  </Button>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 font-mono">
                  {data.gastos_fijos.length === 0 ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-10 text-center font-sans">
                      <Wallet className="mx-auto h-12 w-12 text-zinc-800 mb-4" />
                      <p className="text-sm text-zinc-400">Sin gastos configurados.</p>
                      <p className="text-xs text-zinc-600 mt-1">Añadir gastos ayuda a calcular el NETO real.</p>
                    </div>
                  ) : (
                    data.gastos_fijos.map((g, i) => (
                      <div key={i} className="relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm">
                        <button
                          type="button"
                          onClick={() => removeGasto(i)}
                          className="absolute top-3 right-3 p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-12 md:col-span-6 space-y-1">
                            <Input
                              placeholder="Descripción del gasto..."
                              value={g.descripcion}
                              onChange={(e) => updateGasto(i, { descripcion: e.target.value })}
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="col-span-6 md:col-span-3">
                            <Input
                              type="number"
                              placeholder="Importe"
                              value={g.importe}
                              onChange={(e) => updateGasto(i, { importe: Number(e.target.value) })}
                              className="h-9 text-center text-xs"
                              min={0}
                              step="0.01"
                            />
                          </div>
                          <div className="col-span-6 md:col-span-3">
                            <select
                              className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-1 text-center text-[10px] text-zinc-100"
                              value={g.periodicidad}
                              onChange={(e) => updateGasto(i, { periodicidad: e.target.value })}
                            >
                              <option value="MENSUAL">Mes</option>
                              <option value="TRIMESTRAL">Trim</option>
                              <option value="ANUAL">Año</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Confirmacion */}
            {step === 4 && (
              <div className="space-y-4">
                <CardTitle>Confirmación Final</CardTitle>
                <CardDescription>Revisa el resumen de tu PilotOS.</CardDescription>
                <div className="space-y-4 text-xs max-h-[450px] overflow-y-auto pr-2 scrollbar-thin">

                  <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-amber-500 font-black uppercase tracking-[0.2em] text-[9px] mb-1">
                      <Users className="h-3 w-3" /> Titularidad Propietario
                    </div>
                    <SummaryRow label="Responsable" value={data.nombre_patron} />
                    <SummaryRow label="Teléfono" value={data.telefono} />
                    <SummaryRow label="Empresa/Act." value={`${data.nombre_comercial || 'Independiente'} (${data.tipo_actividad})`} />
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                    <div className="flex items-center gap-2 text-blue-500 font-black uppercase tracking-[0.2em] text-[9px] mb-1">
                      <Car className="h-3 w-3" /> Configuración Vehículo
                    </div>
                    <SummaryRow label="Identificación" value={data.matricula} />
                    <SummaryRow label="Modelo" value={data.marca_modelo} />
                    <SummaryRow label="Kilómetros Iniciales" value={`${Number(data.km_actuales).toLocaleString()} km`} />
                    <SummaryRow label="Motorización" value={data.tipo_combustible} />
                  </div>

                  {data.asalariados.length > 0 && (
                    <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-900/30 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-500 font-black uppercase tracking-[0.2em] text-[9px] mb-1">
                        <Users className="h-3 w-3" /> Plantilla Asalariados ({data.asalariados.length})
                      </div>
                      {data.asalariados.map((a, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b last:border-0 border-zinc-800">
                          <div className="space-y-0.5">
                            <p className="text-zinc-100 font-bold">{a.nombre}</p>
                            <p className="text-[10px] text-zinc-500">{a.telefono}</p>
                          </div>
                          <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded text-[10px] font-mono font-bold">
                            {a.modelo_reparto === 'PORCENTAJE' ? `${a.porcentaje_conductor}% Cond.` : `${a.porcentaje_conductor}€/día`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.gastos_fijos.length > 0 && (
                    <div className="p-4 rounded-xl bg-zinc-900 border border-red-900/30 space-y-3">
                      <div className="flex items-center gap-2 text-red-500 font-black uppercase tracking-[0.2em] text-[9px] mb-1">
                        <Wallet className="h-3 w-3" /> Estructura Costes Fijos
                      </div>
                      <div className="space-y-2">
                        {data.gastos_fijos.map((g, i) => (
                          <SummaryRow key={i} label={g.descripcion || 'Sin descripción'} value={`${g.importe}€ / ${g.periodicidad.toLowerCase()}`} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="mt-4 rounded-lg bg-red-950 border border-red-500/50 px-4 py-3 text-xs text-red-400 font-medium">
                ⚠️ {error}
              </p>
            )}

            {/* Navigation */}
            <div className="mt-8 flex justify-between gap-4">
              {step > 0 ? (
                <Button type="button" variant="outline" className="border-zinc-800 text-zinc-400" onClick={() => setStep((s) => s - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-2" /> Atrás
                </Button>
              ) : (
                <div />
              )}

              {step < STEPS.length - 1 ? (
                <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold px-8">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Siguiente <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={completing} className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold px-8">
                  {completing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Finalizar Onboarding
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-zinc-500 font-medium">{label}</span>
      <span className="text-zinc-200 font-bold">{value}</span>
    </div>
  );
}
