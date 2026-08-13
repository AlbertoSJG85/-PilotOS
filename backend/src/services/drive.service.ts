/**
 * Drive del cliente — documentación del taxi ordenada en SU Google Drive
 * (2026-08-12).
 *
 * ── LO PRIMERO, PORQUE SE PRESTA A CONFUSIÓN ────────────────────────────
 * Los archivos NO se guardan en un Drive de NexOS. Van al Drive del propio
 * taxista, en su cuenta de Google. Él los ve como cualquier otra carpeta
 * suya, y si quiere mandárselos a la gestoría los comparte con el botón de
 * compartir de Google, sin pedirnos nada. Si un día deja de ser cliente, sus
 * papeles siguen siendo suyos y están donde siempre estuvieron.
 *
 * ── EL PERMISO QUE PEDIMOS ES EL MÍNIMO ─────────────────────────────────
 * Scope `drive.file`: la aplicación solo puede ver y tocar los archivos que
 * ella misma ha creado. No puede leer el resto del Drive del cliente — ni sus
 * fotos, ni sus documentos personales. Además, ese scope no está en la lista
 * de permisos sensibles de Google, así que no hace falta pasar la revisión.
 *
 * ── ESTRUCTURA ──────────────────────────────────────────────────────────
 *   PilotOS/
 *     2026/
 *       08 - agosto/
 *         ITV/
 *         Facturas de taller/
 *         Seguro/
 *         Otros/
 * Por año y mes porque así es como se busca un papel cuando lo pide la
 * gestoría ("la factura de agosto"), y por categoría porque dentro de un mes
 * puede haber varias cosas distintas.
 *
 * ── NUNCA ROMPE EL PRODUCTO ─────────────────────────────────────────────
 * Toda esta función es un extra. Si el cliente no ha conectado Drive, si el
 * token caduca, si Google está caído o si falta configuración, el documento
 * se guarda igual en PilotOS y la subida se anota como fallida. Un problema
 * con Drive no puede impedir que una factura entre en el sistema.
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { cifrar, descifrar, hayClaveDeCifrado } from '../lib/cifrado';

const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const CARPETA_RAIZ = 'PilotOS';
const MIME_CARPETA = 'application/vnd.google-apps.folder';

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Nombre de carpeta por tipo de documento. Lo que vería un humano.
 *
 * CERTIFICADO_ITV ya NO es "ITV" a secas (2026-08-13, C-071 / C-072): el
 * mismo `tipo` agrupa la ITV de tráfico/DGT y el acta municipal de
 * Inspección Técnica Auto-Taxi del ayuntamiento, que NO es la ITV. Mismo
 * criterio que el frontend (`ETIQUETA_TIPO` en la pantalla de documentos) —
 * si un día se separan en tipos distintos, aquí también hay que separarlos.
 *
 * TARJETA_TRANSPORTE faltaba directamente: antes de hoy ese tipo no existía,
 * así que cualquier tarjeta subida caía en "Otros" sin que nadie se enterara.
 */
const CARPETA_POR_TIPO: Record<string, string> = {
    CERTIFICADO_ITV: 'Inspección técnica',
    FACTURA_TALLER: 'Facturas de taller',
    POLIZA_SEGURO: 'Seguro',
    TARJETA_TRANSPORTE: 'Tarjeta de transporte',
};

export interface ConfiguracionGoogle {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export function configuracionGoogle(): ConfiguracionGoogle | null {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return null;
    return { clientId, clientSecret, redirectUri };
}

/** true si la función está lista para usarse (credenciales + clave de cifrado). */
export function driveDisponible(): boolean {
    return configuracionGoogle() !== null && hayClaveDeCifrado();
}

// ─────────────────────────────────────────────────────────
// OAuth
// ─────────────────────────────────────────────────────────

/**
 * URL a la que se manda al cliente para que autorice. `state` viaja firmado
 * por quien llama (ver drive.routes.ts): sin eso, cualquiera podría completar
 * la conexión en nombre de otro cliente.
 */
export function urlDeConsentimiento(state: string): string | null {
    const cfg = configuracionGoogle();
    if (!cfg) return null;

    const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: SCOPE_DRIVE,
        // offline + consent para que Google devuelva refresh_token: sin él, la
        // conexión se muere en una hora y hay que volver a pedirla.
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokensGoogle {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
}

async function pedirTokens(cuerpo: Record<string, string>): Promise<TokensGoogle> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(cuerpo).toString(),
    });
    return res.json() as Promise<TokensGoogle>;
}

