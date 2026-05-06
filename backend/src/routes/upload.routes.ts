import { Router, Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import { upload } from '../services/storage.service';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
router.use(requireAuth);

// Multer error handler — convierte LIMIT_FILE_SIZE y similares en HTTP claros
router.use((err: any, _req: Request, res: Response, next: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ status: 'FAIL', error: 'file_too_large', message: 'El archivo supera 5 MB' });
    }
    if (err.message === 'No es una imagen') {
        return res.status(415).json({ status: 'FAIL', error: 'invalid_mime', message: 'Formato no soportado, usa JPG o PNG' });
    }
    return next(err);
});

function calcularHashSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

// POST /api/upload — Subir foto. Devuelve URL pública + hash sha256 del fichero.
router.post('/', upload.single('foto'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'FAIL', error: 'no_file', message: 'No se ha subido ninguna foto' });
        }

        // PUBLIC_BASE_URL takes priority (stable HTTPS URL behind Coolify proxy).
        // Fallback: reconstruct from request (works locally with trust proxy set).
        const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
        const publicUrl = publicBase
            ? `${publicBase}/uploads/${req.file.filename}`
            : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        let hash_sha256: string | null = null;
        try {
            hash_sha256 = await calcularHashSha256(req.file.path);
        } catch (e) {
            console.warn('[UPLOAD] No se pudo calcular hash:', (e as Error).message);
        }

        res.status(201).json({
            status: 'OK',
            url: publicUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size,
            hash_sha256,
        });
    } catch (error) {
        console.error('Error subiendo foto:', error);
        res.status(500).json({ status: 'FAIL', error: 'server_error', message: 'Error interno en upload' });
    }
});

export default router;
