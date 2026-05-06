import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Almacenamiento en memoria — comprimimos antes de escribir a disco.
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('No es una imagen'), false);
    }
};

// 20MB es suficiente para HEIC/JPEG sin procesar de móviles modernos.
// Comprimimos a JPEG 85% / max 2400px en el handler.
export const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter,
});

/**
 * Procesa el buffer subido: recorta si excede 2400px, exporta como JPEG calidad 85
 * y guarda en disco. Devuelve el filename y el size finales.
 *
 * Beneficios: tamaño en disco predecible (~300–700 KB), formato uniforme JPEG
 * legible por Sharp/Tesseract, mejor OCR sobre imágenes redimensionadas.
 */
export async function procesarYGuardarImagen(buffer: Buffer): Promise<{ filename: string; size: number; path: string }> {
    const filename = 'foto-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + '.jpg';
    const fullPath = path.join(UPLOAD_DIR, filename);

    const procesado = await sharp(buffer, { failOn: 'none' })
        .rotate() // Respeta orientación EXIF (fotos de móvil)
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

    await fs.promises.writeFile(fullPath, procesado);
    return { filename, size: procesado.length, path: fullPath };
}
