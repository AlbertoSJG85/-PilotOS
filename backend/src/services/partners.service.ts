/**
 * PilotOS Partners — acceso de las asociaciones a su panel (DT-041).
 *
 * QUIÉN ES DUEÑO DE QUÉ. El partner, su acuerdo, sus socios y sus comisiones
 * son de NexOS Pay (se dan de alta en ONE). PilotOS solo guarda cómo entra la
 * asociación: usuario, contraseña y el enlace de un solo uso para crearlos.
 *
 * CÓMO SE ENTERA PILOTOS DE UNA ASOCIACIÓN NUEVA. Cada pocos minutos lee de Pay
 * las asociaciones con acuerdo de PilotOS. A la que no tiene cuenta aquí le crea
 * una y le manda el correo de bienvenida. Va en esta dirección (PilotOS → Pay)
 * porque es la que ya existe: Pay no conoce a PilotOS ni guarda su clave.
 *
 * UNA CUENTA POR ASOCIACIÓN (decisión de Alberto, 2026-11-25). La comparte
 * quien lleve las cuentas.
 *
 * LA SESIÓN NO ES LA DE UN TAXISTA. Va en otra cookie y se firma con otra
 * clave (derivada de JWT_SECRET), así que un token de partner no abre ninguna
 * ruta de PilotOS aunque alguien lo mande donde no toca.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { listarPartnersPortal, type PartnerPortal } from '../lib/nexos-pay';
import { enviarEmail, esEmailEntregable } from './email.service';
import { plantillaInvitacionPartner, plantillaRecuperacionPartner, urlApp } from './email-plantillas';
import { cookieInsegura, leerCookie } from '../lib/sesion-cookie';

export const DIAS_INVITACION = 14;
export const MINUTOS_RECUPERACION = 60;
export const NOMBRE_COOKIE_PARTNER = 'pilotos_partner';
/** Sin rotación: quien consulta esto entra un rato, no está todo el día dentro. */
export const VIDA_SESION_PARTNER_MS = 12 * 60 * 60 * 1000;

const USUARIO = /^[a-z0-9][a-z0-9._-]{2,39}$/;

// ─── Utilidades ──────────────────────────────────────────────────────────────

export function huella(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function tokenNuevo(): string {
    return crypto.randomBytes(32).toString('base64url');
}

/** El usuario se guarda en minúsculas. Devuelve null si no es válido. */
export function normalizarUsuario(valor: unknown): string | null {
    if (typeof valor !== 'string') return null;
    const u = valor.trim().toLowerCase();
    return USUARIO.test(u) ? u : null;
}

function clavePartner(): string {
    const base = process.env.JWT_SECRET;
    if (!base) throw new Error('JWT_SECRET no configurado');
    return crypto.createHmac('sha256', base).update('pilotos-partners-sesion').digest('hex');
}

// ─── Sesión ──────────────────────────────────────────────────────────────────

export function emitirSesionPartner(res: Response, cuenta: { id: string; codigo: string }): void {
    const token = jwt.sign({ sub: cuenta.id, codigo: cuenta.codigo, tipo: 'partner' }, clavePartner(), {
        expiresIn: Math.floor(VIDA_SESION_PARTNER_MS / 1000),
        audience: 'pilotos-partners',
    });
    res.cookie(NOMBRE_COOKIE_PARTNER, token, {
        httpOnly: true,
        secure: !cookieInsegura(),
        sameSite: 'lax',
        path: '/',
        maxAge: VIDA_SESION_PARTNER_MS,
    });
}

export function borrarSesionPartner(res: Response): void {
    res.clearCookie(NOMBRE_COOKIE_PARTNER, { httpOnly: true, secure: !cookieInsegura(), sameSite: 'lax', path: '/' });
}

/** La cuenta de la sesión, o null si no hay sesión válida, está cerrada o la cuenta ya no está activa. */
export async function cuentaDeLaSesion(req: Request) {
    const token = leerCookie(req, NOMBRE_COOKIE_PARTNER);
    if (!token) return null;
    let claims: { sub?: string; iat?: number; tipo?: string };
    try {
        claims = jwt.verify(token, clavePartner(), { audience: 'pilotos-partners' }) as typeof claims;
    } catch {
        return null;
    }
    if (claims.tipo !== 'partner' || !claims.sub || typeof claims.iat !== 'number') return null;
    const cuenta = await prisma.partnerCuenta.findUnique({ where: { id: claims.sub } });
    if (!cuenta || !cuenta.activo || !cuenta.usuario) return null;
    // Un cambio de contraseña cierra las sesiones anteriores.
    if (claims.iat * 1000 < Math.floor(cuenta.sesiones_validas_desde.getTime() / 1000) * 1000) return null;
    return cuenta;
}

// ─── Enlaces de un solo uso ──────────────────────────────────────────────────

/** Guarda un enlace nuevo (anula el anterior) y devuelve el token en claro, que solo va en el correo. */
async function prepararEnlace(cuentaId: string, tipo: 'invitacion' | 'recuperacion'): Promise<string> {
    const token = tokenNuevo();
    const vida = tipo === 'invitacion' ? DIAS_INVITACION * 24 * 60 * 60 * 1000 : MINUTOS_RECUPERACION * 60 * 1000;
    await prisma.partnerCuenta.update({
        where: { id: cuentaId },
        data: { token_hash: huella(token), token_tipo: tipo, token_expira: new Date(Date.now() + vida) },
    });
    return token;
}

/** La cuenta de un enlace todavía válido, o null. */
export async function cuentaDelEnlace(token: unknown) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const cuenta = await prisma.partnerCuenta.findUnique({ where: { token_hash: huella(token) } });
    if (!cuenta || !cuenta.activo || !cuenta.token_expira || cuenta.token_expira.getTime() < Date.now()) return null;
    if (cuenta.token_tipo !== 'invitacion' && cuenta.token_tipo !== 'recuperacion') return null;
    return cuenta;
}

