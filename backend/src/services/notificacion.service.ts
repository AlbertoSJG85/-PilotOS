/**
 * Servicio de notificaciones — Fase 6 auditoria seguridad (2026-07-24).
 *
 * Envia avisos de PilotOS al patron via GlorIA, llamando DIRECTAMENTE al
 * endpoint backend-a-backend `POST {GLORIA_API_URL}/api/gloria/enviar`
 * (mismo endpoint que ya usa RentOS, protegido por x-internal-token — misma
 * convencion que /internal en este mismo backend). Decision explicita de
 * Alberto: esta automatizacion se resuelve en backend, SIN crear workflows
 * de n8n nuevos en PilotOS. Lo que GlorIA haga internamente para entregar el
 * mensaje (encolar, plantilla Meta, etc.) es responsabilidad de GlorIA.
 *
 * ── SIN n8n desde 2026-08-11 ──────────────────────────────────────────────
 * GlorIA ya no encola lo que viene de PilotOS: manda a Meta en el acto
 * (`origin: 'pilotos'` -> MetaSender.ts). Dos consecuencias practicas:
 *   1. El aviso sale al instante, no hasta 30 min despues.
 *   2. `ok: true` significa que META ACEPTO el mensaje, no que quedara
 *      encolado. Antes marcabamos "enviado" a ciegas y podia fallar despues
 *      sin que nadie se enterara.
 * A cambio, las dos protecciones que daba la cola son ahora nuestras:
 * dedupe (Aviso.dedupe_key) y reintento (revertir el escalon si falla, ver
 * mantenimientoAlertas.service.ts).
 *
 * Estado de produccion (verificado 2026-08-11): GLORIA_API_URL y
 * GLORIA_INTERNAL_TOKEN configuradas y la llamada autentica correctamente.
 * Queda que Meta apruebe las plantillas 'mantenimiento_proximo',
 * 'mantenimiento_vencido' y 'anomalia_taximetro' (enviadas a revision).
 */

export interface EnvioResultado {
    ok: boolean;
    error?: string;
    /** 'ENVIADO' (directo a Meta) | 'PENDIENTE' (encolado, camino antiguo). */
    estado?: string;
    /** wamid de Meta cuando el envio fue directo. */
    message_id?: string;
}

/**
 * Aviso al patron por los DOS canales (2026-08-12).
 *
 * Por que dos: el WhatsApp depende de que Meta apruebe la plantilla, y a 12
 * de agosto no habian aprobado ninguna de las cuatro enviadas a revision. Es
 * decir, todos los avisos criticos de PilotOS (mantenimiento vencido, anomalia
 * en el taximetro) llevaban semanas sin llegarle a nadie. El correo no depende
 * de terceros, asi que pasa a ser el canal que garantiza la entrega y el
 * WhatsApp queda como el canal que se ve antes cuando funciona.
 *
 * El aviso cuenta como ENTREGADO si sale por CUALQUIERA de los dos. Si fallan
 * los dos, se devuelven los dos motivos: son problemas distintos y se arreglan
 * distinto.
 */
export interface EnvioMulticanal {
    ok: boolean;
    whatsapp: { ok: boolean; error?: string };
    email: { ok: boolean; error?: string };
    error?: string;
}

export async function avisarPatron(destino: {
    telefono?: string | null;
    email?: string | null;
}, mensaje: {
    tipo: string;
    template_params: Record<string, unknown>;
    asunto: string;
    cuerpo: string;
}): Promise<EnvioMulticanal> {
    const { enviarEmail, esEmailEntregable } = await import('./email.service');

    const [whatsapp, email] = await Promise.all([
        destino.telefono
            ? enviarAvisoGloria(destino.telefono, mensaje.tipo, mensaje.template_params)
            : Promise.resolve({ ok: false, error: 'sin telefono' } as EnvioResultado),
        esEmailEntregable(destino.email)
            ? enviarEmail(destino.email!, mensaje.asunto, mensaje.cuerpo)
            : Promise.resolve({ ok: false, error: 'sin email entregable' }),
    ]);

    const ok = whatsapp.ok || email.ok;
    return {
        ok,
        whatsapp: { ok: whatsapp.ok, error: whatsapp.error },
        email: { ok: email.ok, error: email.error },
        error: ok ? undefined : `whatsapp: ${whatsapp.error ?? '?'} | email: ${email.error ?? '?'}`.slice(0, 300),
    };
}

const TIMEOUT_MS = 8000;

export async function enviarAvisoGloria(
    telefono: string,
    tipo: string,
    template_params: Record<string, unknown>,
): Promise<EnvioResultado> {
    const baseUrl = process.env.GLORIA_API_URL;
    const token = process.env.GLORIA_INTERNAL_TOKEN;

    if (!baseUrl || !token) {
        return { ok: false, error: 'GLORIA_API_URL/GLORIA_INTERNAL_TOKEN no configurados' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/gloria/enviar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-token': token,
            },
            body: JSON.stringify({
                phone: telefono,
                tipo,
                template_params,
                origin: 'pilotos',
            }),
            signal: controller.signal,
        });

        const cuerpo: any = await res.json().catch(() => ({}));

        if (!res.ok) {
            // GlorIA devuelve 502 + {status:'FALLIDO', error, codigo_meta}
            // cuando Meta rechaza el envio directo. El motivo real importa:
            // "plantilla no aprobada" y "token caducado" se arreglan distinto.
            const motivo = cuerpo?.error || `HTTP ${res.status}`;
            const codigo = cuerpo?.codigo_meta ? ` (meta:${cuerpo.codigo_meta})` : '';
            return { ok: false, error: `${motivo}${codigo}`.slice(0, 300) };
        }

        // Camino directo (el de PilotOS): 'ENVIADO' = Meta lo acepto de verdad.
        // Camino en cola (RentOS): 'PENDIENTE' = solo encolado; 'DEDUPED' = descartado.
        // Un DEDUPED NO es un exito: el mensaje no ha salido.
        if (cuerpo?.status === 'DEDUPED') {
            return { ok: false, error: 'DEDUPED: GlorIA descarto el mensaje por duplicado' };
        }

        return { ok: true, estado: cuerpo?.status, message_id: cuerpo?.message_id };
    } catch (err: any) {
        return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(timeout);
    }
}
