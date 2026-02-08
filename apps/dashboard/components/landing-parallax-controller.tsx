'use client';

import { useEffect } from 'react';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function LandingParallaxController() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax-section]'));
    const root = document.documentElement;

    if (!sections.length) {
      return;
    }

    let rafId = 0;
    let ticking = false;

    const update = () => {
      ticking = false;
      const viewportHeight = window.innerHeight;
      const viewportCenter = viewportHeight / 2;
      const scrollY = window.scrollY;

      root.style.setProperty('--landing-scroll', scrollY.toFixed(2));
      root.style.setProperty('--landing-scroll-soft', (scrollY * 0.45).toFixed(2));

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const sectionCenter = rect.top + rect.height / 2;
        const normalized = clamp((viewportCenter - sectionCenter) / (viewportHeight / 2 + rect.height / 2), -1, 1);
        section.style.setProperty('--section-progress', normalized.toFixed(4));
      }
    };

    const requestTick = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', requestTick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', requestTick);
      window.removeEventListener('resize', requestTick);
      root.style.removeProperty('--landing-scroll');
      root.style.removeProperty('--landing-scroll-soft');
      for (const section of sections) {
        section.style.removeProperty('--section-progress');
      }
    };
  }, []);

  return null;
}
