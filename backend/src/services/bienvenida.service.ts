/**
 * Correos de bienvenida de PilotOS.
 *
 * Se mandan DESPUÉS de dar de alta, fuera de la transacción y sin esperar:
 * un correo que no sale no puede deshacer ni retrasar un alta. Nunca lanzan.
 * El código de activación NO va aquí: sale cuando la persona intenta entrar
 * (auth.routes.ts), que es cuando de verdad lo necesita y es válido 15 minutos.
 */
import { enviarEmail, esEmailEntregable } from './email.service';
import { plantillaBienvenidaAsalariado, plantillaBienvenidaPatron, CorreoPlantilla } from './email-plantillas';

interface Persona {
    nombre?: string | null;
    email?: string | null;
    telefono?: string | null;
}

async function mandar(destino: Persona, plantilla: CorreoPlantilla, etiqueta: string): Promise<boolean> {
    try {
        if (!esEmailEntregable(destino.email)) {
            console.warn(`[BIENVENIDA] ${etiqueta}: sin email entregable (${destino.email}), no se envía.`);
            return false;
        }
        const r = await enviarEmail(destino.email!, plantilla.asunto, plantilla.cuerpo, { html: plantilla.html });
        if (!r.ok) console.warn(`[BIENVENIDA] ${etiqueta}: no se pudo enviar (${r.error}).`);
        return r.ok;
    } catch (err: any) {
        console.warn(`[BIENVENIDA] ${etiqueta}: fallo inesperado:`, err?.message);
        return false;
    }
}

/** Alta de un cliente nuevo: bienvenida al patrón y a cada asalariado dado de alta con él. */
export async function enviarBienvenidasOnboarding(patron: Persona, asalariados: Persona[]): Promise<void> {
    const nombresEquipo = asalariados.map((a) => a.nombre || 'Conductor');
    await Promise.all([
        mandar(patron, plantillaBienvenidaPatron({
            nombre: patron.nombre || '', telefono: patron.telefono || '', asalariados: nombresEquipo,
        }), 'patron'),
        ...asalariados.map((a) => enviarBienvenidaAsalariado(a, patron.nombre || '')),
    ]);
}

/** Un asalariado dado de alta (con el cliente nuevo o después, por el patrón). */
export async function enviarBienvenidaAsalariado(asalariado: Persona, nombreResponsable: string): Promise<boolean> {
    return mandar(asalariado, plantillaBienvenidaAsalariado({
        nombre: asalariado.nombre || '', telefono: asalariado.telefono || '', responsable: nombreResponsable,
    }), 'asalariado');
}
