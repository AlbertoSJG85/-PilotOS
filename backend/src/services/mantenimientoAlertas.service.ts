/**
 * Motor de alertas de mantenimiento — Fase 6 auditoria seguridad (2026-07-24).
 *
 * Sustituye al scheduler antiguo, que:
 *   - solo detectaba 1000km / 30 dias antes del vencimiento (faltaban 500,
 *     250 y los recordatorios posteriores al vencimiento);
 *   - marcaba "alertas enviadas" en el log sin enviar nada (los puntos de
 *     envio eran TODO);
 *   - no registraba que umbral ya se habia notificado, asi que si se
 *     conectara el envio real habria mandado el mismo aviso cada dia.
 *
 * Este modulo expone funciones PURAS de calculo de nivel (testeables sin BD)
 * y una funcion de orquestacion que lee vehiculos/mantenimientos, decide si
 * hay que avisar, y llama a notificacion.service.ts para el envio real.
 *
 * M8 (2026-07-24): las preferencias de aviso ahora se leen de verdad desde
 * Cliente.preferencias_avisos (ver resolverPreferenciasAvisos). Antes ese
 * campo solo existia, sin forma definida, en Onboarding, y ningun sitio del
 * codigo lo leia ni lo escribia.
 */
import { PrismaClient } from '@prisma/client';
import { avisarPatron } from './notificacion.service';

// ── Escalones por defecto ───────────────────────────────────────────────
// Km: 1000/500/250 antes de vencer (explicitos en el informe), y cada 250km
// de mas una vez vencido. Dias: 30 antes de vencer (el unico umbral
// explicito del informe para fechas); el intervalo de recordatorio tras
// vencer (15 dias) es un valor por defecto razonable. Ambos son ahora
// sobreescribibles por cliente via preferencias_avisos.
const UMBRALES_KM_PROXIMO_DEFAULT = [1000, 500, 250];
const INTERVALO_KM_VENCIDO_DEFAULT = 250;
const UMBRAL_DIAS_PROXIMO_DEFAULT = 30;
const INTERVALO_DIAS_VENCIDO_DEFAULT = 15;

export interface PreferenciasAvisos {
    /** 'ninguno' silencia el envio real pero sigue actualizando estado/dedupe internamente. */
    canal: 'whatsapp' | 'ninguno';
    /** Milestones descendentes, p.ej. [1000, 500, 250]. El primero es el umbral "aviso lejano". */
    umbralesKmProximo: number[];
    intervaloKmVencido: number;
    umbralDiasProximo: number;
    intervaloDiasVencido: number;
}

const DEFAULT_PREFERENCIAS: PreferenciasAvisos = {
    canal: 'whatsapp',
    umbralesKmProximo: UMBRALES_KM_PROXIMO_DEFAULT,
    intervaloKmVencido: INTERVALO_KM_VENCIDO_DEFAULT,
    umbralDiasProximo: UMBRAL_DIAS_PROXIMO_DEFAULT,
    intervaloDiasVencido: INTERVALO_DIAS_VENCIDO_DEFAULT,
};

function clampEntero(valor: unknown, min: number, max: number, fallback: number): number {
    const n = Number(valor);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return fallback;
    return n;
}

/**
 * Convierte el Json crudo de Cliente.preferencias_avisos en preferencias
 * validas, con valores por defecto para cualquier campo ausente o
 * invalido. Nunca lanza: un JSON corrupto o con tipos raros simplemente
 * cae a los valores por defecto (los mismos que se usaban antes de M8).
 */
export function resolverPreferenciasAvisos(raw: unknown): PreferenciasAvisos {
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFERENCIAS;
    const r = raw as Record<string, unknown>;

    const canal: PreferenciasAvisos['canal'] = r.canal === 'ninguno' ? 'ninguno' : 'whatsapp';

    let umbralesKmProximo = DEFAULT_PREFERENCIAS.umbralesKmProximo;
    if (Array.isArray(r.umbralesKmProximo) && r.umbralesKmProximo.length > 0) {
        const limpio = r.umbralesKmProximo
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n > 0)
            .sort((a, b) => b - a);
        if (limpio.length > 0) umbralesKmProximo = limpio;
    }

    return {
        canal,
        umbralesKmProximo,
        intervaloKmVencido: clampEntero(r.intervaloKmVencido, 1, 100000, DEFAULT_PREFERENCIAS.intervaloKmVencido),
        umbralDiasProximo: clampEntero(r.umbralDiasProximo, 1, 3650, DEFAULT_PREFERENCIAS.umbralDiasProximo),
        intervaloDiasVencido: clampEntero(r.intervaloDiasVencido, 1, 3650, DEFAULT_PREFERENCIAS.intervaloDiasVencido),
    };
}

