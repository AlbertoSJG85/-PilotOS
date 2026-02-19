import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { routerGlorIA, respuestaAmbigua, Producto } from '../services/gloria.router';
import { manejarMensajePilotOS, manejarFotoPilotOS } from '../handlers/pilotos.handler';
import { enviarMensajeWhatsApp, descargarMediaWhatsApp } from '../services/whatsapp.service';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/webhook/whatsapp
 * Webhook para recibir mensajes de WhatsApp (Meta Business API)
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
    try {
        const { entry } = req.body;

        // Validar estructura de Meta
        if (!entry || !entry[0]?.changes?.[0]?.value?.messages) {
            return res.sendStatus(200); // Acknowledgment sin mensaje
        }

        const value = entry[0].changes[0].value;
        const mensaje = value.messages[0];
        const telefono = mensaje.from;
        const tipoMensaje = mensaje.type; // text, image, document, etc.
        const textoMensaje = mensaje.text?.body || '';

        console.log(`📱 Mensaje de ${telefono} [${tipoMensaje}]: ${textoMensaje || '(media)'}`);

        // Handle image messages (photos)
        if (tipoMensaje === 'image') {
            const mediaId = mensaje.image?.id;
            const caption = mensaje.image?.caption || '';

            if (mediaId) {
                const respuesta = await manejarFotoPilotOS(telefono, mediaId, caption);
                await enviarMensajeWhatsApp(telefono, respuesta);
            }

            return res.sendStatus(200);
        }

        // Get user context from database
        const usuario = await prisma.usuario.findUnique({
            where: { telefono },
            select: { id: true, activo: true }
        });

        const onboarding = await prisma.onboarding.findUnique({
            where: { telefono },
            select: { completado: true }
        });

        const esNuevoUsuario = !usuario;
        const tieneOnboardingCompleto = onboarding?.completado ?? false;

        // Get saved conversation context
        const contextoGuardado = await prisma.conversacionContexto.findUnique({
            where: { telefono }
        }).catch(() => null); // May not exist yet
        const resultado = routerGlorIA(textoMensaje, {
            esNuevoUsuario,
            tieneOnboardingCompleto,
            productoActivo: (contextoGuardado?.productoActivo as Producto) || undefined
        });

        console.log(`🧠 Router: ${resultado.producto} | ${resultado.intent} | ${resultado.confianza}%`);

        let respuesta: string;

        // Si no se puede determinar el producto
        if (resultado.producto === 'DESCONOCIDO') {
            respuesta = respuestaAmbigua();
        }
        // Si necesita confirmación
        else if (resultado.requiereConfirmacion) {
            respuesta = `¿Tu consulta es sobre ${resultado.producto === 'PILOTOS' ? 'taxi' : 'alquileres'}?\n\nResponde SÍ o NO.\n\n— GlorIA · NexOS`;
        }
        // Derivar al producto correspondiente
        else {
            // Save context to database
            await prisma.conversacionContexto.upsert({
                where: { telefono },
                update: {
                    productoActivo: resultado.producto,
                    fase: resultado.fase,
                    ultimoContacto: new Date()
                },
                create: {
                    telefono,
                    productoActivo: resultado.producto,
                    fase: resultado.fase,
                    ultimoContacto: new Date()
                }
            }).catch(() => { }); // Best effort

            if (resultado.producto === 'PILOTOS') {
                respuesta = await manejarMensajePilotOS(telefono, textoMensaje, resultado);
            } else {
                // TODO: Handler de RentOS
                respuesta = `Tu consulta sobre RentOS ha sido recibida. Pronto tendrás respuesta.\n\n— GlorIA · NexOS`;
            }
        }

        // Send response via WhatsApp
        await enviarMensajeWhatsApp(telefono, respuesta);

        // Acknowledgment a Meta
        res.sendStatus(200);

    } catch (error) {
        console.error('Error en webhook WhatsApp:', error);
        res.sendStatus(500);
    }
});

/**
 * GET /api/webhook/whatsapp
 * Verificación del webhook para Meta
 */
router.get('/whatsapp', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'pilotos-verify';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

export default router;
