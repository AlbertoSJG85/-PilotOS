import { apiFetch } from './fetcher';

export interface ResumenDashboard {
    bruto: number;
    datafono: number;
    /** bruto - datafono. Estimación de cobros en efectivo del periodo. */
    efectivo_estimado: number;
    combustible: number;
    neto: number;
    parte_conductor: number;
    parte_patron: number;
    gastos_variables: number;
    gastos_fijos_prorrateados: number;
    /** SS de los asalariados devengada en el periodo (cuota completa por mes). */
    seguridad_social?: number;
    /** Donde se descuenta la SS: eleccion del patron para todos sus asalariados. */
    ss_modo_descuento?: 'parte' | 'cierre';
    /** Desglose por asalariado: genera, reparto, SS, percibe y lo que te queda. */
    asalariados?: { conductor_id: string; nombre: string; partes: number; bruto: number; combustible: number; neto_generado: number; reparto: number; seguridad_social: number; percibe: number; para_el_patron: number }[];
    /** Los dias que ha conducido el propio dueno: integro para el. */
    /** Lo que ingresa el dueno antes de gastos. */
    ingreso_patron?: number;
    patron?: { conductor_id: string; nombre: string; es_patron: boolean; partes: number; bruto: number; combustible: number; neto_generado: number; reparto: number; seguridad_social: number; percibe: number; para_el_patron: number } | null;
    seguridad_social_detalle?: { conductor_id: string; nombre: string; cuota_mensual: number; meses: number; total: number }[];
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
