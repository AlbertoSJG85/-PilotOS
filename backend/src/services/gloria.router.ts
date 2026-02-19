/**
 * GlorIA Router - Sistema de enrutamiento multi-producto
 * 
 * GlorIA es el único agente visible para el usuario.
 * Este router detecta a qué producto pertenece el mensaje
 * y lo deriva al subagente correspondiente.
 */

export type Producto = 'RENTOS' | 'PILOTOS' | 'DESCONOCIDO';

export type Fase = 'LEAD' | 'ONBOARDING' | 'OPS' | 'SUPPORT';

export interface RouterResult {
    producto: Producto;
    fase: Fase;
    intent: string;
    confianza: number;
    requiereConfirmacion: boolean;
}

// Palabras clave por producto
const KEYWORDS_PILOTOS = [
    'taxi', 'taxímetro', 'taximetro', 'parte', 'parte diario',
    'km', 'kilómetros', 'kilometros', 'recaudación', 'recaudacion',
    'datáfono', 'datafono', 'gasoil', 'combustible', 'gasolina',
    'licencia', 'conductor', 'turno', 'carrera', 'servicio',
    'cliente', 'pasajero', 'aeropuerto', 'parada', 'emisora',
    'itv', 'seguro vehiculo', 'mantenimiento coche'
];

const KEYWORDS_RENTOS = [
    'alquiler', 'piso', 'inquilino', 'arrendatario', 'contrato',
    'renta', 'mensualidad', 'recibo', 'fianza', 'depósito',
    'vivienda', 'inmueble', 'propiedad', 'casero', 'propietario'
];

// Intents por producto
const INTENTS_PILOTOS = [
    { pattern: /parte|enviar|subir|registrar/i, intent: 'ENVIAR_PARTE' },
    { pattern: /foto|ticket|recibo/i, intent: 'SUBIR_FOTO' },
    { pattern: /gasto|factura|pago/i, intent: 'REGISTRAR_GASTO' },
    { pattern: /mantenimiento|taller|revision|itv/i, intent: 'MANTENIMIENTO' },
    { pattern: /problema|error|ayuda/i, intent: 'SOPORTE' },
    { pattern: /empezar|registrar|nuevo/i, intent: 'ONBOARDING' },
];

const INTENTS_RENTOS = [
    { pattern: /cobro|pago|recibo/i, intent: 'COBRO' },
    { pattern: /contrato|firma/i, intent: 'CONTRATO' },
    { pattern: /incidencia|problema/i, intent: 'INCIDENCIA' },
];

/**
 * Detecta el producto basado en el mensaje del usuario
 */
export function detectarProducto(mensaje: string): { producto: Producto; confianza: number } {
    const mensajeLower = mensaje.toLowerCase();

    let puntajePilotOS = 0;
    let puntajeRentOS = 0;

    // Contar keywords
    for (const keyword of KEYWORDS_PILOTOS) {
        if (mensajeLower.includes(keyword)) {
            puntajePilotOS += 1;
        }
    }

    for (const keyword of KEYWORDS_RENTOS) {
        if (mensajeLower.includes(keyword)) {
            puntajeRentOS += 1;
        }
    }

    // Determinar producto
    if (puntajePilotOS > puntajeRentOS) {
        return {
            producto: 'PILOTOS',
            confianza: Math.min(100, puntajePilotOS * 20)
        };
    } else if (puntajeRentOS > puntajePilotOS) {
        return {
            producto: 'RENTOS',
            confianza: Math.min(100, puntajeRentOS * 20)
        };
    }

    return { producto: 'DESCONOCIDO', confianza: 0 };
}

/**
 * Detecta el intent del mensaje
 */
export function detectarIntent(mensaje: string, producto: Producto): string {
    const mensajeLower = mensaje.toLowerCase();

    const intents = producto === 'PILOTOS' ? INTENTS_PILOTOS : INTENTS_RENTOS;

    for (const { pattern, intent } of intents) {
        if (pattern.test(mensajeLower)) {
            return intent;
        }
    }

    return 'GENERAL';
}

/**
 * Detecta la fase del usuario
 */
export function detectarFase(
    esNuevoUsuario: boolean,
    tieneOnboardingCompleto: boolean,
    contexto?: { productoActivo?: Producto }
): Fase {
    if (esNuevoUsuario) return 'LEAD';
    if (!tieneOnboardingCompleto) return 'ONBOARDING';
    return 'OPS';
}

/**
 * Router principal de GlorIA
 */
export function routerGlorIA(
    mensaje: string,
    contexto: {
        esNuevoUsuario: boolean;
        tieneOnboardingCompleto: boolean;
        productoActivo?: Producto;
    }
): RouterResult {
    // Si ya hay un producto activo y alta confianza, mantenerlo
    const deteccion = detectarProducto(mensaje);

    let producto = deteccion.producto;
    let confianza = deteccion.confianza;

    // Si no detectamos producto pero hay uno activo, mantenerlo
    if (producto === 'DESCONOCIDO' && contexto.productoActivo) {
        producto = contexto.productoActivo;
        confianza = 50; // Confianza media por contexto
    }

    const fase = detectarFase(
        contexto.esNuevoUsuario,
        contexto.tieneOnboardingCompleto,
        contexto
    );

    const intent = detectarIntent(mensaje, producto);

    return {
        producto,
        fase,
        intent,
        confianza,
        requiereConfirmacion: confianza < 60 && producto !== 'DESCONOCIDO'
    };
}

/**
 * Genera respuesta cuando no se puede determinar el producto
 */
export function respuestaAmbigua(): string {
    return `¡Hola! Soy GlorIA, tu asistente de NexOS.

¿En qué puedo ayudarte?

🚕 **PilotOS** - Gestión de taxi
🏠 **RentOS** - Gestión de alquileres

Escribe sobre qué necesitas ayuda.

— GlorIA · NexOS`;
}
