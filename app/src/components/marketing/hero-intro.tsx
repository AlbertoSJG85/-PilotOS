'use client';

import { useEffect } from 'react';

/**
 * Intro del hero, igual que en RentOS: el logo grande arranca quieto en el
 * hueco del hero, se encoge hasta el logo de la cabecera y, al terminar,
 * revela la foto (entrando desde la izquierda), el texto y las tarjetas.
 *
 * Se monta una sola vez en la landing y opera sobre el DOM por id, para que
 * page.tsx pueda seguir siendo un server component (exporta `metadata`).
 * Si el usuario pide menos movimiento, se salta directo al estado final.
 */
export function HeroIntro() {
  useEffect(() => {
    const introWrap = document.getElementById('pilotos-intro-logo');
    const introImg = document.getElementById('pilotos-intro-logo-img') as HTMLImageElement | null;
    const headerImg = document.getElementById('pilotos-header-logo') as HTMLImageElement | null;
    const heroSection = document.querySelector<HTMLElement>('[data-hero-phase]');

    if (!introWrap || !introImg || !headerImg || !heroSection) return;

    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function showFinalState() {
      introWrap!.style.display = 'none';
      headerImg!.style.opacity = '1';
      heroSection!.setAttribute('data-hero-phase', 'revealed');
      document.documentElement.classList.remove('pilotos-intro');
    }

    if (sinMovimiento || typeof introImg.animate !== 'function') {
      showFinalState();
      return;
    }

    function runIntro() {
      const introRect = introImg!.getBoundingClientRect();
      const headerRect = headerImg!.getBoundingClientRect();

      if (!introRect.width || !headerRect.width) {
        showFinalState();
        return;
      }

      const scale = headerRect.width / introRect.width;
      const translateX = headerRect.left + headerRect.width / 2 - (introRect.left + introRect.width / 2);
      const translateY = headerRect.top + headerRect.height / 2 - (introRect.top + introRect.height / 2);

      const anim = introImg!.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`, opacity: 1, offset: 0.82 },
          { transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`, opacity: 0 },
        ],
        {
          delay: 1400, // logo grande quieto un momento, para que dé tiempo a leerlo
          duration: 950,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        },
      );

      anim.onfinish = () => {
        introWrap!.style.display = 'none';
        headerImg!.style.transition = 'opacity 0.3s ease-out';
        headerImg!.style.opacity = '1';
        heroSection!.setAttribute('data-hero-phase', 'revealed');
        document.documentElement.classList.remove('pilotos-intro');
      };
    }

    // Deja pintar el primer frame (solo el logo grande) antes de animar.
    const raf = requestAnimationFrame(() => requestAnimationFrame(runIntro));

    // Red de seguridad: si algo falla (imagen que no llega a cargar, etc.),
    // no se queda la landing sin logo de cabecera ni contenido del hero.
    const safety = setTimeout(() => {
      if (introWrap!.style.display !== 'none') showFinalState();
    }, 6000);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, []);

  return null;
}
