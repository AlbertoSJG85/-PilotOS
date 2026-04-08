'use client';

import { useEffect } from 'react';

/** Registra el Service Worker para habilitar capacidades PWA. Solo en producción o localhost. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('[SW] Registrado:', reg.scope))
        .catch((err) => console.warn('[SW] Error al registrar:', err));
    }
  }, []);

  return null;
}
