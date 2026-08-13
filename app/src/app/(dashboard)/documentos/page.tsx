'use client';

/**
 * Documentos del taxi (2026-08-12, reescrita).
 *
 * ANTES: esta pantalla listaba los PARTES. Era duplicar la pantalla de partes
 * y no servía para nada — los tickets del parte ya se ven en el parte.
 *
 * AHORA: es la carpeta del vehículo. La ITV, la factura de los neumáticos, la
 * póliza. Se sube el papel, el OCR propone qué es y qué resuelve, y una
 * persona lo confirma o lo corrige. Al confirmarlo pasan las dos cosas que
 * pidió Alberto: el contador del mantenimiento se pone al día con su fecha
 * nueva, y el importe se va a gastos con la factura enganchada.
 *
 * Lo que NO hace todavía, y conviene tenerlo presente: los archivos se
 * guardan en el servidor, no en Drive. Drive es la siguiente fase.
 */

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton, Button, Input } from '@/components/ui';
import { getVehiculos, uploadFoto } from '@/lib/api';
import {
  getDocumentosVehiculo, registrarDocumentoVehiculo, confirmarDocumento, revisarDocumento, reprocesarDocumento,
  type DocumentoVehiculo, type PropuestaDocumento, type DatosDocumento,
} from '@/lib/api/documentos-vehiculo';
import { formatCurrency, formatDate, urlDocumento } from '@/lib/utils';
import { FileText, Upload, CheckCircle2, AlertTriangle, Pencil, FolderOpen } from 'lucide-react';
import type { Vehiculo } from '@/types';
import { ConexionDrive } from '@/components/features/conexion-drive';

// CERTIFICADO_ITV ya NO se enseña como "ITV" a secas (2026-08-13, C-070): el
// mismo `tipo` cubre tanto la ITV de tráfico/DGT como el acta municipal de
// "Inspección Técnica Auto-Taxi" del ayuntamiento, que NO es la ITV aunque
// las dos usen esa frase. Alberto lo señaló dos veces con el mismo documento.
const ETIQUETA_TIPO: Record<string, string> = {
  CERTIFICADO_ITV: 'Inspección técnica',
  FACTURA_TALLER: 'Factura de taller',
  POLIZA_SEGURO: 'Póliza de seguro',
  TARJETA_TRANSPORTE: 'Tarjeta de transporte',
  DOCUMENTO_VEHICULO_SIN_CLASIFICAR: 'Sin clasificar',
};

