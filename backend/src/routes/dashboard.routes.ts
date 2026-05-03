/**
 * Dashboard routes — Resumen económico centralizado.
 * Único punto de cálculo consumido por dashboard admin e informes.
 */
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { calcularResumen } from '../services/resumen.service';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/dashboard/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Si no se pasan fechas, devuelve histórico completo.
 */
router.get('/resumen', async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuario?.cliente_id) {
            res.status(400).json({ status: 'FAIL', error: 'no_client_context' });
            return;
        }
        const { desde, hasta } = req.query;
        const desdeDate = desde ? new Date(desde as string) : undefined;
        const hastaDate = hasta ? new Date(hasta as string) : undefined;

        const resumen = await calcularResumen({
            cliente_id: req.usuario.cliente_id,
            desde: desdeDate,
            hasta: hastaDate,
        });

        res.json({ status: 'OK', data: resumen });
    } catch (err: any) {
        console.error('[DASHBOARD] Error resumen:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