/** Cambia el código de la vuelta de Google por tokens y guarda la conexión. */
export async function guardarConexion(
    clienteId: string,
    codigo: string,
    usuarioId: number,
): Promise<{ ok: boolean; email?: string; error?: string }> {
    const cfg = configuracionGoogle();
    if (!cfg) return { ok: false, error: 'drive_no_configurado' };

    const tokens = await pedirTokens({
        code: codigo,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
    });

    if (!tokens.access_token) {
        return { ok: false, error: tokens.error_description || tokens.error || 'sin_token' };
    }

    // Con qué cuenta ha conectado: se enseña en la app para que sepa a qué
    // Drive están yendo sus papeles.
    let email: string | undefined;
    try {
        const perfil = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (perfil.ok) email = ((await perfil.json()) as { email?: string }).email;
    } catch { /* el email es informativo: si no se puede leer, seguimos */ }

    const expira = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    await prisma.conexionDrive.upsert({
        where: { cliente_id: clienteId },
        create: {
            cliente_id: clienteId,
            google_email: email ?? null,
            access_token: cifrar(tokens.access_token),
            refresh_token: tokens.refresh_token ? cifrar(tokens.refresh_token) : null,
            expira_at: expira,
            conectado_por: usuarioId,
        },
        update: {
            google_email: email ?? null,
            access_token: cifrar(tokens.access_token),
            // Google solo manda refresh_token la primera vez; si no viene, se
            // conserva el que ya había o la conexión moriría al renovar.
            ...(tokens.refresh_token ? { refresh_token: cifrar(tokens.refresh_token) } : {}),
            expira_at: expira,
            conectado_por: usuarioId,
            revocado_at: null,
            ultimo_error: null,
        },
    });

    return { ok: true, email };
}

/** Devuelve un access_token válido, renovándolo si hace falta. null si no se puede. */
async function tokenValido(clienteId: string): Promise<string | null> {
    const cfg = configuracionGoogle();
    if (!cfg) return null;

    const conexion = await prisma.conexionDrive.findUnique({ where: { cliente_id: clienteId } });
    if (!conexion || conexion.revocado_at) return null;

    const margenMs = 60_000; // renovamos un minuto antes de que caduque
    if (conexion.expira_at && conexion.expira_at.getTime() - margenMs > Date.now()) {
        return descifrar(conexion.access_token);
    }

    if (!conexion.refresh_token) return null;

    const tokens = await pedirTokens({
        refresh_token: descifrar(conexion.refresh_token),
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'refresh_token',
    });

    if (!tokens.access_token) {
        // El cliente ha revocado el acceso desde su cuenta de Google, o el
        // token ya no vale. Se marca para que la app pueda pedirle que
        // reconecte en vez de fallar en silencio para siempre.
        await prisma.conexionDrive.update({
            where: { cliente_id: clienteId },
            data: { ultimo_error: (tokens.error_description || tokens.error || 'refresh_fallido').slice(0, 300) },
        });
        return null;
    }

    await prisma.conexionDrive.update({
        where: { cliente_id: clienteId },
        data: {
            access_token: cifrar(tokens.access_token),
            expira_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
            ultimo_error: null,
        },
    });
    return tokens.access_token;
}

// ─────────────────────────────────────────────────────────
// Carpetas y subida
// ─────────────────────────────────────────────────────────

