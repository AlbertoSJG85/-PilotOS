'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export function PeriodFilter() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentPeriod = searchParams.get('periodo') || 'all';

    const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const period = e.target.value;
        const params = new URLSearchParams(searchParams.toString());

        if (period === 'all') {
            params.delete('periodo');
            params.delete('desde');
            params.delete('hasta');
        } else {
            params.set('periodo', period);

            const now = new Date();
            let desde = new Date();
            const hasta = new Date();

            if (period === 'semana') {
                desde.setDate(now.getDate() - 7);
            } else if (period === 'mes') {
                desde.setMonth(now.getMonth() - 1);
            } else if (period === 'trimestre') {
                desde.setMonth(now.getMonth() - 3);
            }

            params.set('desde', desde.toISOString().split('T')[0]);
            params.set('hasta', hasta.toISOString()); // O ISO normal, el backend convierte
        }

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
                <option value="all">Historico</option>
                <option value="semana">Ultimos 7 dias</option>
                <option value="mes">Ultimo mes</option>
                <option value="trimestre">Ultimo trimestre</option>
            </select>
        </div>
    );
}