/** Formulario de confirmación: acepta lo que dice el papel, o escribe lo correcto. */
function Confirmacion({
  documento,
  propuesta,
  onHecho,
  modoRevision,
}: {
  documento: DocumentoVehiculo;
  propuesta: PropuestaDocumento;
  onHecho: (mensaje: string) => void;
  modoRevision?: boolean;
}) {
  const [corrigiendo, setCorrigiendo] = useState(propuesta.faltantes.length > 0);
  const [datos, setDatos] = useState<DatosDocumento>({
    fecha: propuesta.fecha ?? '',
    valida_hasta: propuesta.valida_hasta ?? '',
    importe: propuesta.importe,
    km_documento: propuesta.km_documento,
    mantenimientos: propuesta.mantenimientos_detectados ?? [],
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esItv = ['CERTIFICADO_ITV', 'POLIZA_SEGURO', 'TARJETA_TRANSPORTE'].includes(propuesta.tipo);

  async function enviar(aceptaOcr: boolean) {
    setError(null);
    setEnviando(true);
    try {
      const r = modoRevision
        ? await revisarDocumento(documento.id, aceptaOcr, aceptaOcr ? undefined : datos)
        : await confirmarDocumento(documento.id, aceptaOcr, aceptaOcr ? undefined : datos);

      if ('pendiente_revision' in r && r.pendiente_revision) {
        onHecho('Enviado al dueño para que lo revise.');
        return;
      }
      const puestos = r.mantenimientos_actualizados ?? [];
      onHecho(
        puestos.length > 0
          ? `Al día: ${puestos.join(', ')}${r.gasto_id ? ' · gasto registrado' : ''}`
          : r.gasto_id ? 'Gasto registrado' : 'Documento guardado',
      );
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-black/30 p-3">
      {propuesta.faltantes.length > 0 && (
        <p className="mb-2 text-xs text-amber-300">
          No he podido leer {propuesta.faltantes.join(', ')} del documento. Escríbelo tú.
        </p>
      )}

      {!corrigiendo ? (
        <>
          <dl className="space-y-1 text-sm">
            {propuesta.fecha && <Fila etiqueta="Fecha" valor={propuesta.fecha} />}
            {propuesta.valida_hasta && <Fila etiqueta={esItv ? 'Válida hasta' : 'Vence'} valor={propuesta.valida_hasta} />}
            {propuesta.importe !== undefined && <Fila etiqueta="Importe" valor={formatCurrency(propuesta.importe)} />}
            {propuesta.km_documento !== undefined && (
              <Fila etiqueta="Km del documento" valor={`${propuesta.km_documento.toLocaleString('es-ES')} km`} />
            )}
            {propuesta.mantenimientos_detectados.length > 0 && (
              <Fila etiqueta="Pone al día" valor={propuesta.mantenimientos_detectados.join(', ')} />
            )}
          </dl>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={enviando} onClick={() => enviar(true)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {enviando ? 'Guardando…' : modoRevision ? 'Aprobar' : 'Es correcto'}
            </Button>
            <Button size="sm" variant="outline" disabled={enviando} onClick={() => setCorrigiendo(true)}>
              <Pencil className="h-3.5 w-3.5" /> Hay algo mal
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-zinc-400">
            Escribe lo que pone de verdad el documento. Lo que guardes es lo que vale.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              label="Fecha (DD/MM/AAAA)"
              value={datos.fecha ?? ''}
              onChange={(e) => setDatos({ ...datos, fecha: e.target.value })}
            />
            {esItv && (
              <Input
                label="Válida hasta (DD/MM/AAAA)"
                value={datos.valida_hasta ?? ''}
                onChange={(e) => setDatos({ ...datos, valida_hasta: e.target.value })}
              />
            )}
            <Input
              label="Importe (€)"
              type="number"
              step="0.01"
              value={datos.importe ?? ''}
              onChange={(e) => setDatos({ ...datos, importe: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Input
              label="Qué pone al día (separado por comas)"
              value={(datos.mantenimientos ?? []).join(', ')}
              onChange={(e) => setDatos({
                ...datos,
                mantenimientos: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              })}
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={enviando} onClick={() => enviar(false)}>
              {enviando ? 'Guardando…' : 'Guardar estos datos'}
            </Button>
            <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setCorrigiendo(false)}>
              Volver a lo que dice el documento
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{etiqueta}</dt>
      <dd className="text-zinc-200 font-medium text-right">{valor}</dd>
    </div>
  );
}

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<DocumentoVehiculo[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [reprocesandoId, setReprocesandoId] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    Promise.all([
      getDocumentosVehiculo().then((r) => setDocumentos(r.data || [])),
      getVehiculos().then((r) => setVehiculos(r.data || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(cargar, [cargar]);

  async function handleSubir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const vehiculo = vehiculos[0];
    if (!vehiculo) {
      setErrorSubida('No hay ningún vehículo dado de alta.');
      return;
    }
    setErrorSubida(null);
    setSubiendo(true);
    try {
      const subida = await uploadFoto(file);
      await registrarDocumentoVehiculo(subida.url, vehiculo.id);
      setAviso(null);
      cargar();
    } catch {
      setErrorSubida('No se pudo subir el documento. Inténtalo de nuevo.');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  }

  // 2026-08-13, C-070: Alberto lo pidió directamente mientras esperaba
  // delante de la pantalla — no hace falta resubir la foto, solo releer el
  // fichero que ya está guardado.
  async function handleReprocesar(id: string) {
    setReprocesandoId(id);
    setAviso(null);
    try {
      await reprocesarDocumento(id);
      cargar();
    } catch {
      setErrorSubida('No se pudo volver a leer el documento. Inténtalo de nuevo.');
    } finally {
      setReprocesandoId(null);
    }
  }

  const pendientes = documentos.filter((d) => d.estado === 'PENDIENTE_CONFIRMACION' || d.estado === 'PENDIENTE_REVISION');
  const archivados = documentos.filter((d) => d.estado === 'APLICADO');

  if (loading) {
    return (
      <>
        <PageHeader title="Documentos del vehículo" description="ITV, facturas de taller y seguro" />
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Documentos del vehículo" description="ITV, facturas de taller y seguro. Los tickets del parte están en cada parte.">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-pilot-lime px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-pilot-lime-dim transition-colors">
          <Upload className="h-4 w-4" />
          {subiendo ? 'Subiendo…' : 'Subir documento'}
          <input type="file" accept="image/*" className="hidden" onChange={handleSubir} disabled={subiendo} />
        </label>
      </PageHeader>

      <ConexionDrive />

      {errorSubida && <p className="mb-4 text-sm text-red-300">{errorSubida}</p>}
      {aviso && <p className="mb-4 text-sm text-emerald-300">{aviso}</p>}

      {pendientes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Esperan tu confirmación ({pendientes.length})
          </h2>
          <div className="space-y-3">
            {pendientes.map((doc) => {
              const propuesta = doc.ocr_datos_extraidos;
              return (
                <Card key={doc.id} className="border-amber-500/40 bg-amber-950/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">{ETIQUETA_TIPO[doc.tipo] ?? doc.tipo}</span>
                        {doc.estado === 'PENDIENTE_REVISION' && (
                          <Badge variant="warning" className="text-[10px] uppercase">Corregido por el conductor</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Subido el {formatDate(doc.created_at)} · {doc.vehiculo?.matricula ?? '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        href={urlDocumento(doc.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-pilot-lime hover:text-pilot-lime-light"
                      >
                        Ver documento
                      </a>
                      <button
                        type="button"
                        disabled={reprocesandoId === doc.id}
                        onClick={() => handleReprocesar(doc.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                        title="Volver a leer el documento (no hace falta resubirlo)"
                      >
                        {reprocesandoId === doc.id ? 'Leyendo…' : 'Reprocesar'}
                      </button>
                    </div>
                  </div>

                  {propuesta ? (
                    <Confirmacion
                      documento={doc}
                      propuesta={propuesta}
                      modoRevision={doc.estado === 'PENDIENTE_REVISION'}
                      onHecho={(m) => { setAviso(m); cargar(); }}
                    />
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">No se pudo leer el documento. Ábrelo para revisarlo a mano.</p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          <FolderOpen className="h-4 w-4" /> Archivo del vehículo
        </h2>

        {archivados.length === 0 ? (
          <Card className="py-10 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-zinc-400">Todavía no hay documentación guardada.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Sube la ITV o una factura del taller: se leerá sola, pondrá al día el mantenimiento y registrará el gasto.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {archivados.map((doc) => {
              const datos = (doc.datos_confirmados ?? {}) as DatosDocumento;
              return (
                <Card key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-100">{ETIQUETA_TIPO[doc.tipo] ?? doc.tipo}</span>
                      {doc.corregido && (
                        <Badge variant="default" className="text-[10px] uppercase">Corregido a mano</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {datos.fecha ? `Del ${datos.fecha}` : formatDate(doc.created_at)}
                      {datos.valida_hasta ? ` · válida hasta ${datos.valida_hasta}` : ''}
                      {datos.importe ? ` · ${formatCurrency(datos.importe)}` : ''}
                    </p>
                  </div>
                  <a
                    href={urlDocumento(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-pilot-lime hover:text-pilot-lime-light"
                  >
                    Ver
                  </a>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