/**
 * Lo que Google dice de verdad cuando algo falla (2026-08-13, C-067).
 *
 * Antes aquí solo se guardaba el número: `403`. Y con un 403 no se puede
 * hacer nada, porque significa tres cosas muy distintas y con arreglos
 * distintos: que la Drive API no está habilitada en el proyecto, que el token
 * no tiene el scope, o que el cliente revocó el acceso. La primera vez que
 * pasó de verdad hubo que entrar en el contenedor y repetir la llamada a mano
 * para leer el motivo — que estaba ahí, en el cuerpo de la respuesta, y lo
 * tirábamos.
 *
 * Google devuelve un `reason` corto (`accessNotConfigured`,
 * `insufficientPermissions`, `storageQuotaExceeded`) y un mensaje largo que
 * incluso trae el enlace para arreglarlo. Se guardan los dos.
 */
async function motivoGoogle(res: Response): Promise<string> {
    try {
        const cuerpo = (await res.json()) as {
            error?: { message?: string; errors?: { reason?: string }[] };
        };
        const reason = cuerpo.error?.errors?.[0]?.reason;
        const mensaje = cuerpo.error?.message;
        if (reason || mensaje) {
            return `${res.status} ${reason ?? ''} ${mensaje ?? ''}`.trim().slice(0, 400);
        }
    } catch {
        // Respuesta sin JSON: nos quedamos con el número, como antes.
    }
    return String(res.status);
}

