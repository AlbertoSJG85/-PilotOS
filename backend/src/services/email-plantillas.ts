/**
 * Plantillas de correo con la marca de PilotOS.
 *
 * Marca: fondo #05070B, panel #171717, amarillo #FFB703 solo como acento y
 * llamada a la acción (PilotOS_Branding_Final_v4/BRAND_GUIDE.md). El logo tiene
 * el texto en blanco, así que necesita fondo oscuro: toda la cabecera lo es.
 *
 * HTML de correo, no de web: tablas y estilos en línea, porque Gmail y Outlook
 * ignoran casi todo lo demás. Siempre se manda también la versión en texto
 * plano, para clientes que no pintan HTML.
 */

const AMARILLO = '#FFB703';
const NEGRO = '#05070B';
const PANEL = '#171717';
const LINEA = '#2A2A2A';
const GRIS = '#9A9A9A';
const FUENTE = "Montserrat, 'Segoe UI', Arial, sans-serif";

export interface CorreoPlantilla {
    asunto: string;
    /** Versión en texto plano. */
    cuerpo: string;
    html: string;
}

export function urlApp(): string {
    return (process.env.APP_URL || 'https://pilotos.nexostudios.digital').replace(/\/+$/, '');
}

/** Los nombres los escribe el usuario: nunca van al HTML sin escapar. */
export function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parrafo(html: string): string {
    return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#E8E8E8;">${html}</p>`;
}

function boton(texto: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
<td bgcolor="${AMARILLO}" style="border-radius:10px;"><a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:15px;font-weight:700;color:${NEGRO};text-decoration:none;">${texto}</a></td>
</tr></table>`;
}

function pasos(lista: string[]): string {
    const filas = lista.map((p, i) => `<tr>
<td width="36" valign="top" style="padding:0 0 12px;"><div style="width:26px;height:26px;border-radius:13px;background:${AMARILLO};color:${NEGRO};font-family:${FUENTE};font-size:13px;font-weight:700;line-height:26px;text-align:center;">${i + 1}</div></td>
<td valign="top" style="padding:2px 0 12px;font-family:${FUENTE};font-size:15px;line-height:22px;color:#E8E8E8;">${p}</td>
</tr>`).join('');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">${filas}</table>`;
}

