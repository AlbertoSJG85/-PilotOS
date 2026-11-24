// Plan y contratación del patrón (Pay ADR-0019). PilotOS solo pregunta a Pay y
// redirige: el precio, los datos fiscales, el consentimiento y la tarjeta son
// de Pay.
//
// Va montado ANTES del guardia de acceso de Pay: un patrón con el acceso
// suspendido tiene que poder ver su plan y contratar.

import { Router, Response } from 'express';
import { requireAuth, requirePatron, AuthRequest } from '../middleware/auth.middleware';
import { consultarContratacion, pedirEnlaceContratar } from '../lib/nexos-pay';

const router = Router();

function urlDeVuelta(): string {
  return `${(process.env.APP_URL || 'https://pilotos.nexostudios.digital').replace(/\/+$/, '')}/admin?contratacion=vuelta`;
}

/** El patrón es la cuenta de Pay (external_id = su id de usuario). */
function cuentaDelPatron(req: AuthRequest): number | null {
  return req.usuario?.es_patron ? req.usuario.id : null;
}

router.get('/', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
  const id = cuentaDelPatron(req);
  if (!id) {
    res.json({ status: 'OK', data: { disponible: false, estado: 'desconocido' } });
    return;
  }
  res.json({ status: 'OK', data: await consultarContratacion(id) });
});

router.post('/contratar', requireAuth, requirePatron, async (req: AuthRequest, res: Response) => {
  const id = cuentaDelPatron(req);
  if (!id) {
    res.status(403).json({ status: 'FAIL', error: 'patron_required', message: 'Solo el patrón puede contratar' });
    return;
  }
  const r = await pedirEnlaceContratar(id, urlDeVuelta());
  if (!r.url) {
    res.status(503).json({ status: 'FAIL', error: r.motivo || 'no_disponible', message: 'Ahora mismo no se puede contratar. Inténtalo en unos minutos.' });
    return;
  }
  res.json({ status: 'OK', url: r.url });
});

export default router;
