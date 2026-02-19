import { PrismaClient } from '@prisma/client';
import { RouterResult } from '../services/gloria.router';
import { descargarMediaWhatsApp } from '../services/whatsapp.service';
import { extraerTextoImagen, validarTicketTaximetro, validarTicketGasoil } from '../services/ocr.service';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Handler de mensajes para PilotOS
 * Procesa los intents detectados por el router
 */
export async function manejarMensajePilotOS(
    telefono: string,
    mensaje: string,
    router: RouterResult
): Promise<string> {
    const { intent, fase } = router;

    // Buscar usuario por teléfono
    const usuario = await prisma.usuario.findUnique({
        where: { telefono },
        include: {
            vehiculosAsignados: { include: { vehiculo: true } },
            anomalias: { take: 5, orderBy: { createdAt: 'desc' } }
        }
    });

    // Usuario nuevo → Onboarding
    if (!usuario) {
        return `¡Bienvenido a PilotOS! 🚕

Para empezar, necesito configurar tu cuenta.

👉 Haz clic aquí para completar tus datos:
${process.env.APP_URL || 'https://pilotos.nexos.dev'}/onboarding?tel=${encodeURIComponent(telefono)}

Solo te llevará unos minutos.

— GlorIA · NexOS`;
    }

    // Procesar según intent
    switch (intent) {
        case 'ENVIAR_PARTE':
            return manejarEnviarParte(usuario);

        case 'SUBIR_FOTO':
            return manejarSubirFoto(usuario);

        case 'REGISTRAR_GASTO':
            return manejarRegistrarGasto();

        case 'MANTENIMIENTO':
            return await manejarMantenimiento(usuario);

        case 'SOPORTE':
            return manejarSoporte();

        case 'ONBOARDING':
            return `Tu cuenta ya está configurada ✅

Para enviar tu parte diario, usa la app:
${process.env.APP_URL || 'https://pilotos.nexos.dev'}/parte

— GlorIA · NexOS`;

        default:
            return manejarGeneral(usuario);
    }
}

/**
 * Handler de fotos recibidas por WhatsApp
 * Descarga la imagen, la procesa con OCR, y la vincula al parte activo
 */
export async function manejarFotoPilotOS(
    telefono: string,
    mediaId: string,
    caption: string
): Promise<string> {
    const usuario = await prisma.usuario.findUnique({
        where: { telefono },
        include: {
            vehiculosAsignados: {
                where: { activo: true },
                include: { vehiculo: true }
            }
        }
    });

    if (!usuario) {
        return `No tienes cuenta en PilotOS. Primero completa el registro.\n\n— GlorIA · NexOS`;
    }

    // Check for pending tasks (R-FT-006)
    const tareaPendiente = await prisma.tareaPendiente.findFirst({
        where: { conductorId: usuario.id, resuelta: false, tipo: 'FOTO_ILEGIBLE' }
    });

    // Download image from WhatsApp
    const imageBuffer = await descargarMediaWhatsApp(mediaId);
    if (!imageBuffer) {
        return `📸 No pude descargar la imagen. ¿Puedes enviarla de nuevo?\n\n— GlorIA · NexOS`;
    }

    // Save image
    const fileName = `${Date.now()}-${usuario.id}.jpg`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, imageBuffer);

    // Determine photo type from caption
    const captionLower = caption.toLowerCase();
    let tipo: string = 'TAXIMETRO';
    if (captionLower.includes('gasoil') || captionLower.includes('gasolina') ||
        captionLower.includes('combustible') || captionLower.includes('repost')) {
        tipo = 'GASOIL';
    }

    // Run OCR
    const ocrResult = await extraerTextoImagen(filePath);
    const validacion = tipo === 'TAXIMETRO'
        ? validarTicketTaximetro(ocrResult.texto)
        : validarTicketGasoil(ocrResult.texto);

    // If replacing an existing ilegible photo
    if (tareaPendiente) {
        const fotoExistente = await prisma.fotoTicket.findUnique({
            where: { id: tareaPendiente.entidadId }
        });

        if (fotoExistente) {
            const nuevoEstado = ocrResult.legible && validacion.valido ? 'REEMPLAZADA' : 'ILEGIBLE';

            await prisma.fotoHistorial.create({
                data: { fotoId: fotoExistente.id, urlAnterior: fotoExistente.url, motivo: 'Reemplazo vía WhatsApp' }
            });

            await prisma.fotoTicket.update({
                where: { id: fotoExistente.id },
                data: { url: filePath, estado: nuevoEstado, ocrTexto: ocrResult.texto, ocrConfianza: ocrResult.confianza, intentosReemplazo: { increment: 1 } }
            });

            if (nuevoEstado === 'REEMPLAZADA') {
                await prisma.tareaPendiente.update({
                    where: { id: tareaPendiente.id },
                    data: { resuelta: true, resolvedAt: new Date() }
                });
                return `✅ Foto reemplazada correctamente.${validacion.importe ? `\n💰 Importe: ${validacion.importe}€` : ''}\n\n— GlorIA · NexOS`;
            }
            return `📸 La nueva foto tampoco es legible. Intenta con mejor iluminación.\n\n— GlorIA · NexOS`;
        }
    }

    // Find most recent parte
    const vehiculoAsignado = usuario.vehiculosAsignados[0];
    if (!vehiculoAsignado) {
        return `No tienes vehículo asignado. Contacta con tu patrón.\n\n— GlorIA · NexOS`;
    }

    const parteReciente = await prisma.parteDiario.findFirst({
        where: { conductorId: usuario.id, vehiculoId: vehiculoAsignado.vehiculoId },
        orderBy: { createdAt: 'desc' }
    });

    if (!parteReciente) {
        return `📸 Foto recibida, pero no tienes un parte diario activo.\n\n👉 ${process.env.APP_URL || 'https://pilotos.nexos.dev'}/parte\n\n— GlorIA · NexOS`;
    }

    const estado = ocrResult.legible && validacion.valido ? 'VALIDA' : 'ILEGIBLE';

    const foto = await prisma.fotoTicket.create({
        data: { parteDiarioId: parteReciente.id, tipo, url: filePath, estado, ocrTexto: ocrResult.texto, ocrConfianza: ocrResult.confianza, intentosReemplazo: 0 }
    });

    if (estado === 'ILEGIBLE') {
        await prisma.tareaPendiente.create({
            data: { tipo: 'FOTO_ILEGIBLE', entidadId: foto.id, conductorId: usuario.id }
        });
        return `📸 La foto no es legible. Envía otra con mejor iluminación. Tienes 2 intentos.\n\n— GlorIA · NexOS`;
    }

    return `✅ Foto de ${tipo === 'TAXIMETRO' ? 'taxímetro' : 'gasoil'} procesada.${validacion.importe ? `\n💰 Importe: ${validacion.importe}€` : ''}\n\nVinculada al parte del ${parteReciente.fechaTrabajada.toLocaleDateString('es-ES')}.\n\n— GlorIA · NexOS`;
}

