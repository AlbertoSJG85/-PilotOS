'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface OnboardingForm {
    // Patrón
    nombrePatron: string;
    telefono: string;
    emailPatron: string;

    // Asalariado
    tieneAsalariado: boolean;
    nombreAsalariado: string;
    telefonoAsalariado: string;

    // Vehículo
    matricula: string;
    marcaModelo: string;
    fechaMatriculacion: string;
    tipoCombustible: string;
    tipoTransmision: string;
    kmActuales: string;

    // Seguro
    seguroVigencia: string;

    // Autónomo
    importeAutonomo: string;

    // Emisora
    tieneEmisora: boolean;
    importeEmisora: string;
}

export default function OnboardingPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [error, setError] = useState('');

    const [form, setForm] = useState<OnboardingForm>({
        nombrePatron: '',
        telefono: '',
        emailPatron: '',
        tieneAsalariado: false,
        nombreAsalariado: '',
        telefonoAsalariado: '',
        matricula: '',
        marcaModelo: '',
        fechaMatriculacion: '',
        tipoCombustible: 'DIESEL',
        tipoTransmision: 'MANUAL',
        kmActuales: '',
        seguroVigencia: '',
        importeAutonomo: '',
        tieneEmisora: false,
        importeEmisora: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
            setForm(prev => ({ ...prev, [name]: value }));
        }
    };

    const nextStep = () => {
        if (step === 1) {
            if (!form.nombrePatron || !form.telefono) {
                setError('Nombre y teléfono son obligatorios');
                return;
            }
        }
        if (step === 2) {
            if (!form.matricula || !form.marcaModelo || !form.kmActuales) {
                setError('Datos del vehículo son obligatorios');
                return;
            }
        }
        setError('');
        setStep(prev => prev + 1);
    };

    const prevStep = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al guardar');
            }

            router.push('/onboarding/completado');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
            <div className="max-w-md mx-auto">
                <header className="text-center mb-8 pt-4">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                        Bienvenido a PilotOS
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Configura tu cuenta en minutos</p>
                </header>

                {/* Progress */}
                <div className="flex justify-center gap-2 mb-8">
                    {[1, 2, 3, 4].map(i => (
                        <div
                            key={i}
                            className={`w-3 h-3 rounded-full transition-all ${i === step ? 'bg-amber-500 w-6' :
                                    i < step ? 'bg-green-500' : 'bg-slate-700'
                                }`}
                        />
                    ))}
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500 rounded-xl p-3 text-red-300 text-sm mb-4">
                        {error}
                    </div>
                )}

                {/* Step 1: Datos Patrón */}
                {step === 1 && (
                    <div className="space-y-5 animate-fadeIn">
                        <h2 className="text-lg font-semibold text-slate-200">Tus datos</h2>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre *</label>
                            <input
                                type="text"
                                name="nombrePatron"
                                value={form.nombrePatron}
                                onChange={handleChange}
                                placeholder="Tu nombre completo"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Teléfono *</label>
                            <input
                                type="tel"
                                name="telefono"
                                value={form.telefono}
                                onChange={handleChange}
                                placeholder="+34 600 000 000"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                            <input
                                type="email"
                                name="emailPatron"
                                value={form.emailPatron}
                                onChange={handleChange}
                                placeholder="tu@email.com"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-slate-800/30 rounded-xl">
                            <input
                                type="checkbox"
                                name="tieneAsalariado"
                                checked={form.tieneAsalariado}
                                onChange={handleChange}
                                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
                            />
                            <label className="text-slate-300">¿Tienes conductor asalariado?</label>
                        </div>

                        {form.tieneAsalariado && (
                            <div className="space-y-4 pl-4 border-l-2 border-amber-500/30">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre conductor</label>
                                    <input
                                        type="text"
                                        name="nombreAsalariado"
                                        value={form.nombreAsalariado}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Teléfono conductor</label>
                                    <input
                                        type="tel"
                                        name="telefonoAsalariado"
                                        value={form.telefonoAsalariado}
                                        onChange={handleChange}
                                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Vehículo */}
                {step === 2 && (
                    <div className="space-y-5 animate-fadeIn">
                        <h2 className="text-lg font-semibold text-slate-200">Tu vehículo</h2>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Matrícula *</label>
                            <input
                                type="text"
                                name="matricula"
                                value={form.matricula}
                                onChange={handleChange}
                                placeholder="1234 ABC"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all uppercase"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Marca y modelo *</label>
                            <input
                                type="text"
                                name="marcaModelo"
                                value={form.marcaModelo}
                                onChange={handleChange}
                                placeholder="Ej: Skoda Octavia"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Fecha matriculación</label>
                            <input
                                type="date"
                                name="fechaMatriculacion"
                                value={form.fechaMatriculacion}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">Combustible</label>
                                <select
                                    name="tipoCombustible"
                                    value={form.tipoCombustible}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                >
                                    <option value="DIESEL">Diésel</option>
                                    <option value="GASOLINA">Gasolina</option>
                                    <option value="HIBRIDO">Híbrido</option>
                                    <option value="ELECTRICO">Eléctrico</option>
                                    <option value="GLP">GLP</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">Transmisión</label>
                                <select
                                    name="tipoTransmision"
                                    value={form.tipoTransmision}
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                >
                                    <option value="MANUAL">Manual</option>
                                    <option value="AUTOMATICA">Automática</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Km actuales *</label>
                            <input
                                type="number"
                                name="kmActuales"
                                value={form.kmActuales}
                                onChange={handleChange}
                                placeholder="0"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Vigencia seguro</label>
                            <input
                                type="date"
                                name="seguroVigencia"
                                value={form.seguroVigencia}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>
                    </div>
                )}

                {/* Step 3: Gastos fijos */}
                {step === 3 && (
                    <div className="space-y-5 animate-fadeIn">
                        <h2 className="text-lg font-semibold text-slate-200">Gastos fijos</h2>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Cuota autónomo mensual</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-400">€</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    name="importeAutonomo"
                                    value={form.importeAutonomo}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    className="w-full pl-8 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-slate-800/30 rounded-xl">
                            <input
                                type="checkbox"
                                name="tieneEmisora"
                                checked={form.tieneEmisora}
                                onChange={handleChange}
                                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
                            />
                            <label className="text-slate-300">¿Tienes emisora de radio taxi?</label>
                        </div>

                        {form.tieneEmisora && (
                            <div className="pl-4 border-l-2 border-amber-500/30">
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">Cuota emisora mensual</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-slate-400">€</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="importeEmisora"
                                        value={form.importeEmisora}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Resumen */}
                {step === 4 && (
                    <div className="space-y-5 animate-fadeIn">
                        <h2 className="text-lg font-semibold text-slate-200">Confirma tus datos</h2>

                        <div className="bg-slate-800/30 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Patrón</span>
                                <span className="font-medium">{form.nombrePatron}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Teléfono</span>
                                <span className="font-medium">{form.telefono}</span>
                            </div>
                            {form.tieneAsalariado && (
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Conductor</span>
                                    <span className="font-medium">{form.nombreAsalariado}</span>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-800/30 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Vehículo</span>
                                <span className="font-medium">{form.matricula}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Modelo</span>
                                <span className="font-medium">{form.marcaModelo}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Km actuales</span>
                                <span className="font-medium">{form.kmActuales} km</span>
                            </div>
                        </div>

                        {(form.importeAutonomo || form.tieneEmisora) && (
                            <div className="bg-slate-800/30 rounded-xl p-4 space-y-3">
                                {form.importeAutonomo && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Autónomo</span>
                                        <span className="font-medium">€{form.importeAutonomo}/mes</span>
                                    </div>
                                )}
                                {form.tieneEmisora && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Emisora</span>
                                        <span className="font-medium">€{form.importeEmisora}/mes</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Navigation */}
                <div className="flex gap-4 mt-8">
                    {step > 1 && (
                        <button
                            type="button"
                            onClick={prevStep}
                            className="flex-1 py-3 border border-slate-600 text-slate-300 font-medium rounded-xl hover:bg-slate-800 transition-all"
                        >
                            Atrás
                        </button>
                    )}

                    {step < 4 ? (
                        <button
                            type="button"
                            onClick={nextStep}
                            className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
                        >
                            Siguiente
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : 'Confirmar'}
                        </button>
                    )}
                </div>

                <p className="text-center text-slate-500 text-xs mt-6 pb-8">
                    Estos datos se pueden modificar más adelante
                </p>
            </div>
        </main>
    );
}
