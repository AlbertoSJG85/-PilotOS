'use client';

/**
 * Las dos vías del panel del dueño (2026-08-12).
 *
 * Estructura que pidió Alberto: primero las tarjetas GENERALES del negocio
 * (arriba, en la página) y debajo las dos vías en el mismo formato de
 * tarjeta, no en bloques de texto:
 *
 *   VÍA DEL ASALARIADO   lo que genera → su reparto → − Seg. Social → percibe
 *   TU VÍA               lo tuyo íntegro + tu parte de lo suyo → gastos → beneficio
 *
 * Dos decisiones que están detrás de los números y conviene no perder:
 *
 *  · "Lo que genera" es la MISMA cifra que el asalariado ve en su panel como
 *    entregado neto. Si las dos pantallas no coincidieran, cualquier
 *    conversación entre ellos empezaría discutiendo el dato.
 *  · La Seguridad Social vive SOLO en la vía del asalariado: se le descuenta
 *    a él y el dueño la retiene para pagarla. Para el dueño entra y sale, así
 *    que no es un gasto suyo y no aparece en su vía.
 */

import { StatCard } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { UserRound, Wallet, ShieldCheck, HandCoins, Car, Users, Wrench, TrendingUp } from 'lucide-react';

export interface DetallePersona {
  conductor_id: string;
  nombre: string;
  es_patron?: boolean;
  partes: number;
  neto_generado: number;
  reparto: number;
  seguridad_social: number;
  percibe: number;
  para_el_patron: number;
}

function TituloVia({ texto, detalle }: { texto: string; detalle?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{texto}</h2>
      {detalle && <span className="text-xs text-zinc-600">{detalle}</span>}
    </div>
  );
}

export function ViasPanel({
  asalariados, patron, gastos, beneficio, ingresoPatron,
}: {
  asalariados: DetallePersona[];
  patron?: DetallePersona | null;
  gastos: number;
  beneficio: number;
  ingresoPatron: number;
}) {
  const hayAsalariados = asalariados && asalariados.length > 0;
  const deLosAsalariados = asalariados.reduce((acc, a) => acc + a.para_el_patron, 0);

  return (
    <div className="mb-8 space-y-6">
      {/* ── Vía del asalariado ─────────────────────────────────────────── */}
      {hayAsalariados && asalariados.map((a) => (
        <section key={a.conductor_id}>
          <TituloVia texto={a.nombre} detalle={`${a.partes} ${a.partes === 1 ? 'parte' : 'partes'} en el periodo`} />
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
          </div>
        </section>
      ))}

      {/* ── Tu vía ─────────────────────────────────────────────────────── */}
      <section>
        <TituloVia
          texto="Tu parte"
          detalle={patron && patron.partes > 0
            ? `${patron.partes} ${patron.partes === 1 ? 'parte' : 'partes'} conducidos por ti`
            : 'no has conducido en este periodo'}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Lo tuyo, íntegro"
            value={formatCurrency(patron?.reparto ?? 0)}
            subtitle="Lo que trabajas tú no se reparte"
            icon={UserRound}
          />
          <StatCard
            title="De tus asalariados"
            value={formatCurrency(deLosAsalariados)}
            subtitle={hayAsalariados ? 'Tu parte de lo que generan' : 'Sin asalariados'}
            icon={Users}
          />
          <StatCard
            title="Tus gastos"
            value={`− ${formatCurrency(gastos)}`}
            subtitle="Fijos + variables del periodo"
            icon={Wrench}
            variant="danger"
          />
          <StatCard
            title="Tu beneficio"
            value={formatCurrency(beneficio)}
            subtitle={`De ${formatCurrency(ingresoPatron)} ingresados`}
            icon={TrendingUp}
            variant={beneficio >= 0 ? 'success' : 'danger'}
          />
        </div>
      </section>
    </div>
  );
}