function manejarEnviarParte(usuario: any): string {
    return `📝 Para enviar tu parte diario:

1. Abre la app del parte diario
2. Rellena km, ingresos y datáfono
3. Sube la foto del ticket

👉 ${process.env.APP_URL || 'https://pilotos.nexos.dev'}/parte

Recuerda: una vez enviado, no se puede modificar.

— GlorIA · NexOS`;
}

function manejarSubirFoto(usuario: any): string {
    return `📸 Envíame la foto del ticket directamente aquí.

Acepto:
• Ticket de taxímetro
• Ticket de gasoil (si repostaste)
• Facturas de mantenimiento

Solo envía la imagen, yo la proceso.

— GlorIA · NexOS`;
}

function manejarRegistrarGasto(): string {
    return `💰 Para registrar un gasto:

1. Envíame la foto de la factura o ticket
2. Dime de qué tipo es (mantenimiento, seguro, etc.)
3. Yo lo clasifico automáticamente

Puedes enviarme la imagen ahora mismo.

— GlorIA · NexOS`;
}

async function manejarMantenimiento(usuario: any): Promise<string> {
    // Obtener vehículo del usuario
    const vehiculoAsignado = usuario.vehiculosAsignados[0];
    if (!vehiculoAsignado) {
        return `No tienes ningún vehículo asignado. Contacta con tu patrón para que te asigne uno.\n\n— GlorIA · NexOS`;
    }

    // Buscar próximos mantenimientos
    const proximos = await prisma.mantenimientoVehiculo.findMany({
        where: {
            vehiculoId: vehiculoAsignado.vehiculoId,
            estado: { in: ['PENDIENTE', 'VENCIDO'] }
        },
        include: { catalogo: true },
        take: 3
    });

    if (proximos.length === 0) {
        return `✅ Tu vehículo ${vehiculoAsignado.vehiculo.matricula} está al día.

No tienes mantenimientos pendientes.

— GlorIA · NexOS`;
    }

    let mensaje = `🔧 Mantenimientos pendientes (${vehiculoAsignado.vehiculo.matricula}):\n\n`;

    for (const m of proximos) {
        const estado = m.estado === 'VENCIDO' ? '⚠️' : '🔶';
        mensaje += `${estado} ${m.catalogo.nombre}\n`;
        if (m.proximoKm) {
            mensaje += `   📍 A los ${m.proximoKm.toLocaleString()} km\n`;
        }
        if (m.proximaFecha) {
            mensaje += `   📅 ${m.proximaFecha.toLocaleDateString('es-ES')}\n`;
        }
        mensaje += '\n';
    }

    mensaje += `Cuando lo hagas, envíame la factura y lo marco como resuelto.\n\n— GlorIA · NexOS`;

    return mensaje;
}

function manejarSoporte(): string {
    return `🆘 ¿Necesitas ayuda?

Dime qué problema tienes y te ayudo:
• Problemas con el parte diario
• Fotos que no se suben
• Errores en los datos
• Dudas sobre mantenimientos

Describe tu problema y busco solución.

— GlorIA · NexOS`;
}

function manejarGeneral(usuario: any): string {
    return `Hola ${usuario.nombre} 👋

¿En qué puedo ayudarte hoy?

📝 **Parte** - Enviar parte diario
💰 **Gasto** - Registrar factura
🔧 **Mantenimiento** - Ver pendientes
📸 **Foto** - Subir ticket

Escribe lo que necesitas.

— GlorIA · NexOS`;
}
