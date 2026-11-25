// Plan y contratación (Pay ADR-0019 y ADR-0020). PilotOS solo pregunta a Pay y
// redirige: el precio, los datos fiscales, el consentimiento y la tarjeta son
// de Pay.
//
// Va montado ANTES del guardia de acceso de Pay: con la prueba terminada el
// patrón tiene que poder ver por qué está bloqueado y reactivar PilotOS.

import { Router, Response } from 'express';
import { requireAuth, requirePatron, AuthRequest } from '../middleware/auth.middleware';
import { patronId, refrescarEntitlement } from '../middleware/billing-access.middleware';
import { consultarContratacion, enforceAccess, pedirEnlaceContratar, PLAN_TARIFA_UNICA } from '../lib/nexos-pay';
import { sincronizarCantidadAsalariados, sincronizarCantidadVehiculos } from '../services/billing-sync.service';

const router = Router();

/** La cuenta atrás se enseña los últimos 5 días de prueba (decisión de Alberto, 2026-11-25). */
export const DIAS_CUENTA_ATRAS = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

function urlDeVuelta(): string {
  return `${(process.env.APP_URL || 'https://pilotos.nexostudios.digital').replace(/\/+$/, '')}/admin?contratacion=vuelta`;
}

/** El patrón es la cuenta de Pay (external_id = su id de usuario). */
function cuentaDelPatron(req: AuthRequest): number | null {
  return req.usuario?.es_patron ? req.usuario.id : null;
}

/**
 * Estado de acceso para la app: cuenta atrás de la prueba y bloqueo.
 *
 * Para cualquier usuario (patrón o conductor): el conductor también ve el
 * bloqueo, pero solo el patrón puede reactivar. Si Pay no responde o no exige
 * contratación, `disponible: false` y la app no enseña nada (no se bloquea a
 * nadie por un fallo de Pay).
 */
router.get('/acceso', requireAuth, async (req: AuthRequest, res: Response) => {
  const esPatron = req.usuario?.es_patron === true;
  const id = req.usuario?.role === 'admin' ? null : await patronId(req).catch(() => null);
  if (!id) {
    res.json({ status: 'OK', data: { disponible: false } });
    return;
  }
  const e = await refrescarEntitlement(id);
  if (!e.disponible) {
    res.json({ status: 'OK', data: { disponible: false } });
    return;
  }

  const vigente = e.contratacion ? e.contratacion.vigente : true;
  const fin = e.contratacion?.pruebaFinAt ? new Date(e.contratacion.pruebaFinAt) : null;
  const restante = fin ? fin.getTime() - Date.now() : null;
  // El bloqueo de la app es el mismo que aplica el guardia del backend.
  const bloqueado = enforceAccess() && !e.allowed;
  const diasRestantes = !bloqueado && !vigente && restante !== null && restante > 0
    ? Math.ceil(restante / DIA_MS)
    : null;

  // Solo el patrón necesita saber en qué punto está su contratación (p. ej.
  // «estamos confirmando tu tarjeta» al volver de Pay).
  const necesitaEstado = esPatron && (bloqueado || diasRestantes !== null);
  const contratacion = necesitaEstado ? await consultarContratacion(id) : null;

  res.json({
    status: 'OK',
    data: {
      disponible: true,
      esPatron,
      bloqueado,
      motivo: bloqueado ? (e.motivo ?? 'acceso_suspendido') : null,
      pruebaFinAt: fin ? fin.toISOString() : null,
      diasRestantes,
      cuentaAtras: diasRestantes !== null && diasRestantes <= DIAS_CUENTA_ATRAS,
      contratada: vigente,
      estadoContratacion: contratacion?.disponible ? contratacion.estado : null,
      // Tarifa con suplementos por asalariado y vehículo adicional: la app avisa
      // al dar de alta o de baja que el cambio va en la próxima factura.
      cobraExtras: e.plan === PLAN_TARIFA_UNICA,
      enPrueba: restante !== null && restante > 0,
    },
  });
});

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
  // Se contrata lo que hay HOY: antes de pedir el enlace se manda a Pay la foto
  // actual de asalariados y vehículos (por si alguna sincronización falló).
  // Cada una tiene su timeout y nunca lanza hacia aquí.
  const clienteId = req.usuario?.cliente_id;
  if (clienteId) {
    const evento = `contratar-${id}-${Date.now()}`;
    await Promise.allSettled([
      sincronizarCantidadAsalariados(clienteId, `${evento}-asalariados`),
      sincronizarCantidadVehiculos(clienteId, `${evento}-vehiculos`),
    ]);
  }
  const r = await pedirEnlaceContratar(id, urlDeVuelta());
  if (!r.url) {
    res.status(503).json({ status: 'FAIL', error: r.motivo || 'no_disponible', message: 'Ahora mismo no se puede contratar. Inténtalo en unos minutos.' });
    return;
  }
  res.json({ status: 'OK', url: r.url });
});

export default router;
