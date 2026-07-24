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
 * PENDIENTE (bloqueante para que el envio llegue de verdad, ver informe):
 *   - Configurar GLORIA_API_URL y GLORIA_INTERNAL_TOKEN en el entorno de
 *     PilotOS (Coolify). Sin ellos, esta funcion no intenta la llamada y
 *     deja constancia del motivo en el propio Aviso (ver mantenimientoAlertas.service.ts).
 *   - Registrar y conseguir aprobacion de Meta para las plantillas de
 *     WhatsApp 'mantenimiento_proximo' y 'mantenimiento_vencido' en el
 *     catalogo de plantillas de GlorIA (repo distinto, fuera del alcance de
 *     esta sesion).
 */

export interface EnvioResultado {
    ok: boolean;
    error?: string;
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

        if (!res.ok) {
            const texto = await res.text().catch(() => '');
            return { ok: false, error: `GlorIA respondio ${res.status}: ${texto.slice(0, 200)}` };
        }

        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(timeout);
    }
}
