/**
 * Genera TODOS los assets de marca de la app PilotOS desde el pack oficial.
 *
 *   node scripts/build-branding-assets.mjs
 *
 * Fuente unica: PilotOS_Branding_Final_v4/00_referencia/
 *   PilotOS_logo_horizontal_dark_transparente.png
 *
 * De ahi salen el lockup horizontal (logo-full / logo-compact) y el simbolo
 * recortado con el que se construyen todos los iconos. No se redibuja nada:
 * el logo es raster de resolucion limitada y el pack avisa explicitamente de
 * que no se debe reinterpretar (ver BRAND_GUIDE.md).
 *
 * Dos cosas que hay que saber si se toca esto:
 *
 * 1. El PNG "transparente" del pack NO esta limpio: el recorte automatico de
 *    fondo deja un halo de alfa muy baja por toda la imagen (solo el 80,5 %
 *    de los pixeles esta a alfa 0). No se ve en un visor, pero compuesto
 *    sobre fondo oscuro deja un rectangulo grisaceo. Por eso el umbral.
 * 2. El icono de la pestana del navegador NO es ninguno de los PNG: Next.js
 *    sirve src/app/favicon.ico por convencion de fichero y ese gana sobre
 *    metadata.icons de layout.tsx. Se regenera aqui tambien.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(
  raiz,
  '..',
  'PilotOS_Branding_Final_v4',
  '00_referencia',
  'PilotOS_logo_horizontal_dark_transparente.png'
);
const BRANDING = path.join(raiz, 'public', 'branding', 'pilotos');
const FAVICON_ICO = path.join(raiz, 'src', 'app', 'favicon.ico');

/** Black del brand guide (#05070B). */
const NEGRO = { r: 0x05, g: 0x07, b: 0x0b, alpha: 1 };
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };
/** Alfa por debajo de esto es halo del recorte, no logo. */
const UMBRAL_ALFA = 48;
/** Columnas del simbolo dentro del lockup, antes del separador y el wordmark. */
const CAJA_SIMBOLO = { left: 230, width: 375 };

/** Quita el halo residual y reescala el alfa restante para no perder los bordes suaves. */
async function limpiarAlfa(entrada) {
  const { data, info } = await sharp(entrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    data[i] = a <= UMBRAL_ALFA ? 0 : Math.round(((a - UMBRAL_ALFA) * 255) / (255 - UMBRAL_ALFA));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Tile redondeado del brand con el simbolo centrado. `padding` es la fraccion libre a cada lado. */
async function tile(simbolo, size, padding) {
  const radio = Math.round(size * 0.225); // radio de icono de app (iOS ~22,4 %)
  const mascara = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radio}" ry="${radio}" fill="#fff"/></svg>`
  );
  const fondo = await sharp({ create: { width: size, height: size, channels: 4, background: NEGRO } })
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const interior = Math.round(size * (1 - 2 * padding));
  const glifo = await sharp(simbolo)
    .resize({ width: interior, height: interior, fit: 'inside', background: TRANSPARENTE })
    .png()
    .toBuffer();

  return sharp(fondo).composite([{ input: glifo, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
}

/** Contenedor ICO con frames PNG dentro (soportado por todo navegador actual). */
function empaquetarIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(1, 2); // tipo 1 = icono
  cabecera.writeUInt16LE(imagenes.length, 4);

  const directorio = Buffer.alloc(16 * imagenes.length);
  let offset = 6 + 16 * imagenes.length;
  imagenes.forEach((img, i) => {
    const o = i * 16;
    directorio[o] = img.size >= 256 ? 0 : img.size; // 0 significa 256
    directorio[o + 1] = img.size >= 256 ? 0 : img.size;
    directorio.writeUInt16LE(1, o + 4); // planos
    directorio.writeUInt16LE(32, o + 6); // bits por pixel
    directorio.writeUInt32LE(img.buffer.length, o + 8);
    directorio.writeUInt32LE(offset, o + 12);
    offset += img.buffer.length;
  });

  return Buffer.concat([cabecera, directorio, ...imagenes.map((i) => i.buffer)]);
}

async function main() {
  const limpio = await limpiarAlfa(SRC);
  const { height } = await sharp(limpio).metadata();

  // ── Lockup horizontal ──
  const { data: lockup, info: infoLockup } = await sharp(limpio)
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  console.log('lockup:', `${infoLockup.width}x${infoLockup.height}`);
  for (const [fichero, ancho] of [
    ['logo-full.png', 1200],
    ['logo-compact.png', 800],
  ]) {
    await sharp(lockup)
      .resize({ width: ancho, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(path.join(BRANDING, fichero));
    console.log('✓', fichero);
  }

  // ── Simbolo suelto ──
  const banda = await sharp(limpio)
    .extract({ left: CAJA_SIMBOLO.left, top: 0, width: CAJA_SIMBOLO.width, height })
    .png()
    .toBuffer();
  const { data: recorte, info: infoSimbolo } = await sharp(banda)
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  console.log('simbolo:', `${infoSimbolo.width}x${infoSimbolo.height}`);
  const simbolo = await sharp(recorte).png().toBuffer();

  // ── Iconos PWA / apple-touch / favicon PNG ──
  for (const [fichero, size, padding] of [
    ['icon-512.png', 512, 0.16],
    ['logo-icon.png', 512, 0.16],
    ['icon-192.png', 192, 0.16],
    ['icon-180.png', 180, 0.16],
    ['favicon-32.png', 32, 0.1],
    // Maskable: Android puede recortar hasta un circulo, el contenido vive en el 80 % central.
    ['icon-maskable-512.png', 512, 0.26],
  ]) {
    writeFileSync(path.join(BRANDING, fichero), await tile(simbolo, size, padding));
    console.log('✓', fichero, `${size}px`);
  }

  // ── favicon.ico (el icono real de la pestana) ──
  const frames = [];
  for (const [size, padding] of [
    [16, 0.06],
    [32, 0.1],
    [64, 0.12],
    [128, 0.14],
    [256, 0.16],
  ]) {
    frames.push({ size, buffer: await tile(simbolo, size, padding) });
  }
  writeFileSync(FAVICON_ICO, empaquetarIco(frames));
  console.log('✓ src/app/favicon.ico', frames.map((f) => f.size).join('/'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
