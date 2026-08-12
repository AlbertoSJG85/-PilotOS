/**
 * Envío de correo — PilotOS (2026-08-12).
 *
 * POR QUÉ EXISTE. El código de recuperación de contraseña salía por WhatsApp,
 * y eso ataba una función crítica del producto a que Meta apruebe una
 * plantilla. A 12 de agosto no han aprobado ninguna de las cuatro enviadas a
 * revisión: quien pierde la contraseña hoy depende de que Alberto le edite el
 * hash a mano en la base de datos (ha pasado dos veces). El correo solo
 * necesita credenciales SMTP, que dependen de nosotros.
 *
 * MISMA DECISIÓN QUE NEXOS PAY, y a propósito: `NexOS Pay/src/modules/billing/
 * avisos/enviador-email.ts` llegó a esta conclusión el 2026-08-08 por el mismo
 * motivo. Este módulo repite el enfoque (SMTP inyectable, nunca lanza) en vez
 * de importarlo porque hoy no hay paquete compartido publicado para esto; el
 * día que un tercer producto necesite mandar correo, esto sube a `NexOS/core`
 * y los tres lo consumen. Queda anotado para no olvidarlo.
 *
 * REGLAS:
 *  - Nunca lanza. Un correo que no sale no puede tumbar un endpoint.
 *  - Sin SMTP_URL no envía y lo dice claro en el log, en vez de fallar raro.
 *  - El transporte se inyecta, así que se prueba sin tocar la red.
 */

export interface TransporteCorreo {
    sendMail(opciones: {
        from: string;
        to: string;
        subject: string;
        text: string;
    }): Promise<{ messageId?: string }>;
}

export interface ResultadoEnvioEmail {
    ok: boolean;
    error?: string;
    messageId?: string;
}

export interface OpcionesEmail {
    /** Cadena de conexión SMTP (smtps://usuario:clave@host:465). Sin ella no se envía. */
    smtpUrl?: string;
    /** Remitente. Por defecto, EMAIL_REMITENTE. */
    remitente?: string;
    /** Para pruebas: transporte ya construido, sin red. */
    transporte?: TransporteCorreo;
}

let transporteCache: TransporteCorreo | null = null;

function construirTransporte(smtpUrl: string): TransporteCorreo | null {
    if (transporteCache) return transporteCache;
    try {
        // require perezoso: si nadie manda correo, no se carga nodemailer.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createTransport } = require('nodemailer');
        transporteCache = createTransport(smtpUrl) as TransporteCorreo;
        return transporteCache;
    } catch (err: any) {
        console.error('[EMAIL] No se pudo crear el transporte SMTP:', err?.message);
        return null;
    }
}

/** Un email sintético del onboarding antiguo (telefono@pilotos.app) no existe: no se le puede escribir. */
export function esEmailEntregable(email: string | null | undefined): boolean {
    if (!email) return false;
    const limpio = email.trim().toLowerCase();
    if (!limpio.includes('@') || limpio.length < 5) return false;
    return !limpio.endsWith('@pilotos.app');
}

export async function enviarEmail(
    destinatario: string,
    asunto: string,
    cuerpo: string,
    opciones: OpcionesEmail = {},
): Promise<ResultadoEnvioEmail> {
    const smtpUrl = opciones.smtpUrl ?? process.env.SMTP_URL;
    const remitente = opciones.remitente ?? process.env.EMAIL_REMITENTE ?? 'PilotOS <info@nexostudios.digital>';

    if (!esEmailEntregable(destinatario)) {
        return { ok: false, error: 'destinatario_no_entregable' };
    }
    if (!smtpUrl) {
        console.error('[EMAIL] SMTP_URL sin configurar: no se ha enviado nada a', destinatario);
        return { ok: false, error: 'smtp_no_configurado' };
    }

    const transporte = opciones.transporte ?? construirTransporte(smtpUrl);
    if (!transporte) return { ok: false, error: 'transporte_no_disponible' };

    try {
        const info = await transporte.sendMail({ from: remitente, to: destinatario, subject: asunto, text: cuerpo });
        return { ok: true, messageId: info?.messageId };
    } catch (err: any) {
        console.error('[EMAIL] Fallo al enviar:', err?.message);
        return { ok: false, error: String(err?.message ?? 'error_desconocido').slice(0, 300) };
    }
}

/** Texto del correo con el código de recuperación. Separado para poder probarlo. */
export function cuerpoCodigoRecuperacion(codigo: string, minutos: number): { asunto: string; cuerpo: string } {
    return {
        asunto: 'Tu código para restablecer la contraseña de PilotOS',
        cuerpo: [
            'Has pedido restablecer tu contraseña de PilotOS.',
            '',
            `Tu código es: ${codigo}`,
            '',
            `Caduca en ${minutos} minutos y solo se puede usar una vez.`,
            'Si no has sido tú, ignora este correo: tu contraseña no ha cambiado.',
            '',
            '— PilotOS',
        ].join('\n'),
    };
}
