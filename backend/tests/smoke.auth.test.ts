/**
 * Tests de humo — Fase 0 (red de seguridad).
 *
 * Objetivo: dejar una red mínima que detecte regresiones en la lógica de
 * autenticación/tenencia SIN necesidad de base de datos. No cubren aún el
 * flujo end-to-end (eso llega en Fase 2 con una BD de test dedicada).
 *
 * Cubren:
 *  - isSameTenant: comportamiento deny-by-default (clave para el fix de IDOR).
 *  - generarToken + jwt.verify: el token se firma y verifica con el mismo secreto.
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { generarToken, isSameTenant, AuthRequest } from '../src/middleware/auth.middleware';

// Helper: construye un AuthRequest mínimo con el contexto de usuario dado.
function reqCon(usuario: AuthRequest['usuario']): AuthRequest {
  return { usuario } as AuthRequest;
}

describe('isSameTenant (aislamiento multi-tenant)', () => {
  it('admin siempre pasa, aunque el recurso no tenga cliente', () => {
    const req = reqCon({ id: 1, telefono: '', nombre: '', role: 'admin' });
    expect(isSameTenant(req, 'cliente-A')).toBe(true);
    expect(isSameTenant(req, null)).toBe(true);
  });

  it('mismo cliente → true', () => {
    const req = reqCon({ id: 2, telefono: '', nombre: '', role: 'user', cliente_id: 'cliente-A' });
    expect(isSameTenant(req, 'cliente-A')).toBe(true);
  });

  it('cliente distinto → false', () => {
    const req = reqCon({ id: 3, telefono: '', nombre: '', role: 'user', cliente_id: 'cliente-A' });
    expect(isSameTenant(req, 'cliente-B')).toBe(false);
  });

  it('DENY-BY-DEFAULT: usuario sin cliente_id → false (nunca debe colarse)', () => {
    const req = reqCon({ id: 4, telefono: '', nombre: '', role: 'user' });
    expect(isSameTenant(req, 'cliente-A')).toBe(false);
  });

  it('DENY-BY-DEFAULT: recurso sin cliente → false', () => {
    const req = reqCon({ id: 5, telefono: '', nombre: '', role: 'user', cliente_id: 'cliente-A' });
    expect(isSameTenant(req, null)).toBe(false);
    expect(isSameTenant(req, undefined)).toBe(false);
  });
});

describe('generarToken / verificación JWT', () => {
  it('firma un token que se verifica con el mismo secreto y conserva el payload', () => {
    const token = generarToken({ id: 42, telefono: '+34600000001', role: 'user', es_patron: true, cliente_id: 'cliente-A' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded.id).toBe(42);
    expect(decoded.telefono).toBe('+34600000001');
    expect(decoded.es_patron).toBe(true);
    expect(decoded.cliente_id).toBe('cliente-A');
  });

  it('un token firmado con otro secreto NO verifica', () => {
    const token = generarToken({ id: 1, telefono: '', role: 'user' });
    expect(() => jwt.verify(token, 'secreto-incorrecto')).toThrow();
  });
});
