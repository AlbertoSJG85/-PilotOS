'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface ParteDiarioForm {
    fechaTrabajada: string;
    vehiculoId: string;
    kmInicio: string;
    kmFin: string;
    ingresoTotal: string;
    ingresoDatafono: string;
    combustible: string;
}

interface ValidationErrors {
    [key: string]: string;
}

export default function ParteDiarioPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [fotoTaximetro, setFotoTaximetro] = useState<File | null>(null);
    const [fotoGasoil, setFotoGasoil] = useState<File | null>(null);
    const [previewTaximetro, setPreviewTaximetro] = useState<string>('');
    const [previewGasoil, setPreviewGasoil] = useState<string>('');

    const taximetroRef = useRef<HTMLInputElement>(null);
    const gasoilRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState<ParteDiarioForm>({
        fechaTrabajada: new Date().toISOString().split('T')[0],
        vehiculoId: '',
        kmInicio: '',
        kmFin: '',
        ingresoTotal: '',
        ingresoDatafono: '',
        combustible: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
        // Limpiar error del campo
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'taximetro' | 'gasoil') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (tipo === 'taximetro') {
                    setFotoTaximetro(file);
                    setPreviewTaximetro(reader.result as string);
                } else {
                    setFotoGasoil(file);
                    setPreviewGasoil(reader.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    // Validaciones según reglas canónicas R-PD-012 a R-PD-015
    const validate = (): boolean => {
        const newErrors: ValidationErrors = {};

        // R-PD-012: Campos obligatorios
        if (!form.fechaTrabajada) newErrors.fechaTrabajada = 'Fecha obligatoria';
        if (!form.vehiculoId) newErrors.vehiculoId = 'Selecciona un vehículo';
        if (!form.kmInicio) newErrors.kmInicio = 'Km inicio obligatorio';
        if (!form.kmFin) newErrors.kmFin = 'Km fin obligatorio';
        if (!form.ingresoTotal) newErrors.ingresoTotal = 'Ingreso total obligatorio';
        if (!form.ingresoDatafono) newErrors.ingresoDatafono = 'Ingreso datáfono obligatorio';
        if (!fotoTaximetro) newErrors.fotoTaximetro = 'Foto del taxímetro obligatoria';

        // R-PD-013: km_fin > km_inicio
        const kmInicio = parseInt(form.kmInicio);
        const kmFin = parseInt(form.kmFin);
        if (kmFin <= kmInicio) {
            newErrors.kmFin = 'Km fin debe ser mayor que km inicio';
        }

        // R-PD-014: ingreso_total >= ingreso_datáfono
        const ingresoTotal = parseFloat(form.ingresoTotal);
        const ingresoDatafono = parseFloat(form.ingresoDatafono);
        if (ingresoTotal < ingresoDatafono) {
            newErrors.ingresoDatafono = 'No puede ser mayor que ingreso total';
        }

        // R-PD-015: Si combustible > 0, foto gasoil obligatoria
        const combustible = parseFloat(form.combustible || '0');
        if (combustible > 0 && !fotoGasoil) {
            newErrors.fotoGasoil = 'Foto del gasoil obligatoria si declaras combustible';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const uploadPhoto = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('foto', file);

        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Error subiendo foto');
        }

        const data = await response.json();
        return data.url;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validate()) return;

        setLoading(true);
        try {
            // Subir fotos
            let urlTaximetro = '';
            let urlGasoil = '';

            if (fotoTaximetro) {
                urlTaximetro = await uploadPhoto(fotoTaximetro);
            }

            if (fotoGasoil) {
                urlGasoil = await uploadPhoto(fotoGasoil);
            }

            const payload = {
                ...form,
                kmInicio: parseInt(form.kmInicio),
                kmFin: parseInt(form.kmFin),
                ingresoTotal: parseFloat(form.ingresoTotal),
                ingresoDatafono: parseFloat(form.ingresoDatafono),
                combustible: form.combustible ? parseFloat(form.combustible) : null,
                conductorId: 'temp-conductor-id', // TODO: Obtener del contexto de auth
                // Añadir URLs de fotos (el backend debe esperar recibir esto)
                fotoTaximetroUrl: urlTaximetro,
                fotoGasoilUrl: urlGasoil
            };

            const response = await fetch('/api/partes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al enviar parte');
            }

            router.push('/exito');
        } catch (error: any) {
            console.error(error);
            setErrors({ general: error.message || 'Error desconocido' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
            <div className="max-w-md mx-auto">
                <header className="text-center mb-8 pt-4">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                        Parte Diario
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">PilotOS</p>
                </header>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {errors.general && (
                        <div className="bg-red-500/20 border border-red-500 rounded-xl p-3 text-red-300 text-sm">
                            {errors.general}
                        </div>
                    )}

                    {/* Fecha */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Fecha trabajada *
                        </label>
                        <input
                            type="date"
                            name="fechaTrabajada"
                            value={form.fechaTrabajada}
                            onChange={handleChange}
                            className={`w-full px-4 py-3 bg-slate-800/50 border ${errors.fechaTrabajada ? 'border-red-500' : 'border-slate-700'} rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`}
                        />
                        {errors.fechaTrabajada && <p className="text-red-400 text-xs mt-1">{errors.fechaTrabajada}</p>}
                    </div>

                    {/* Vehículo */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Vehículo *
                        </label>
                        <select
                            name="vehiculoId"
                            value={form.vehiculoId}
                            onChange={handleChange}
                            className={`w-full px-4 py-3 bg-slate-800/50 border ${errors.vehiculoId ? 'border-red-500' : 'border-slate-700'} rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`}
                        >
                            <option value="">Seleccionar vehículo</option>
                            {/* TODO: Cargar vehículos del usuario */}
                            <option value="temp-vehiculo">Mi Taxi</option>
                        </select>
                        {errors.vehiculoId && <p className="text-red-400 text-xs mt-1">{errors.vehiculoId}</p>}
                    </div>

                    {/* Kilómetros */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Km inicio *
                            </label>
                            <input
                                type="number"
                                name="kmInicio"
                                value={form.kmInicio}
                                onChange={handleChange}
                                placeholder="0"
                                className={`w-full px-4 py-3 bg-slate-800/50 border ${errors.kmInicio ? 'border-red-500' : 'border-slate-700'} rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`}
                            />
                            {errors.kmInicio && <p className="text-red-400 text-xs mt-1">{errors.kmInicio}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Km fin *
                            </label>
                            <input
                                type="number"
                                name="kmFin"
                                value={form.kmFin}
                                onChange={handleChange}
                                placeholder="0"
                                className={`w-full px-4 py-3 bg-slate-800/50 border ${errors.kmFin ? 'border-red-500' : 'border-slate-700'} rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`}
                            />
                            {errors.kmFin && <p className="text-red-400 text-xs mt-1">{errors.kmFin}</p>}
                        </div>
                    </div>

                    {/* Km recorridos (calculado) */}
                    {form.kmInicio && form.kmFin && parseInt(form.kmFin) > parseInt(form.kmInicio) && (
                        <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                            <span className="text-slate-400 text-sm">Km recorridos: </span>
                            <span className="text-amber-400 font-bold">
                                {parseInt(form.kmFin) - parseInt(form.kmInicio)} km
                            </span>
                        </div>
                    )}

                    {/* Ingresos */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Ingreso total *
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-400">€</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    name="ingresoTotal"
                                    value={form.ingresoTotal}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    className={`w-full pl-8 pr-4 py-3 bg-slate-800/50 border ${errors.ingresoTotal ? 'border-red-500' : 'border-slate-700'} rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`}
                                />
                            </div>
                            {errors.ingresoTotal && <p className="text-red-400 text-xs mt-1">{errors.ingresoTotal}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Datáfono *
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-slate-400">€</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    name="ingresoDatafono"
                                    value={form.ingresoDatafono}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    className={`w-full pl-8 pr-4 py-3 bg-slate-800/50 border ${errors.ingresoDatafono ? 'border-red-500' : 'border-slate-700'} rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all`}
                                />
                            </div>
                            {errors.ingresoDatafono && <p className="text-red-400 text-xs mt-1">{errors.ingresoDatafono}</p>}
                        </div>
                    </div>

                    {/* Efectivo estimado */}
                    {form.ingresoTotal && form.ingresoDatafono && (
                        <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                            <span className="text-slate-400 text-sm">Efectivo estimado: </span>
                            <span className="text-green-400 font-bold">
                                €{(parseFloat(form.ingresoTotal) - parseFloat(form.ingresoDatafono)).toFixed(2)}
                            </span>
                        </div>
                    )}

                    {/* Combustible */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Combustible (opcional)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-slate-400">€</span>
                            <input
                                type="number"
                                step="0.01"
                                name="combustible"
                                value={form.combustible}
                                onChange={handleChange}
                                placeholder="0.00"
                                className="w-full pl-8 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                        </div>
                    </div>

                    {/* Foto Taxímetro */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Foto ticket taxímetro *
                        </label>
                        <input
                            ref={taximetroRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handlePhotoChange(e, 'taximetro')}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => taximetroRef.current?.click()}
                            className={`w-full p-4 border-2 border-dashed ${errors.fotoTaximetro ? 'border-red-500' : 'border-slate-600'} rounded-xl flex flex-col items-center justify-center gap-2 hover:border-amber-500 transition-all ${previewTaximetro ? 'p-2' : 'py-8'}`}
                        >
                            {previewTaximetro ? (
                                <img src={previewTaximetro} alt="Preview" className="max-h-32 rounded-lg" />
                            ) : (
                                <>
                                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-slate-400 text-sm">Toca para hacer foto</span>
                                </>
                            )}
                        </button>
                        {errors.fotoTaximetro && <p className="text-red-400 text-xs mt-1">{errors.fotoTaximetro}</p>}
                    </div>

                    {/* Foto Gasoil (condicional) */}
                    {parseFloat(form.combustible || '0') > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Foto ticket gasoil *
                            </label>
                            <input
                                ref={gasoilRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => handlePhotoChange(e, 'gasoil')}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => gasoilRef.current?.click()}
                                className={`w-full p-4 border-2 border-dashed ${errors.fotoGasoil ? 'border-red-500' : 'border-slate-600'} rounded-xl flex flex-col items-center justify-center gap-2 hover:border-amber-500 transition-all ${previewGasoil ? 'p-2' : 'py-8'}`}
                            >
                                {previewGasoil ? (
                                    <img src={previewGasoil} alt="Preview" className="max-h-32 rounded-lg" />
                                ) : (
                                    <>
                                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span className="text-slate-400 text-sm">Toca para hacer foto</span>
                                    </>
                                )}
                            </button>
                            {errors.fotoGasoil && <p className="text-red-400 text-xs mt-1">{errors.fotoGasoil}</p>}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Enviando...
                            </span>
                        ) : (
                            'Enviar Parte'
                        )}
                    </button>
                </form>

                <p className="text-center text-slate-500 text-xs mt-6 pb-8">
                    Una vez enviado, el parte no se puede modificar.
                </p>
            </div>
        </main>
    );
}