/**
 * Nivel de urgencia por kilometraje. deltaKm = proximo_km - km_actuales
 * (positivo = km que faltan; 0 o negativo = km de exceso sobre el vencimiento).
 * Nivel mas alto = menos urgente; null = todavia no hay que avisar.
 * Los niveles de "vencido" son 0, -250, -500... (multiplos del intervalo,
 * nunca positivos), por lo que siempre comparan como "mas urgentes" que
 * cualquier milestone positivo.
 */
export function calcularNivelKm(
    deltaKm: number,
    opts: { umbralesProximo?: number[]; intervaloVencido?: number } = {},
): number | null {
    const umbrales = opts.umbralesProximo ?? UMBRALES_KM_PROXIMO_DEFAULT;
    const intervalo = opts.intervaloVencido ?? INTERVALO_KM_VENCIDO_DEFAULT;

    if (deltaKm > umbrales[0]) return null;
    for (let i = 0; i < umbrales.length; i++) {
        const siguienteMenor = umbrales[i + 1] ?? 0;
        if (deltaKm > siguienteMenor) return umbrales[i];
    }
    // Vencido: bucket de `intervalo` en `intervalo` (0, -intervalo, -2*intervalo...)
    // "|| 0" normaliza -0 a 0 (-0 es falsy en JS): mismo valor numerico, pero
    // evita que un mensaje o comparacion muestre "-0" de forma confusa.
    return (-Math.floor(-deltaKm / intervalo) * intervalo) || 0;
}

/** Igual que calcularNivelKm pero para dias restantes hasta la fecha de vencimiento (un solo milestone "proximo"). */
export function calcularNivelDias(
    deltaDias: number,
    opts: { umbralProximo?: number; intervaloVencido?: number } = {},
): number | null {
    const umbral = opts.umbralProximo ?? UMBRAL_DIAS_PROXIMO_DEFAULT;
    const intervalo = opts.intervaloVencido ?? INTERVALO_DIAS_VENCIDO_DEFAULT;

    if (deltaDias > umbral) return null;
    if (deltaDias > 0) return umbral;
    return (-Math.floor(-deltaDias / intervalo) * intervalo) || 0;
}

/** true si un nivel recien calculado es mas urgente que el ultimo notificado (o si nunca se notifico). */
export function esMasUrgente(nivelNuevo: number | null, ultimoNotificado: number | null): boolean {
    if (nivelNuevo === null) return false;
    if (ultimoNotificado === null) return true;
    return nivelNuevo < ultimoNotificado;
}

interface ProcesarResultado {
    evaluados: number;
    avisosCreados: number;
    avisosEnviados: number;
    avisosFallidos: number;
    avisosSilenciados: number;
}

/**
 * Recorre todos los mantenimientos activos en estado PENDIENTE/VENCIDO,
 * decide si algun umbral nuevo (km o fecha) se ha cruzado, y si es asi:
 *   1. Reserva el nivel con un update optimista (WHERE incluye los valores
 *      leidos) — si otra instancia del backend ya proceso este mismo
 *      mantenimiento en paralelo, el update afecta 0 filas y se salta sin
 *      duplicar el aviso. Sustituye a un lock distribuido explicito (M7).
 *   2. Si el cliente no ha silenciado los avisos (canal !== 'ninguno'),
 *      crea un registro Aviso (trazabilidad, M12) e intenta el envio real
 *      via GlorIA. Si esta silenciado, el nivel se registra igualmente
 *      (para no acumular una avalancha de avisos atrasados si el cliente
 *      reactiva el canal despues) pero no se crea Aviso ni se envia nada.
 */
