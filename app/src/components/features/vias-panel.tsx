'use client';

/**
 * La vía del asalariado en el panel del dueño (2026-08-12).
 *
 * Arriba de la página están las tarjetas GENERALES (facturación, combustible,
 * neto, gastos, beneficio): ahí ya está sumado todo, lo del dueño y lo del
 * asalariado. Aquí abajo va SOLO lo del asalariado, en el mismo formato de
 * tarjeta, para poder mirar su lado por separado sin duplicar los totales.
 *
 * Se quitó la fila "Tu parte" que había antes: repetía en pequeño lo que ya
 * dicen las tarjetas de arriba.
 *
 * Dos cosas que están detrás de los números y conviene no perder:
 *
 *  · "Ha generado" es la MISMA cifra que el asalariado ve en su panel como
 *    entregado neto. Si las dos pantallas no coincidieran, cualquier
 *    conversación entre ellos empezaría discutiendo el dato.
 *  · La Seguridad Social vive SOLO aquí: se le descuenta a él de su
 *    liquidación y el dueño la retiene para pagarla. Para el dueño entra y
 *    sale, así que no es un gasto suyo y no aparece en sus tarjetas.
 */

import { StatCard } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { Wallet, ShieldCheck, HandCoins, Car, CreditCard, Banknote } from 'lucide-react';

export interface DetallePersona {
  conductor_id: string;
  nombre: string;
  es_patron?: boolean;
  partes: number;
  bruto: number;
  datafono: number;
  efectivo: number;
  neto_generado: number;
  reparto: number;
  seguridad_social: number;
  percibe: number;
  para_el_patron: number;
}

export function ViasPanel({ asalariados }: { asalariados: DetallePersona[] }) {
  if (!asalariados || asalariados.length === 0) return null;

  return (
    <div className="mb-8 space-y-6">
      {asalariados.map((a) => {
        const pctDatafono = a.bruto > 0 ? Math.round((a.datafono / a.bruto) * 100) : 0;

        return (
          <section key={a.conductor_id}>
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{a.nombre}</h2>
              <span className="text-xs text-zinc-600">
                {a.partes} {a.partes === 1 ? 'parte' : 'partes'} en el periodo
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Ha generado"
                value={formatCurrency(a.neto_generado)}
                subtitle="Bruto − combustible"
                icon={Car}
              />
              <StatCard
                title="Su reparto"
                value={formatCurrency(a.reparto)}
                subtitle="Lo pactado con él"
                icon={Wallet}
              />
              <StatCard
                title="Seguridad Social"
                value={`− ${formatCurrency(a.seguridad_social)}`}
                subtitle="Se le descuenta a él"
                icon={ShieldCheck}
                variant="warning"
              />
              <StatCard
                title="Percibe"
                value={formatCurrency(a.percibe)}
                subtitle="Lo que cobra"
                icon={HandCoins}
                variant={a.percibe >= 0 ? 'success' : 'danger'}
              />

              {/* Cómo ha cobrado ÉL. La barra general de abajo es de los dos
                  juntos, y no sirve para saber si este conductor ha hecho más
                  efectivo o más tarjeta — que es justo lo que hay que vigilar,
                  porque el efectivo es el que entrega en mano. */}
              <StatCard
                title="Su datáfono"
                value={formatCurrency(a.datafono)}
                subtitle={`${pctDatafono}% de lo que ha hecho`}
                icon={CreditCard}
              />
              <StatCard
                title="Su efectivo"
                value={formatCurrency(a.efectivo)}
                subtitle={`${100 - pctDatafono}% · lo que entrega en mano`}
                icon={Banknote}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
