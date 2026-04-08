'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, Badge, Skeleton } from '@/components/ui';
import { getPartes } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { ParteDiario } from '@/types';

/**
 * Documentos — Muestra los partes que tienen fotos/tickets vinculados.
 * El backend gestiona documentos a traves de la ruta /api/fotos (vinculados a partes).
 * Esta vista lista los partes con sus estados de documentacion.
 */
export default function DocumentosPage() {
  const [partes, setPartes] = useState<ParteDiario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPartes()
      .then((res) => { if (res.data) setPartes(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Documentos" description="Facturas, tickets y archivos vinculados" />
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </>
    );
  }

  const FOTO_STATES = ['FOTO_ILEGIBLE', 'FOTO_SUSTITUIDA'];
  const partesConDocumentos = partes;

  const conIncidenciaFoto = partes.filter((p) => FOTO_STATES.includes(p.estado));

  return (
    <>
      <PageHeader title="Documentos" description="Facturas, tickets y archivos vinculados" />

      {conIncidenciaFoto.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-amber-400">Requieren atencion</h2>
          <div className="space-y-2">
            {conIncidenciaFoto.map((p) => (
              <Card key={p.id} className="flex items-center justify-between gap-4 border-amber-900/50">
                <div>
                  <span className="text-sm font-medium text-zinc-200">{formatDate(p.fecha_trabajada)}</span>
                  {p.vehiculo && <span className="ml-2 text-xs text-zinc-500">{p.vehiculo.matricula}</span>}
                </div>
                <Badge variant={p.estado === 'FOTO_ILEGIBLE' ? 'danger' : 'warning'}>{p.estado}</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Todos los partes ({partesConDocumentos.length})</h2>
        {partesConDocumentos.length === 0 ? (
          <Card className="py-8 text-center text-zinc-500">Sin documentos registrados</Card>
        ) : (
          <div className="space-y-2">
            {partesConDocumentos.map((p) => (
              <Card key={p.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{formatDate(p.fecha_trabajada)}</span>
                    <Badge variant={
                      p.estado === 'VALIDADO' ? 'success' :
                      p.estado === 'FOTO_ILEGIBLE' ? 'danger' :
                      p.estado === 'FOTO_SUSTITUIDA' ? 'warning' :
                      'info'
                    }>{p.estado}</Badge>
                  </div>
                  <div className="mt-1 flex gap-x-3 text-xs text-zinc-500">
                    {p.vehiculo && <span>{p.vehiculo.matricula}</span>}
                    {p.conductor?.usuario && <span>{p.conductor.usuario.nombre}</span>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
