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
 */
import { PrismaClient } from '@prisma/client';
import { enviarAvisoGloria } from './notificacion.service';

// ── Escalones ────────────────────────────────────────────────────────────
// Km: 1000/500/250 antes de vencer (explicitos en el informe), y cada 250km
// de mas una vez vencido.
const UMBRALES_KM_PROXIMO = [1000, 500, 250];
const INTERVALO_KM_VENCIDO = 250;

// Dias: 30 antes de vencer (el unico umbral explicito en el informe para
// fechas). El intervalo de recordatorio tras vencer (15 dias) es un valor
// por defecto razonable, PENDIENTE de que Alberto confirme la cadencia
// exacta que quiere para vencimientos por fecha (ITV, seguro...).
const UMBRAL_DIAS_PROXIMO = 30;
const INTERVALO_DIAS_VENCIDO = 15;

/**
 * Nivel de urgencia por kilometraje. deltaKm = proximo_km - km_actuales
 * (positivo = km que faltan; 0 o negativo = km de exceso sobre el vencimiento).
 * Nivel mas alto = menos urgente; null = todavia no hay que avisar.
 * Los niveles de "vencido" son 0, -250, -500... (multiplos de 250, nunca
 * positivos), por lo que siempre comparan como "mas urgentes" que 250.
 */
export function calcularNivelKm(deltaKm: number): number | null {
    const [primero, segundo, tercero] = UMBRALES_KM_PROXIMO; // 1000, 500, 250
    if (deltaKm > primero) return null;
    if (deltaKm > segundo) return primero;
    if (deltaKm > tercero) return segundo;
    if (deltaKm > 0) return tercero;
    // Vencido: bucket de INTERVALO_KM_VENCIDO en INTERVALO_KM_VENCIDO (0, -250, -500...)
    // "|| 0" normaliza -0 a 0 (-0 es falsy en JS): mismo valor numerico, pero
    // evita que un mensaje o comparacion muestre "-0" de forma confusa.
    return (-Math.floor(-deltaKm / INTERVALO_KM_VENCIDO) * INTERVALO_KM_VENCIDO) || 0;
}

/** Igual que calcularNivelKm pero para dias restantes hasta la fecha de vencimiento. */
export function calcularNivelDias(deltaDias: number): number | null {
    if (deltaDias > UMBRAL_DIAS_PROXIMO) return null;
    if (deltaDias > 0) return UMBRAL_DIAS_PROXIMO;
    return (-Math.floor(-deltaDias / INTERVALO_DIAS_VENCIDO) * INTERVALO_DIAS_VENCIDO) || 0;
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
}

/**
 * Recorre todos los mantenimientos activos en estado PENDIENTE/VENCIDO,
 * decide si algun umbral nuevo (km o fecha) se ha cruzado, y si es asi:
 *   1. Reserva el nivel con un update optimista (WHERE incluye los valores
 *      leidos) — si otra instancia del backend ya proceso este mismo
 *      mantenimiento en paralelo, el update afecta 0 filas y se salta sin
 *      duplicar el aviso. Sustituye a un lock distribuido explicito (M7).
 *   2. Crea un registro Aviso (trazabilidad, M12).
 *   3. Intenta el envio real via GlorIA y actualiza el Aviso con el resultado.
 */
export async function procesarMantenimientos(prisma: PrismaClient): Promise<ProcesarResultado> {
    const ahora = new Date();
    const resultado: ProcesarResultado = { evaluados: 0, avisosCreados: 0, avisosEnviados: 0, avisosFallidos: 0 };

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
        if (!patron?.telefono) continue;

        for (const mant of vehiculo.mantenimientos) {
            resultado.evaluados++;

            const deltaKm = mant.proximo_km != null ? mant.proximo_km - vehiculo.km_actuales : null;
            const deltaDias = mant.proxima_fecha != null
                ? Math.floor((mant.proxima_fecha.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000))
                : null;

            const vencido = (deltaKm !== null && deltaKm <= 0) || (deltaDias !== null && deltaDias <= 0);
            const nuevoEstado = vencido ? 'VENCIDO' : mant.estado;

            const nivelKm = deltaKm !== null ? calcularNivelKm(deltaKm) : null;
            const nivelDias = deltaDias !== null ? calcularNivelDias(deltaDias) : null;

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

            const aviso = await prisma.aviso.create({
                data: {
                    cliente_id: vehiculo.cliente_id,
                    tipo: 'MANTENIMIENTO',
                    titulo,
                    mensaje,
                    entidad_tipo: 'MANTENIMIENTO_VEHICULO',
                    entidad_id: mant.id,
                    canal: 'whatsapp',
                    intentos: 1,
                },
            });
            resultado.avisosCreados++;

            const envio = await enviarAvisoGloria(
                patron.telefono,
                vencido ? 'mantenimiento_vencido' : 'mantenimiento_proximo',
                { matricula: vehiculo.matricula, mantenimiento: mant.catalogo.nombre, motivo: motivoKm ?? motivoDias ?? '' },
            );

            await prisma.aviso.update({
                where: { id: aviso.id },
                data: envio.ok
                    ? { enviado: true, enviado_at: new Date() }
                    : { error_envio: envio.error?.slice(0, 500) },
            });

            if (envio.ok) resultado.avisosEnviados++;
            else resultado.avisosFallidos++;
        }
    }

    return resultado;
}
