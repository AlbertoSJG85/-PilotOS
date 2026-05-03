'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

export type Periodo = 'mes_actual' | 'mes_anterior' | 'semana' | 'all';

const DEFAULT_PERIODO: Periodo = 'mes_actual';

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function toYMD(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Calcula el rango de fechas para un periodo en formato YYYY-MM-DD.
 * - mes_actual: día 1 del mes en curso → hoy
 * - mes_anterior: día 1 del mes pasado → último día del mes pasado
 * - semana: últimos 7 días (rolling) → hoy
 * - all: sin filtro
 */
export function getRangoPeriodo(periodo: Periodo): { desde?: string; hasta?: string } {
    if (periodo === 'all') return {};
    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (periodo === 'mes_actual') {
        const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        return { desde: toYMD(desde), hasta: toYMD(hoy) };
    }
    if (periodo === 'mes_anterior') {
        const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0); // día 0 = último del mes anterior
        return { desde: toYMD(desde), hasta: toYMD(hasta) };
    }
    if (periodo === 'semana') {
        const desde = new Date(hoy);
        desde.setDate(hoy.getDate() - 6); // hoy + 6 días anteriores = 7 días
        return { desde: toYMD(desde), hasta: toYMD(hoy) };
    }
    return {};
}

export function PeriodFilter() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const rawPeriodo = searchParams.get('periodo');
    const currentPeriod: Periodo = (
        rawPeriodo === 'mes_actual' || rawPeriodo === 'mes_anterior' || rawPeriodo === 'semana' || rawPeriodo === 'all'
            ? rawPeriodo
            : DEFAULT_PERIODO
    );

    const initializedRef = useRef(false);

    // Si la URL no trae periodo, escribir el default (mes_actual) y sus fechas.
    useEffect(() => {
        if (initializedRef.current) return;
        if (rawPeriodo) { initializedRef.current = true; return; }
        const params = new URLSearchParams(searchParams.toString());
        const { desde, hasta } = getRangoPeriodo(DEFAULT_PERIODO);
        params.set('periodo', DEFAULT_PERIODO);
        if (desde) params.set('desde', desde);
        if (hasta) params.set('hasta', hasta);
        initializedRef.current = true;
        router.replace(`${pathname}?${params.toString()}`);
    }, [rawPeriodo, pathname, router, searchParams]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const periodo = e.target.value as Periodo;
        const params = new URLSearchParams(searchParams.toString());
        params.set('periodo', periodo);

        const { desde, hasta } = getRangoPeriodo(periodo);
        if (desde) params.set('desde', desde); else params.delete('desde');
        if (hasta) params.set('hasta', hasta); else params.delete('hasta');

        router.replace(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-400">Periodo</span>
            <select
                value={currentPeriod}
                onChange={handleChange}
                className="h-10 items-center justify-between rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-pilot-lime"
            >
                <option value="mes_actual">Mes actual</option>
                <option value="mes_anterior">Mes anterior</option>
                <option value="semana">Últimos 7 días</option>
                <option value="all">Histórico</option>
            </select>
        </div>
    );
}
