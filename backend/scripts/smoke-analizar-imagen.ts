/**
 * Smoke test del analizador de imágenes.
 * Genera imágenes sintéticas con Sharp y comprueba que `analizarImagen()`
 * decide correctamente cuándo una imagen es procesable. Una foto real de
 * ticket clara debe siempre acabar como `procesable: true`.
 *
 * Uso:
 *   npx ts-node scripts/smoke-analizar-imagen.ts
 */
import sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analizarImagen } from '../src/services/ocr.service';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotos-smoke-'));

function ok(label: string, cond: boolean, extra?: unknown) {
    const tag = cond ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${label}${extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''}`);
    return cond;
}

(async () => {
    let pass = 0;
    let fail = 0;
    const acc = (b: boolean) => { b ? pass++ : fail++; };

    // 1. Foto "normal": 800x600 con ruido pseudoaleatorio (representa una foto real de ticket).
    const ruido = Buffer.alloc(800 * 600 * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = Math.floor(Math.random() * 256);
    const pathRuido = path.join(tmp, 'foto-normal.jpg');
    await sharp(ruido, { raw: { width: 800, height: 600, channels: 3 } }).jpeg().toFile(pathRuido);
    const r1 = await analizarImagen(pathRuido);
    console.log('Caso 1 — foto normal (ruido 800x600):', r1);
    acc(ok('procesable === true', r1.procesable === true, r1));

    // 2. Imagen completamente negra 800x600 → debería ser "sin_contenido_visual".
    const pathNegra = path.join(tmp, 'foto-negra.jpg');
    await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toFile(pathNegra);
    const r2 = await analizarImagen(pathNegra);
    console.log('Caso 2 — imagen negra:', r2);
    acc(ok('procesable === false', r2.procesable === false, r2));
    acc(ok("motivo === 'sin_contenido_visual'", r2.motivo === 'sin_contenido_visual'));

    // 3. Imagen completamente blanca 800x600 → debería ser "sin_contenido_visual".
    const pathBlanca = path.join(tmp, 'foto-blanca.jpg');
    await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toFile(pathBlanca);
    const r3 = await analizarImagen(pathBlanca);
    console.log('Caso 3 — imagen blanca:', r3);
    acc(ok('procesable === false', r3.procesable === false, r3));

    // 4. Miniatura 50x50 → "demasiado_pequena".
    const pathPeque = path.join(tmp, 'foto-pequena.jpg');
    await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 100, g: 100, b: 100 } } }).jpeg().toFile(pathPeque);
    const r4 = await analizarImagen(pathPeque);
    console.log('Caso 4 — miniatura 50x50:', r4);
    acc(ok('procesable === false', r4.procesable === false));
    acc(ok("motivo === 'demasiado_pequena'", r4.motivo === 'demasiado_pequena'));

    // 5. Archivo de texto renombrado .jpg → "imagen_corrupta".
    const pathTxt = path.join(tmp, 'no-imagen.jpg');
    fs.writeFileSync(pathTxt, 'esto no es una imagen real');
    const r5 = await analizarImagen(pathTxt);
    console.log('Caso 5 — archivo no-imagen:', r5);
    acc(ok('procesable === false', r5.procesable === false));
    acc(ok("motivo === 'imagen_corrupta'", r5.motivo === 'imagen_corrupta'));

    // 6. Foto con texto sintético (similar a un ticket): franjas blancas y negras alternando.
    // Esto representa el escenario realista de un ticket impreso en blanco con texto en negro.
    const w = 800, h = 1200;
    const buf = Buffer.alloc(w * h * 3, 255);
    for (let y = 0; y < h; y++) {
        if (y % 40 < 5) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 3;
                buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0;
            }
        }
    }
    const pathTicket = path.join(tmp, 'foto-tipo-ticket.jpg');
    await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg().toFile(pathTicket);
    const r6 = await analizarImagen(pathTicket);
    console.log('Caso 6 — patrón tipo ticket (líneas):', r6);
    acc(ok('procesable === true', r6.procesable === true, r6));

    // Limpieza best-effort (en Windows Sharp puede tardar en liberar el fichero).
    try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
        // Ignoramos: el SO limpiará el temp más tarde.
    }

    console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})();
