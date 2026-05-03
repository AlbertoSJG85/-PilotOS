import { apiFetch } from './fetcher';

export interface ResumenDashboard {
    bruto: number;
    datafono: number;
    combustible: number;
    neto: number;
    parte_conductor: number;
    parte_patron: number;
    gastos_variables: number;
    gastos_fijos_prorrateados: number;
    beneficio_estimado: number;
    partes_count: number;
    rango: { desde: string | null; hasta: string | null };
}

interface Filters {
    desde?: string;
    hasta?: string;
}

/** GET /api/dashboard/resumen — cálculo económico centralizado del periodo. */
export async function getResumenDashboard(filters?: Filters): Promise<{ status: string; data: ResumenDashboard }> {
    const params = new URLSearchParams();
    if (filters?.desde) params.set('desde', filters.desde);
    if (filters?.hasta) params.set('hasta', filters.hasta);
    const qs = params.toString();
    return apiFetch(`/api/dashboard/resumen${qs ? `?${qs}` : ''}`);
}