/** Manda (o reenvía) el correo de bienvenida con un enlace nuevo. Nunca lanza. */
export async function enviarInvitacion(cuenta: { id: string; nombre: string; codigo: string; email: string }): Promise<boolean> {
    try {
        const token = await prepararEnlace(cuenta.id, 'invitacion');
        const correo = plantillaInvitacionPartner({
            nombre: cuenta.nombre,
            codigo: cuenta.codigo,
            enlaceAcceso: `${urlApp()}/partners/acceso?token=${token}`,
            diasValidez: DIAS_INVITACION,
        });
        const r = await enviarEmail(cuenta.email, correo.asunto, correo.cuerpo, { html: correo.html });
        await prisma.partnerCuenta.update({
            where: { id: cuenta.id },
            data: r.ok
                ? { invitacion_enviada_at: new Date(), invitacion_error: null }
                : { invitacion_error: (r.error ?? 'error').slice(0, 300) },
        });
        if (!r.ok) console.warn(`[PARTNERS] Bienvenida de ${cuenta.codigo} sin enviar: ${r.error}`);
        else console.log(`[PARTNERS] Bienvenida enviada a ${cuenta.codigo}`);
        return r.ok;
    } catch (err: any) {
        console.error(`[PARTNERS] Error al invitar a ${cuenta.codigo}:`, err?.message);
        return false;
    }
}

/** Contraseña olvidada. Si aún no creó su acceso, se le reenvía la bienvenida. Nunca lanza. */
export async function enviarRecuperacion(cuenta: { id: string; nombre: string; codigo: string; email: string; usuario: string | null }): Promise<void> {
    try {
        if (!cuenta.usuario) {
            await enviarInvitacion(cuenta);
            return;
        }
        const token = await prepararEnlace(cuenta.id, 'recuperacion');
        const correo = plantillaRecuperacionPartner({
            nombre: cuenta.nombre,
            usuario: cuenta.usuario,
            enlace: `${urlApp()}/partners/acceso?token=${token}`,
            minutos: MINUTOS_RECUPERACION,
        });
        const r = await enviarEmail(cuenta.email, correo.asunto, correo.cuerpo, { html: correo.html });
        if (!r.ok) console.warn(`[PARTNERS] Recuperación de ${cuenta.codigo} sin enviar: ${r.error}`);
    } catch (err: any) {
        console.error(`[PARTNERS] Error en la recuperación de ${cuenta.codigo}:`, err?.message);
    }
}

// ─── Sincronización con Pay ──────────────────────────────────────────────────

export interface ResumenSincronizacion {
    leidos: number;
    creadas: number;
    invitaciones: number;
    desactivadas: number;
    reactivadas: number;
}

/**
 * Pone las cuentas al día con las asociaciones de Pay.
 *
 * - Asociación nueva con correo → cuenta y correo de bienvenida.
 * - Bienvenida que no salió (SMTP caído) → se reintenta en la siguiente vuelta.
 * - Cambio de correo antes de crear el acceso → se reenvía al correo nuevo.
 * - Deja de ser partner (o se desactiva en ONE) → no puede entrar.
 *
 * Si Pay no responde no toca nada: un corte de red no puede cerrar el acceso
 * de todas las asociaciones.
 */
export async function sincronizarPartners(
    leer: () => Promise<PartnerPortal[] | null> = listarPartnersPortal,
): Promise<ResumenSincronizacion | null> {
    const partners = await leer();
    if (!partners) return null;

    const r: ResumenSincronizacion = { leidos: partners.length, creadas: 0, invitaciones: 0, desactivadas: 0, reactivadas: 0 };
    const enPay = new Set<string>();

    for (const p of partners) {
        const codigo = String(p.codigo || '').trim().toUpperCase();
        if (!codigo) continue;
        enPay.add(codigo);
        const email = (p.email || '').trim().toLowerCase();
        const existente = await prisma.partnerCuenta.findUnique({ where: { codigo } });

        if (!existente) {
            if (!p.activo || !esEmailEntregable(email)) continue; // sin correo no hay a quién invitar
            const cuenta = await prisma.partnerCuenta.create({ data: { codigo, nombre: p.nombre, email } });
            r.creadas++;
            if (await enviarInvitacion(cuenta)) r.invitaciones++;
            continue;
        }

        const cambiaEmail = esEmailEntregable(email) && email !== existente.email;
        const cuenta = await prisma.partnerCuenta.update({
            where: { id: existente.id },
            data: {
                nombre: p.nombre,
                activo: p.activo,
                ...(cambiaEmail ? { email } : {}),
            },
        });
        if (existente.activo && !p.activo) r.desactivadas++;
        if (!existente.activo && p.activo) r.reactivadas++;

        const sinAcceso = !cuenta.usuario;
        const pendiente = !cuenta.invitacion_enviada_at;
        if (cuenta.activo && sinAcceso && (pendiente || cambiaEmail)) {
            if (await enviarInvitacion(cuenta)) r.invitaciones++;
        }
    }

    // Las que Pay ya no tiene como partners de PilotOS.
    const fuera = await prisma.partnerCuenta.updateMany({
        where: { activo: true, codigo: { notIn: [...enPay] } },
        data: { activo: false },
    });
    r.desactivadas += fuera.count;

    if (r.creadas || r.invitaciones || r.desactivadas || r.reactivadas) {
        console.log('[PARTNERS] Sincronización:', JSON.stringify(r));
    }
    return r;
}