function marco(titulo: string, contenido: string, pie: string): string {
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escaparHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:${NEGRO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${NEGRO}" style="background:${NEGRO};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
    <tr><td align="center" bgcolor="${NEGRO}" style="padding:8px 0 24px;">
      <img src="${urlApp()}/branding/pilotos/logo-full.png" width="220" alt="PilotOS · Gestión inteligente para flotas" style="display:block;border:0;width:220px;max-width:100%;height:auto;">
    </td></tr>
    <tr><td bgcolor="${PANEL}" style="background:${PANEL};border:1px solid ${LINEA};border-top:3px solid ${AMARILLO};border-radius:14px;padding:32px 28px;font-family:${FUENTE};">
      <h1 style="margin:0 0 20px;font-family:${FUENTE};font-size:22px;line-height:30px;color:#FFFFFF;">${titulo}</h1>
      ${contenido}
    </td></tr>
    <tr><td align="center" style="padding:20px 8px 0;font-family:${FUENTE};font-size:12px;line-height:18px;color:${GRIS};">
      ${pie}<br>PilotOS by NexOS · Gestión inteligente para flotas
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Código para ACTIVAR la cuenta (fijar la primera contraseña). */
export function plantillaCodigoActivacion(codigo: string, minutos: number): CorreoPlantilla {
    const html = marco(
        'Activa tu cuenta de PilotOS',
        parrafo('Estás activando tu cuenta y eligiendo tu primera contraseña. Escribe este código en la pantalla de PilotOS:')
        + `<div style="margin:0 0 20px;padding:18px 0;background:${NEGRO};border:1px solid ${LINEA};border-radius:12px;text-align:center;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${AMARILLO};">${escaparHtml(codigo)}</div>`
        + parrafo(`Caduca en <strong style="color:#FFFFFF;">${minutos} minutos</strong> y solo se puede usar una vez.`)
        + `<p style="margin:0;padding:14px 16px;background:${NEGRO};border-left:3px solid ${AMARILLO};border-radius:6px;font-size:13px;line-height:20px;color:${GRIS};">Si no has sido tú, <strong style="color:#FFFFFF;">no uses este código</strong> y avisa a tu responsable: alguien que conoce tu teléfono está intentando activar tu cuenta.</p>`,
        'Has recibido este correo porque alguien pidió activar una cuenta de PilotOS con tu teléfono.',
    );
    return {
        asunto: 'Tu código para activar tu cuenta de PilotOS',
        cuerpo: [
            'Estás activando tu cuenta de PilotOS y eligiendo tu primera contraseña.',
            '',
            `Tu código es: ${codigo}`,
            '',
            `Caduca en ${minutos} minutos y solo se puede usar una vez.`,
            'Si no has sido tú, NO uses este código y avisa a tu responsable:',
            'alguien que conoce tu teléfono está intentando activar tu cuenta.',
            '',
            '— PilotOS',
        ].join('\n'),
        html,
    };
}

const PASOS_ENTRADA = [
    'Abre PilotOS desde el botón de arriba (o desde tu navegador, en el móvil).',
    'Escribe <strong style="color:#FFFFFF;">tu número de teléfono</strong>.',
    'Si es tu primera vez, te enviaremos <strong style="color:#FFFFFF;">un código a este correo</strong>. Escríbelo y elige tu contraseña.',
];

const PASOS_ENTRADA_TEXTO = [
    '1. Abre PilotOS en tu navegador.',
    '2. Escribe tu número de teléfono.',
    '3. Si es tu primera vez, te enviaremos un código a este correo. Escríbelo y elige tu contraseña.',
];

/** Bienvenida al propietario al terminar su alta. */
export function plantillaBienvenidaPatron(datos: {
    nombre: string;
    telefono: string;
    asalariados: string[];
}): CorreoPlantilla {
    const url = urlApp();
    const nombre = datos.nombre.trim() || 'propietario';
    const equipo = datos.asalariados.length > 0
        ? parrafo(`Has dado de alta a <strong style="color:#FFFFFF;">${datos.asalariados.map(escaparHtml).join(', ')}</strong>. Cada uno recibirá su propio correo de bienvenida y entrará con su teléfono.`)
        : '';
    const html = marco(
        `Bienvenido a PilotOS, ${escaparHtml(nombre)}`,
        parrafo('Tu cuenta y tu vehículo ya están creados. Desde PilotOS controlas partes, gastos, documentos y mantenimientos de un vistazo.')
        + boton('Entrar en PilotOS', `${url}/login`)
        + parrafo(`Tu teléfono de acceso es <strong style="color:#FFFFFF;">${escaparHtml(datos.telefono)}</strong>. Así entras:`)
        + pasos(PASOS_ENTRADA)
        + equipo,
        'Has recibido este correo porque se ha creado una cuenta de PilotOS con este email.',
    );
    return {
        asunto: 'Bienvenido a PilotOS',
        cuerpo: [
            `Bienvenido a PilotOS, ${nombre}.`,
            '',
            'Tu cuenta y tu vehículo ya están creados.',
            `Tu teléfono de acceso es ${datos.telefono}. Así entras en ${url}/login :`,
            ...PASOS_ENTRADA_TEXTO,
            ...(datos.asalariados.length > 0
                ? ['', `Has dado de alta a ${datos.asalariados.join(', ')}. Cada uno recibirá su propio correo de bienvenida.`]
                : []),
            '',
            '— PilotOS',
        ].join('\n'),
        html,
    };
}

/** Bienvenida a un conductor asalariado cuando su responsable lo da de alta. */
export function plantillaBienvenidaAsalariado(datos: {
    nombre: string;
    telefono: string;
    responsable: string;
}): CorreoPlantilla {
    const url = urlApp();
    const nombre = datos.nombre.trim() || 'conductor';
    const responsable = datos.responsable.trim() || 'Tu responsable';
    const html = marco(
        `Hola ${escaparHtml(nombre)}, ya tienes cuenta en PilotOS`,
        parrafo(`<strong style="color:#FFFFFF;">${escaparHtml(responsable)}</strong> te ha dado de alta como conductor. Con PilotOS registras tus partes diarios desde el móvil, de forma rápida.`)
        + boton('Entrar en PilotOS', `${url}/login`)
        + parrafo(`Tu teléfono de acceso es <strong style="color:#FFFFFF;">${escaparHtml(datos.telefono)}</strong>. Así entras:`)
        + pasos(PASOS_ENTRADA)
        + `<p style="margin:0;font-size:13px;line-height:20px;color:${GRIS};">Si no esperabas este correo, ignóralo o avisa a ${escaparHtml(responsable)}.</p>`,
        'Has recibido este correo porque te han dado de alta en PilotOS con este email.',
    );
    return {
        asunto: `${responsable} te ha dado de alta en PilotOS`,
        cuerpo: [
            `Hola ${nombre},`,
            '',
            `${responsable} te ha dado de alta como conductor en PilotOS.`,
            `Tu teléfono de acceso es ${datos.telefono}. Así entras en ${url}/login :`,
            ...PASOS_ENTRADA_TEXTO,
            '',
            `Si no esperabas este correo, ignóralo o avisa a ${responsable}.`,
            '',
            '— PilotOS',
        ].join('\n'),
        html,
    };
}
