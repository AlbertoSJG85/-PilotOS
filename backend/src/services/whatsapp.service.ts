/**
 * WhatsApp Service — Meta Cloud API
 * 
 * Envía mensajes a través de la WhatsApp Business API de Meta.
 * En desarrollo, los mensajes se loguean en consola.
 */

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`;

const IS_DEV = process.env.NODE_ENV === 'development' || !WHATSAPP_TOKEN || WHATSAPP_TOKEN === 'your-whatsapp-token';

interface WhatsAppResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Send a text message via WhatsApp
 */
export async function enviarMensajeWhatsApp(
    telefono: string,
    mensaje: string
): Promise<WhatsAppResponse> {
    // In development, just log the message
    if (IS_DEV) {
        console.log(`📲 [DEV] WhatsApp → ${telefono}:`);
        console.log(`   ${mensaje.substring(0, 200)}${mensaje.length > 200 ? '...' : ''}`);
        return { success: true, messageId: `dev-${Date.now()}` };
    }

    try {
        const response = await fetch(`${BASE_URL}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: telefono,
                type: 'text',
                text: { body: mensaje },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json() as any;
            console.error('❌ WhatsApp API error:', errorData);
            return {
                success: false,
                error: errorData?.error?.message || `HTTP ${response.status}`,
            };
        }

        const data = await response.json() as any;
        const messageId = data?.messages?.[0]?.id;

        console.log(`✅ WhatsApp enviado a ${telefono}: ${messageId}`);
        return { success: true, messageId };

    } catch (error) {
        console.error('❌ Error enviando WhatsApp:', error);

        // Retry once after 2 seconds
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryResponse = await fetch(`${BASE_URL}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: telefono,
                    type: 'text',
                    text: { body: mensaje },
                }),
            });

            if (retryResponse.ok) {
                const data = await retryResponse.json() as any;
                return { success: true, messageId: data?.messages?.[0]?.id };
            }
        } catch (retryError) {
            console.error('❌ Retry también falló:', retryError);
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

/**
 * Download media from WhatsApp (for receiving photos)
 */
export async function descargarMediaWhatsApp(mediaId: string): Promise<Buffer | null> {
    if (IS_DEV) {
        console.log(`📥 [DEV] Descargando media: ${mediaId}`);
        return null;
    }

    try {
        // Step 1: Get media URL
        const metaResponse = await fetch(
            `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
            {
                headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
            }
        );

        if (!metaResponse.ok) return null;

        const metaData = await metaResponse.json() as any;
        const mediaUrl = metaData.url;

        // Step 2: Download the file
        const fileResponse = await fetch(mediaUrl, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
        });

        if (!fileResponse.ok) return null;

        const arrayBuffer = await fileResponse.arrayBuffer();
        return Buffer.from(arrayBuffer);

    } catch (error) {
        console.error('❌ Error descargando media:', error);
        return null;
    }
}

/**
 * Send notification to patron about anomalies
 */
export async function notificarPatronAnomalias(
    telefonoPatron: string,
    nombreConductor: string,
    totalAnomalias: number,
    motivo: string
): Promise<WhatsAppResponse> {
    const mensaje = `⚠️ *Aviso de Anomalías — PilotOS*

Conductor: ${nombreConductor}
Anomalías acumuladas: ${totalAnomalias}
Motivo: ${motivo}

Revisa el dashboard para más detalles.

— GlorIA · NexOS`;

    return enviarMensajeWhatsApp(telefonoPatron, mensaje);
}

/**
 * Send maintenance alert to patron
 */
export async function notificarPatronMantenimiento(
    telefonoPatron: string,
    matricula: string,
    mantenimiento: string,
    estado: 'PROXIMO' | 'VENCIDO'
): Promise<WhatsAppResponse> {
    const emoji = estado === 'VENCIDO' ? '🔴' : '🟡';
    const mensaje = `${emoji} *Mantenimiento ${estado} — PilotOS*

Vehículo: ${matricula}
Mantenimiento: ${mantenimiento}
Estado: ${estado}

${estado === 'VENCIDO' ? '¡Atención! Este mantenimiento ha superado su límite.' : 'Este mantenimiento está próximo a vencer.'}

— GlorIA · NexOS`;

    return enviarMensajeWhatsApp(telefonoPatron, mensaje);
}
