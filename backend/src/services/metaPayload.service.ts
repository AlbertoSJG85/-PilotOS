/**
 * Sombra de envío — Fase E del plan de acción (2026-08-11).
 *
 * Réplica EXACTA (no aproximada) del nodo "Build Meta Payload" del worker
 * n8n `wf-notificaciones-worker-v6.json`, recortada a los tres tipos que
 * PilotOS envía: mantenimiento_proximo, mantenimiento_vencido,
 * anomalia_taximetro. Si el nodo real cambia sus params o su forma de
 * construir el payload, este archivo se queda desincronizado — es la
 * naturaleza de una sombra: observa una copia, no la fuente.
 *
 * Este módulo NUNCA llama a Meta. Solo calcula qué mandaría el backend si
 * hablara con Meta directamente, para guardarlo y compararlo más adelante
 * contra lo que de verdad hizo n8n (cuando exista la conciliación de
 * entregas, Fase A del plan). Mientras tanto, sirve para verificar que el
 * payload que construiríamos es válido y estable — el primer paso real
 * para poder, algún día, desengachar n8n de esta cadena.
 */

const TEMPLATES: Record<string, { name: string; language: string; params: readonly string[] }> = {
    mantenimiento_proximo: { name: 'mantenimiento_proximo', language: 'es', params: ['matricula', 'mantenimiento', 'motivo'] },
    mantenimiento_vencido: { name: 'mantenimiento_vencido', language: 'es', params: ['matricula', 'mantenimiento', 'motivo'] },
    anomalia_taximetro: { name: 'anomalia_taximetro', language: 'es', params: ['matricula', 'motivo'] },
};

export interface MetaPayload {
    messaging_product: 'whatsapp';
    to: string;
    type: 'template';
    template: {
        name: string;
        language: { code: string };
        components: Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }>;
    };
}

export interface ResultadoPayloadMeta {
    ok: boolean;
    error?: string;
    phone_number_id?: string;
    meta_payload?: MetaPayload;
}

interface PrismaConSombra {
    sombraEnvio: { create: (args: any) => Promise<unknown> };
}

/**
 * Registra un intento de envío en la sombra — construye el payload y lo
 * guarda, SIN mandarlo nunca. Nunca lanza: un fallo aquí (payload inválido,
 * BD caída) no debe tocar el envío real, que ya ha ocurrido cuando esto se
 * llama. Acepta cualquier objeto con `.sombraEnvio.create` para poder usarse
 * tanto con el prisma singleton como con el que recibe `procesarMantenimientos`
 * por parámetro.
 */
export async function registrarSombraEnvio(
    prisma: PrismaConSombra,
    avisoId: string | undefined,
    telefono: string,
    tipo: string,
    templateParams: Record<string, unknown>,
): Promise<void> {
    try {
        const resultado = construirPayloadMeta(tipo, telefono, templateParams);
        await prisma.sombraEnvio.create({
            data: {
                aviso_id: avisoId ?? null,
                entrada: { telefono, tipo, template_params: templateParams } as any,
                decision_backend: (resultado.ok ? resultado.meta_payload : { error: resultado.error }) as any,
                alerta: resultado.ok ? null : resultado.error,
            },
        });
    } catch (err: any) {
        console.error('[SOMBRA-ENVIO] Fallo al registrar (no bloquea):', err?.message);
    }
}

/**
 * Construye el payload de Meta tal como lo haría el worker n8n, sin
 * enviarlo. `tipo` fuera del catálogo de PilotOS (los tres de arriba)
 * devuelve `ok:false` — es una señal de que la sombra y la realidad ya no
 * coinciden en algo tan básico como el propio catálogo de tipos.
 */
export function construirPayloadMeta(
    tipo: string,
    telefono: string,
    templateParams: Record<string, unknown>,
): ResultadoPayloadMeta {
    const tpl = TEMPLATES[tipo];
    if (!tpl) {
        return { ok: false, error: `Tipo desconocido para la sombra: ${tipo}` };
    }

    // Mismo criterio que el nodo real: objeto con clave por nombre de
    // parámetro → mapear en el orden de tpl.params, con '' si falta alguno.
    const paramValues = tpl.params.map((p) => String(templateParams?.[p] ?? ''));

    const components = paramValues.length > 0
        ? [{ type: 'body' as const, parameters: paramValues.map((v) => ({ type: 'text' as const, text: v })) }]
        : [];

    return {
        ok: true,
        phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '1058566477336092',
        meta_payload: {
            messaging_product: 'whatsapp',
            to: telefono,
            type: 'template',
            template: { name: tpl.name, language: { code: tpl.language }, components },
        },
    };
}
