'use client';

/**
 * Nuevo gasto — a mano, o subiendo la factura (2026-10-29).
 *
 * Si hay factura, se sube aquí mismo y se lee sola (el mismo lector que la
 * pantalla de Documentos: un solo camino, no dos). La factura puede ser:
 *   · un gasto sin más (un espejo roto, un cambio de aceite que no está en
 *     el calendario): solo se registra el gasto;
 *   · un gasto que además pone al día un mantenimiento (la verificación del
 *     taxímetro, las ruedas): se registra el gasto Y se actualiza el
 *     mantenimiento con su nueva vigencia;
 * y los papeles que NO tienen gasto (tarjeta de transporte, inspección
 * municipal) no se confirman aquí: se mandan a Documentos.
 */

import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, FileCheck2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { Card, Input, Button } from '@/components/ui';
import { crearGasto, getVehiculos, uploadFoto } from '@/lib/api';
import { registrarDocumentoVehiculo, confirmarDocumento, type PropuestaDocumento } from '@/lib/api/documentos-vehiculo';
import type { Vehiculo } from '@/types';

/** Papeles que no tienen gasto: se confirman en Documentos. */
const TIPOS_SIN_GASTO = ['CERTIFICADO_ITV', 'TARJETA_TRANSPORTE'];

function esAIso(f?: string): string {
    const m = f?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function isoAEs(f: string): string {
    const m = f.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export default function NuevoGastoPage() {
    const router = useRouter();

    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // La factura subida y lo que el lector propone (null = gasto a mano).
    const [leyendo, setLeyendo] = useState(false);
    const [doc, setDoc] = useState<{ id: string; propuesta: PropuestaDocumento } | null>(null);
    const [ponerAlDia, setPonerAlDia] = useState(true);
    const [enviadoARevision, setEnviadoARevision] = useState(false);

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

    async function handleArchivo(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        const vehiculoId = form.vehiculo_id || vehiculos[0]?.id;
        if (!vehiculoId) {
            setError('No hay ningún vehículo dado de alta.');
            return;
        }

        setError('');
        setLeyendo(true);
        try {
            const subida = await uploadFoto(file);
            const r = await registrarDocumentoVehiculo(subida.url, vehiculoId);
            if (!r.data?.id || !r.propuesta) throw new Error('sin_propuesta');

            const p = r.propuesta;
            setDoc({ id: r.data.id, propuesta: p });
            setPonerAlDia(true);
            setForm((f) => ({
                ...f,
                vehiculo_id: vehiculoId,
                tipo: p.tipo === 'POLIZA_SEGURO' ? 'SEGURO' : 'MANTENIMIENTO',
                descripcion: p.concepto ?? f.descripcion,
                importe: p.importe !== undefined ? String(p.importe) : f.importe,
                fecha: esAIso(p.fecha) || f.fecha,
            }));
        } catch (err: unknown) {
            setDoc(null);
            setError(err instanceof Error && err.message !== 'sin_propuesta'
                ? err.message
                : 'No se pudo leer la factura. Puedes rellenar el gasto a mano.');
        } finally {
            setLeyendo(false);
        }
    }

    function quitarFactura() {
        setDoc(null);
        setError('');
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (doc) {
                const p = doc.propuesta;
                const importe = parseFloat(form.importe);
                const fechaEs = isoAEs(form.fecha);
                const detectados = p.mantenimientos_detectados;
                const poner = ponerAlDia && detectados.length > 0;
                const extras = { tipo_gasto: form.tipo, forma_pago: form.forma_pago, descripcion: form.descripcion.trim() };

                // Si importe y fecha son los que lee el papel, la persona lo
                // acepta; si los ha cambiado, está corrigiendo al documento y
                // (en un asalariado) pasa a revisión del dueño.
                const acepta = p.importe === importe && p.fecha === fechaEs;
                const r = acepta
                    ? await confirmarDocumento(doc.id, true, undefined, { extras, omitir_mantenimiento: !poner })
                    : await confirmarDocumento(doc.id, false, {
                        fecha: fechaEs,
                        importe,
                        valida_hasta: p.valida_hasta,
                        km_documento: p.km_documento,
                        mantenimientos: poner ? detectados : [],
                        ...extras,
                    });

                if (r.pendiente_revision) {
                    setEnviadoARevision(true);
                    return;
                }
            } else {
                await crearGasto({
                    tipo: form.tipo,
                    descripcion: form.descripcion.trim(),
                    importe: parseFloat(form.importe),
                    fecha: form.fecha,
                    vehiculo_id: form.vehiculo_id || undefined,
                    forma_pago: form.forma_pago,
                });
            }

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

    const sinGasto = doc !== null && TIPOS_SIN_GASTO.includes(doc.propuesta.tipo);
    const detectados = doc?.propuesta.mantenimientos_detectados ?? [];

    if (enviadoARevision) {
        return (
            <>
                <PageHeader title="Nuevo Gasto" description="Registra un importe o factura pagada" />
                <Card className="mx-auto max-w-xl p-6 text-center">
                    <FileCheck2 className="mx-auto mb-3 h-8 w-8 text-pilot-lime" />
                    <p className="font-semibold text-zinc-100">Enviado al dueño para que lo revise</p>
                    <p className="mt-1 text-sm text-zinc-400">
                        Has cambiado datos de la factura, así que el gasto se registrará cuando el dueño lo apruebe.
                    </p>
                    <Link href="/gastos" className="mt-4 inline-block text-sm text-pilot-lime hover:text-pilot-lime-light">
                        Volver a gastos
                    </Link>
                </Card>
            </>
        );
    }

    return (
        <>
            <PageHeader
                title="Nuevo Gasto"
                description="Sube la factura y se lee sola, o regístralo a mano"
            >
                <Button variant="outline" onClick={() => router.back()}>
                    Cancelar
                </Button>
            </PageHeader>

            <Card className="mx-auto max-w-xl p-6">
                {/* Factura: se sube y se lee. Lo que se lee se puede corregir abajo. */}
                <div className="mb-6">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-950 px-4 py-4 text-sm font-medium text-zinc-200 transition-colors hover:border-pilot-lime/60">
                        <Upload className="h-4 w-4" />
                        {leyendo ? 'Leyendo la factura…' : doc ? 'Subir otra factura' : 'Subir factura (foto)'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleArchivo} disabled={leyendo || loading} />
                    </label>

                    {doc && !sinGasto && (
                        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-sm">
                            <p className="flex items-center gap-2 font-medium text-emerald-300">
                                <FileCheck2 className="h-4 w-4" /> Factura leída. Revisa los datos y confirma.
                            </p>
                            {doc.propuesta.faltantes.length > 0 && (
                                <p className="mt-1 text-xs text-amber-300">
                                    No he podido leer: {doc.propuesta.faltantes.filter((f) => f !== 'valida_hasta').join(', ') || '—'}. Complétalo abajo.
                                </p>
                            )}
                            {detectados.length > 0 ? (
                                <label className="mt-2 flex items-start gap-2 text-zinc-200">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={ponerAlDia}
                                        onChange={(e) => setPonerAlDia(e.target.checked)}
                                    />
                                    <span>
                                        Poner al día en mantenimientos: <strong>{doc.propuesta.concepto ?? detectados.join(', ')}</strong>
                                        {doc.propuesta.valida_hasta && doc.propuesta.vigencia_meses
                                            ? ` · vigente hasta ${doc.propuesta.valida_hasta} (${doc.propuesta.vigencia_meses} meses)`
                                            : ''}
                                    </span>
                                </label>
                            ) : (
                                <p className="mt-1 text-xs text-zinc-400">
                                    Se registrará solo como gasto; no toca ningún mantenimiento.
                                </p>
                            )}
                            <button type="button" onClick={quitarFactura} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
                                Quitar la factura y hacerlo a mano
                            </button>
                        </div>
                    )}

                    {doc && sinGasto && (
                        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-sm">
                            <p className="flex items-center gap-2 font-medium text-amber-300">
                                <AlertTriangle className="h-4 w-4" /> Esto es un documento sin gasto
                            </p>
                            <p className="mt-1 text-zinc-300">
                                Parece {doc.propuesta.tipo === 'TARJETA_TRANSPORTE' ? 'una tarjeta de transporte' : 'un certificado de inspección'},
                                que solo lleva fecha y vigencia. Se confirma en Documentos.
                            </p>
                            <Link href="/documentos" className="mt-2 inline-block text-pilot-lime hover:text-pilot-lime-light">
                                Ir a Documentos
                            </Link>
                            <button type="button" onClick={quitarFactura} className="ml-4 text-xs text-zinc-500 hover:text-zinc-300">
                                No es eso, hacerlo a mano
                            </button>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-300">Tipo de Gasto</label>
                            <select
                                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-pilot-lime focus:outline-none focus:ring-1 focus:ring-pilot-lime"
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
                                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-pilot-lime focus:outline-none focus:ring-1 focus:ring-pilot-lime disabled:opacity-60"
                                value={form.vehiculo_id}
                                onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}
                                disabled={doc !== null}
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
                                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-pilot-lime focus:outline-none focus:ring-1 focus:ring-pilot-lime"
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

                    <Button type="submit" className="w-full" disabled={loading || leyendo || sinGasto}>
                        {loading ? 'Guardando...' : doc && detectados.length > 0 && ponerAlDia ? 'Registrar gasto y poner al día' : 'Registrar Gasto'}
                    </Button>
                </form>
            </Card>
        </>
    );
}
