import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import {
  consultarEntitlement,
  enforceAccess,
  enforcePlanGates,
  type EntitlementPilotOS,
} from '../lib/nexos-pay';
import { AuthRequest } from './auth.middleware';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, { value: EntitlementPilotOS; expiresAt: number }>();

async function patronId(req: AuthRequest): Promise<number | null> {
  if (req.usuario?.role === 'admin') return null;
  if (req.usuario?.es_patron) return req.usuario.id;
  if (!req.usuario?.cliente_id) return null;
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.usuario.cliente_id },
    select: { patron_id: true },
  });
  return cliente?.patron_id ?? null;
}

async function entitlementConCache(id: number): Promise<EntitlementPilotOS> {
  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const current = await consultarEntitlement(id);
  if (current.disponible) {
    cache.set(id, { value: current, expiresAt: Date.now() + CACHE_TTL_MS });
    return current;
  }
  // Un fallo temporal de Pay usa la última decisión conocida, incluso si el
  // TTL acaba de vencer. Sin una decisión previa se permite paso degradado:
  // nunca se borran datos ni configuraciones por indisponibilidad externa.
  return cached?.value ?? current;
}

export function requireNexosPayAccess(feature?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!enforceAccess() || req.usuario?.role === 'admin') { next(); return; }
    try {
      const id = await patronId(req);
      if (!id) { next(); return; }
      const entitlement = await entitlementConCache(id);
      if (!entitlement.disponible) {
        res.setHeader('x-nexos-pay-degraded', 'true');
        next();
        return;
      }
      if (!entitlement.allowed) {
        res.status(402).json({
          status: 'FAIL', error: 'subscription_access_suspended',
          message: 'El acceso a PilotOS está suspendido. Tus datos se conservan.',
          estado_pago: entitlement.estadoPago,
          estado_acceso: entitlement.estadoAcceso,
        });
        return;
      }
      if (feature && enforcePlanGates() && entitlement.limites[feature] !== true) {
        res.status(403).json({
          status: 'FAIL', error: 'upgrade_required', feature,
          message: 'Esta función requiere el plan PilotOS Pro.',
          plan: entitlement.plan,
        });
        return;
      }
      next();
    } catch (error) {
      console.warn('[nexos-pay] comprobación degradada:', error instanceof Error ? error.message : String(error));
      res.setHeader('x-nexos-pay-degraded', 'true');
      next();
    }
  };
}

export async function clienteTieneFeaturePro(patronExternalId: number, feature: string): Promise<boolean> {
  if (!enforceAccess() || !enforcePlanGates()) return true;
  const entitlement = await entitlementConCache(patronExternalId);
  if (!entitlement.disponible) return true;
  return entitlement.allowed && entitlement.limites[feature] === true;
}

export function __clearBillingCacheForTests(): void {
  cache.clear();
}
