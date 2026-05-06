import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { upload, procesarYGuardarImagen } from '../services/storage.service';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

function calcularHashSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

// POST /api/upload — Recibe foto, comprime con Sharp, guarda en disco.
// Devuelve URL pública + hash sha256 del fichero comprimido.
router.post('/', upload.single('foto'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'FAIL', error: 'no_file', message: 'No se ha subido ninguna foto' });
        }

        let procesado;
        try {
            procesado = await procesarYGuardarImagen(req.file.buffer);
        } catch (err: any) {
            console.error('[UPLOAD] Error procesando imagen con Sharp:', err.message);
            return res.status(415).json({ status: 'FAIL', error: 'invalid_image', message: 'No se pudo procesar la imagen. Prueba con otra foto.' });
        }

        const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
        const publicUrl = publicBase
            ? `${publicBase}/uploads/${procesado.filename}`
            : `${req.protocol}://${req.get('host')}/uploads/${procesado.filename}`;

        let hash_sha256: string | null = null;
        try {
            hash_sha256 = await calcularHashSha256(procesado.path);
        } catch (e) {
            console.warn('[UPLOAD] No se pudo calcular hash:', (e as Error).message);
        }

        res.status(201).json({
            status: 'OK',
            url: publicUrl,
            filename: procesado.filename,
            mimetype: 'image/jpeg',
            size: procesado.size,
            hash_sha256,
        });
    } catch (error: any) {
        console.error('[UPLOAD] Error:', error.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: 'Error interno en upload' });
    }
});

// Error handler — DEBE ir DESPUÉS del route para capturar errores de multer.
// Convierte LIMIT_FILE_SIZE y MIME inválidos en respuestas HTTP claras (no 500).
router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ status: 'FAIL', error: 'file_too_large', message: 'El archivo supera 20 MB' });
    }
    if (err.message === 'No es una imagen') {
        return res.status(415).json({ status: 'FAIL', error: 'invalid_mime', message: 'Formato no soportado, usa JPG, PNG o HEIC' });
    }
    console.error('[UPLOAD] Error no controlado:', err.message);
    return res.status(500).json({ status: 'FAIL', error: 'server_error', message: 'Error en upload' });
});

export default router;