/** Busca una carpeta por nombre dentro de otra; si no existe, la crea. */
async function carpeta(token: string, nombre: string, padreId?: string): Promise<string> {
    const filtros = [
        `name = '${nombre.replace(/'/g, "\\'")}'`,
        `mimeType = '${MIME_CARPETA}'`,
        'trashed = false',
        padreId ? `'${padreId}' in parents` : null,
    ].filter(Boolean).join(' and ');

    const buscar = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filtros)}&fields=files(id,name)&pageSize=1`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (buscar.ok) {
        const datos = (await buscar.json()) as { files?: { id: string }[] };
        if (datos.files && datos.files.length > 0) return datos.files[0].id;
    }

    const crear = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: nombre,
            mimeType: MIME_CARPETA,
            ...(padreId ? { parents: [padreId] } : {}),
        }),
    });
    if (!crear.ok) throw new Error(`No se pudo crear la carpeta "${nombre}": ${await motivoGoogle(crear)}`);
    return ((await crear.json()) as { id: string }).id;
}

/** Ruta completa PilotOS/AÑO/MM - mes/CATEGORÍA, creando lo que falte. */
async function carpetaDestino(token: string, clienteId: string, fecha: Date, tipo: string): Promise<string> {
    const conexion = await prisma.conexionDrive.findUnique({ where: { cliente_id: clienteId } });

    let raizId = conexion?.carpeta_raiz_id ?? undefined;
    if (!raizId) {
        raizId = await carpeta(token, CARPETA_RAIZ);
        await prisma.conexionDrive.update({ where: { cliente_id: clienteId }, data: { carpeta_raiz_id: raizId } });
    }

    const anioId = await carpeta(token, String(fecha.getUTCFullYear()), raizId);
    const mes = `${String(fecha.getUTCMonth() + 1).padStart(2, '0')} - ${MESES[fecha.getUTCMonth()]}`;
    const mesId = await carpeta(token, mes, anioId);
    return carpeta(token, CARPETA_POR_TIPO[tipo] ?? 'Otros', mesId);
}

export interface ResultadoSubida {
    ok: boolean;
    webViewLink?: string;
    /** Id del fichero en Drive. Antes de hoy se pedía a la API y se tiraba
     *  sin guardar (`drive_file_id` se quedaba vacío para siempre) — sin él
     *  no hay forma de corregir un fichero que se subió mal archivado sin
     *  ir a buscarlo a mano por la URL. */
    id?: string;
    error?: string;
}

/**
 * Sube un documento al Drive del cliente. Nunca lanza: devuelve el fallo para
 * que quien llama lo anote y siga. Ver la nota de cabecera.
 */
export async function subirDocumentoADrive(
    clienteId: string,
    rutaLocal: string,
    nombreVisible: string,
    tipo: string,
    fecha: Date,
): Promise<ResultadoSubida> {
    try {
        if (!driveDisponible()) return { ok: false, error: 'drive_no_configurado' };

        const token = await tokenValido(clienteId);
        if (!token) return { ok: false, error: 'sin_conexion_drive' };

        if (!fs.existsSync(rutaLocal)) return { ok: false, error: 'fichero_no_encontrado' };

        const carpetaId = await carpetaDestino(token, clienteId, fecha, tipo);
        const contenido = fs.readFileSync(rutaLocal);
        const extension = path.extname(rutaLocal) || '.jpg';

        // Subida multipart en una sola llamada: metadatos + fichero.
        const limite = `pilotos-${Date.now()}`;
        const metadatos = JSON.stringify({ name: `${nombreVisible}${extension}`, parents: [carpetaId] });
        const cuerpo = Buffer.concat([
            Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadatos}\r\n`),
            Buffer.from(`--${limite}\r\nContent-Type: application/octet-stream\r\n\r\n`),
            contenido,
            Buffer.from(`\r\n--${limite}--`),
        ]);

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${limite}`,
            },
            body: cuerpo,
        });

        if (!res.ok) {
            const error = `google_${await motivoGoogle(res)}`;
            await anotarError(clienteId, error);
            return { ok: false, error };
        }

        // Salió bien: se borra el error anterior si lo había, para que la
        // pantalla no siga avisando de algo que ya está resuelto.
        await limpiarError(clienteId);

        const creado = (await res.json()) as { id: string; webViewLink?: string };
        return { ok: true, webViewLink: creado.webViewLink, id: creado.id };
    } catch (err: any) {
        console.error('[DRIVE] Subida fallida (no bloquea):', err?.message);
        const error = String(err?.message ?? 'error_desconocido').slice(0, 300);
        await anotarError(clienteId, error);
        return { ok: false, error };
    }
}

/**
 * Manda un fichero a la papelera de Drive (2026-08-13, C-072).
 *
 * Papelera, no borrado permanente: existe para corregir un fichero que se
 * archivó mal (carpeta o fecha equivocada por un dato mal leído del
 * documento) subiendo uno nuevo bien archivado, sin perder el original si
 * algo sale mal. Nunca lanza — igual que el resto de este módulo, un fallo
 * aquí no puede impedir que el flujo normal siga.
 */
export async function papeleraDrive(clienteId: string, fileId: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const token = await tokenValido(clienteId);
        if (!token) return { ok: false, error: 'sin_conexion_drive' };

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true }),
        });
        if (!res.ok) return { ok: false, error: `google_${await motivoGoogle(res)}` };
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: String(err?.message ?? 'error_desconocido').slice(0, 300) };
    }
}

/**
 * Deja constancia de que una subida falló, para que la pantalla lo pueda
 * decir (2026-08-13, C-067).
 *
 * Antes, un fallo de Drive solo existía en el log del servidor: la subida se
 * hace sin `await` y con el error tragado a propósito —Drive nunca puede
 * romper el producto—, así que el cliente veía "Tu Drive está conectado" para
 * siempre mientras no llegaba ni un archivo. `ConexionDrive` ya sabía pintar
 * `ultimo_error`; lo que faltaba era que alguien lo escribiera.
 *
 * Nunca lanza: esto es contabilidad de un extra, no puede estropear nada.
 */
async function anotarError(clienteId: string, error: string): Promise<void> {
    await prisma.conexionDrive
        .updateMany({ where: { cliente_id: clienteId }, data: { ultimo_error: error.slice(0, 300) } })
        .catch(() => undefined);
}

async function limpiarError(clienteId: string): Promise<void> {
    await prisma.conexionDrive
        .updateMany({ where: { cliente_id: clienteId, NOT: { ultimo_error: null } }, data: { ultimo_error: null } })
        .catch(() => undefined);
}

/** Estado de la conexión, para pintarlo en la app. */
export async function estadoConexion(clienteId: string) {
    const conexion = await prisma.conexionDrive.findUnique({ where: { cliente_id: clienteId } });
    return {
        disponible: driveDisponible(),
        conectado: !!conexion && !conexion.revocado_at,
        email: conexion?.google_email ?? null,
        conectado_at: conexion?.conectado_at ?? null,
        ultimo_error: conexion?.ultimo_error ?? null,
    };
}
