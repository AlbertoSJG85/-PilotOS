'use client';

import { useEffect } from 'react';

/**
 * Revela los elementos marcados con [data-reveal] cuando entran en viewport.
 *
 * Se monta una sola vez en la landing y observa todo el documento, para que
 * page.tsx pueda seguir siendo un server component (exporta `metadata`).
 *
 * Si el usuario pide menos movimiento, no se observa nada: los elementos se
 * marcan como visibles de golpe y el CSS los deja quietos.
 */
export function ScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (nodes.length === 0) return;

    const sinMovimiento =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window);

    if (sinMovimiento) {
      nodes.forEach((n) => n.setAttribute('data-reveal', 'in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute('data-reveal', 'in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return null;
}
