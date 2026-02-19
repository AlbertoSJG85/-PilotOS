import { Router, Request, Response } from 'express';
import { upload } from '../services/storage.service';

const router = Router();

// POST /api/upload - Subir foto
// Espera un campo "foto" en el multipart/form-data
router.post('/', upload.single('foto'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ninguna foto' });
        }

        // Construir URL pública (para local o docker volume)
        // Usamos la variable de entorno PUBLIC_URL si existe, o host
        const protocol = req.protocol;
        const host = req.get('host');
        // Importante: /uploads debe ser servido estáticamente
        const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

        res.status(201).json({
            url: publicUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

    } catch (error) {
        console.error('Error subiendo foto:', error);
        res.status(500).json({ error: 'Error interno en upload' });
    }
});

export default router;
