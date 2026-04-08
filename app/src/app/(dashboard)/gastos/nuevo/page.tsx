'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import { Card, Input, Button } from '@/components/ui';
import { crearGasto, getVehiculos } from '@/lib/api';
import type { Vehiculo } from '@/types';

export default function NuevoGastoPage() {
    const router = useRouter();

    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [form, setForm] = useState({
        tipo: 'OTRO',
        descripcion: '',
        importe: '',
        fecha: new Date().toISOString().split('T')[0],
        vehiculo_id: '',
        forma_pago: 'EFECTIVO',
    });

    useEffect(() => {
        getVehiculos().then((res) => {
            if (res.data) setVehiculos(res.data);
        });
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await crearGasto({
                tipo: form.tipo,
                descripcion: form.descripcion.trim(),
                importe: parseFloat(form.importe),
                fecha: form.fecha,
                vehiculo_id: form.vehiculo_id || undefined,
                forma_pago: form.forma_pago,
            });

            // Redirigir y forzar refetch
            router.push('/gastos');
            router.refresh();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al guardar el gasto';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <PageHeader
                title="Nuevo Gasto"
                description="Registra un importe o factura pagada"
            >
                <Button variant="outline" onClick={() => router.back()}>
                    Cancelar
                </Button>
            </PageHeader>

            <Card className="mx-auto max-w-xl p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-300">Tipo de Gasto</label>
                            <select
                                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                value={form.tipo}
                                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                                required
                            >
                                <option value="COMBUSTIBLE">Combustible</option>
                                <option value="MANTENIMIENTO">Mantenimiento</option>
                                <option value="SEGURO">Seguro</option>
                                <option value="IMPUESTO">Impuesto / Tasa</option>
                                <option value="AUTONOMO">Cuota Autónomo</option>
                                <option value="EMISORA">Emisora / App</option>
                                <option value="OTRO">Otro Gasto</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-300">Vehículo Asociado (Opcional)</label>
                            <select
                                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                value={form.vehiculo_id}
                                onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}
                            >
                                <option value="">Ninguno / General</option>
                                {vehiculos.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.matricula}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="col-span-full">
                        <Input
                            label="Descripción"
                            placeholder="Ej: Cambio de aceite y filtros"
                            required
                            value={form.descripcion}
                            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Input
                            label="Importe (€)"
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            placeholder="0.00"
                            value={form.importe}
                            onChange={(e) => setForm({ ...form, importe: e.target.value })}
                        />

                        <Input
                            label="Fecha"
                            type="date"
                            required
                            value={form.fecha}
                            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                        />

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-300">Forma de Pago</label>
                            <select
                                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                value={form.forma_pago}
                                onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}
                            >
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="TARJETA">Tarjeta</option>
                                <option value="BANCO">Transferencia</option>
                                <option value="DOMICILIADO">Domiciliado</option>
                            </select>
                        </div>
                    </div>

                    {error && <p className="text-sm font-medium text-red-400">{error}</p>}

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Guardando...' : 'Registrar Gasto'}
                    </Button>
                </form>
            </Card>
        </>
    );
}