export async function procesarMantenimientos(
    prisma: PrismaClient,
    puedeProcesarCliente: (patronId: number) => Promise<boolean> = async () => true,
): Promise<ProcesarResultado> {
    const ahora = new Date();
    const resultado: ProcesarResultado = { evaluados: 0, avisosCreados: 0, avisosEnviados: 0, avisosFallidos: 0, avisosSilenciados: 0 };

    // Sin NINGUN canal configurado no se puede enviar nada. Salimos antes de
    // recorrer la flota: si siguieramos, cada mantenimiento reservaria su
    // escalon, el envio fallaria y -- aunque ahora revertimos -- estariamos
    // haciendo trabajo inutil y llenando la tabla de avisos fallidos en cada
    // pasada diaria. Es un fallo de despliegue, no de datos: que se vea.
    //
    // 2026-08-12: basta con UNO de los dos. Antes se exigia GlorIA, asi que un
    // despliegue con correo y sin WhatsApp no habria avisado de nada.
    const hayWhatsapp = !!(process.env.GLORIA_API_URL && process.env.GLORIA_INTERNAL_TOKEN);
    const hayEmail = !!process.env.SMTP_URL;
    if (!hayWhatsapp && !hayEmail) {
        console.error('[MANTENIMIENTOS] Sin canal de aviso (falta GLORIA_API_URL/GLORIA_INTERNAL_TOKEN y SMTP_URL): no se procesa nada.');
        return resultado;
    }

    const vehiculos = await prisma.vehiculo.findMany({
        where: { activo: true },
        include: {
            cliente: { include: { patron: true } },
            mantenimientos: {
                where: { activo: true, estado: { in: ['PENDIENTE', 'VENCIDO'] } },
                include: { catalogo: true },
            },
        },
    });

    for (const vehiculo of vehiculos) {
        const patron = vehiculo.cliente?.patron;
        // Sin ninguno de los dos canales no hay a quien avisar (2026-08-12).
        if (!patron?.telefono && !patron?.email) continue;
        if (!(await puedeProcesarCliente(patron.id))) continue;

        const prefs = resolverPreferenciasAvisos(vehiculo.cliente?.preferencias_avisos);

        for (const mant of vehiculo.mantenimientos) {
            resultado.evaluados++;

            const deltaKm = mant.proximo_km != null ? mant.proximo_km - vehiculo.km_actuales : null;
            const deltaDias = mant.proxima_fecha != null
                ? Math.floor((mant.proxima_fecha.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000))
                : null;

            const vencido = (deltaKm !== null && deltaKm <= 0) || (deltaDias !== null && deltaDias <= 0);
            const nuevoEstado = vencido ? 'VENCIDO' : mant.estado;

            const nivelKm = deltaKm !== null
                ? calcularNivelKm(deltaKm, { umbralesProximo: prefs.umbralesKmProximo, intervaloVencido: prefs.intervaloKmVencido })
                : null;
            const nivelDias = deltaDias !== null
                ? calcularNivelDias(deltaDias, { umbralProximo: prefs.umbralDiasProximo, intervaloVencido: prefs.intervaloDiasVencido })
                : null;

            const avisarKm = esMasUrgente(nivelKm, mant.ultimo_nivel_aviso_km);
            const avisarDias = esMasUrgente(nivelDias, mant.ultimo_nivel_aviso_dias);

            if (!avisarKm && !avisarDias && nuevoEstado === mant.estado) {
                continue; // nada que hacer para este mantenimiento
            }

            // Reserva optimista: solo avanza si nadie ha tocado este registro
            // desde que lo leimos (protege contra 2+ replicas del backend).
            const reserva = await prisma.mantenimientoVehiculo.updateMany({
                where: {
                    id: mant.id,
                    estado: mant.estado,
                    ultimo_nivel_aviso_km: mant.ultimo_nivel_aviso_km,
                    ultimo_nivel_aviso_dias: mant.ultimo_nivel_aviso_dias,
                },
                data: {
                    estado: nuevoEstado,
                    ...(avisarKm ? { ultimo_nivel_aviso_km: nivelKm } : {}),
                    ...(avisarDias ? { ultimo_nivel_aviso_dias: nivelDias } : {}),
                },
            });
            if (reserva.count === 0) continue; // otra instancia ya lo proceso

            if (!avisarKm && !avisarDias) continue; // solo cambio de estado, sin aviso nuevo

            if (prefs.canal === 'ninguno') {
                // El cliente ha silenciado los avisos: el nivel ya quedo
                // reservado arriba (para no acumular escalones perdidos si
                // reactiva el canal), pero no se crea Aviso ni se envia nada.
                resultado.avisosSilenciados++;
                continue;
            }

            const motivoKm = avisarKm
                ? (nivelKm! > 0 ? `Quedan ${nivelKm} km o menos` : `Vencido por km (exceso ≥ ${-nivelKm!} km)`)
                : null;
            const motivoDias = avisarDias
                ? (nivelDias! > 0 ? `Quedan ${nivelDias} dias o menos` : `Vencido por fecha (exceso ≥ ${-nivelDias!} dias)`)
                : null;
            const titulo = `${vencido ? 'Mantenimiento VENCIDO' : 'Mantenimiento proximo'}: ${mant.catalogo.nombre}`;
            const mensaje = [
                `Vehiculo ${vehiculo.matricula}: ${mant.catalogo.nombre}.`,
                motivoKm,
                motivoDias,
            ].filter(Boolean).join(' ');

            // Dedupe propio: desde que enviamos directo a Meta (sin la cola
            // de n8n) la deduplicacion es nuestra. Clave por hecho avisado,
            // no por fecha, para que un reintento manana reutilice esta fila.
            const nivelEfectivo = avisarKm ? `km${nivelKm}` : `d${nivelDias}`;
            const dedupeKey = `pilotos:mant:${mant.id}:${nivelEfectivo}`;

            const previo = await prisma.aviso.findUnique({ where: { dedupe_key: dedupeKey } });
            if (previo?.enviado) continue; // ya se aviso de este escalon, nada que hacer

            const aviso = previo ?? await prisma.aviso.create({
                data: {
                    cliente_id: vehiculo.cliente_id,
                    tipo: 'MANTENIMIENTO',
                    titulo,
                    mensaje,
                    entidad_tipo: 'MANTENIMIENTO_VEHICULO',
                    entidad_id: mant.id,
                    canal: 'whatsapp+email',
                    intentos: 0,
                    dedupe_key: dedupeKey,
                },
            });
            if (!previo) resultado.avisosCreados++;

            const tipoAviso = vencido ? 'mantenimiento_vencido' : 'mantenimiento_proximo';
            const templateParams = { matricula: vehiculo.matricula, mantenimiento: mant.catalogo.nombre, motivo: motivoKm ?? motivoDias ?? '' };

            // Los dos canales (2026-08-12): el WhatsApp sigue dependiendo de
            // que Meta apruebe la plantilla, el correo no depende de nadie.
            const envio = await avisarPatron(
                { telefono: patron.telefono, email: patron.email },
                {
                    tipo: tipoAviso,
                    template_params: templateParams,
                    asunto: `PilotOS · ${titulo}`,
                    cuerpo: [
                        mensaje,
                        '',
                        vencido
                            ? 'Está vencido: conviene resolverlo cuanto antes.'
                            : 'Todavía no ha vencido, pero queda poco.',
                        '',
                        '— PilotOS',
                    ].join('\n'),
                },
            );

            await prisma.aviso.update({
                where: { id: aviso.id },
                data: envio.ok
                    ? { enviado: true, enviado_at: new Date(), intentos: { increment: 1 }, error_envio: null }
                    : { error_envio: envio.error?.slice(0, 500), intentos: { increment: 1 } },
            });

            if (envio.ok) {
                resultado.avisosEnviados++;
            } else {
                resultado.avisosFallidos++;
                // CRITICO: el escalon no se ha comunicado, asi que devolvemos
                // el nivel a como estaba para que la pasada de manana lo
                // reintente. Sin esto, un fallo puntual de red perdia el aviso
                // de este escalon PARA SIEMPRE (el motor lo daba por avisado).
                // El `estado` NO se revierte: si esta vencido, lo esta, y eso
                // es un hecho independiente de si el aviso salio.
                await prisma.mantenimientoVehiculo.updateMany({
                    where: {
                        id: mant.id,
                        ...(avisarKm ? { ultimo_nivel_aviso_km: nivelKm } : {}),
                        ...(avisarDias ? { ultimo_nivel_aviso_dias: nivelDias } : {}),
                    },
                    data: {
                        ...(avisarKm ? { ultimo_nivel_aviso_km: mant.ultimo_nivel_aviso_km } : {}),
                        ...(avisarDias ? { ultimo_nivel_aviso_dias: mant.ultimo_nivel_aviso_dias } : {}),
                    },
                });
            }
        }
    }

    return resultado;
}
