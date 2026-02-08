'use client';

import { useEffect } from 'react';

const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function ProductStepTracker() {
  useEffect(() => {
    const section = document.getElementById('product');
    if (!section) return;

    const dots = Array.from(section.querySelectorAll<HTMLElement>('[data-step-index]'));
    const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-card-index]'));
    const visuals = Array.from(section.querySelectorAll<HTMLElement>('[data-visual-index]'));

    if (!dots.length || !cards.length) return;

    const totalSteps = dots.length;

    const update = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;

      // raw: 0 when section top is at viewport bottom, 1 when section bottom at viewport top
      const raw = (vh - rect.top) / (rect.height + vh);

      // map so steps activate from ~20% to ~75% of scroll through section
      const mapped = (raw - 0.18) / 0.54;
      const progress = Math.max(0, Math.min(1, mapped));
      const eased = ease(progress);

      // continuous step value: 0 → totalSteps
      const stepFloat = eased * totalSteps;
      const activeStep = Math.min(totalSteps - 1, Math.floor(stepFloat));

      // fractional progress within the current step (for sub-step animation)
      const stepFraction = stepFloat - Math.floor(stepFloat);

      dots.forEach((dot, i) => {
        const isActive = i <= activeStep && progress > 0;
        const isCurrent = i === activeStep && progress > 0 && progress < 1;

        dot.setAttribute('data-active', String(isActive));
        dot.setAttribute('data-current', String(isCurrent));

        // Set sub-progress on the current dot for glow pulse
        if (isCurrent) {
          dot.style.setProperty('--step-progress', stepFraction.toFixed(3));
        } else {
          dot.style.removeProperty('--step-progress');
        }
      });

      cards.forEach((card, i) => {
        const isActive = i <= activeStep && progress > 0;
        const isCurrent = i === activeStep && progress > 0 && progress < 1;

        card.setAttribute('data-active', String(isActive));
        card.setAttribute('data-current', String(isCurrent));

        // Stagger the reveal: each card gets a slight offset based on how recently it activated
        if (isActive && i === activeStep) {
          const reveal = Math.min(1, stepFraction * 2.5);
          card.style.setProperty('--card-reveal', reveal.toFixed(3));
        } else if (isActive) {
          card.style.setProperty('--card-reveal', '1');
        } else {
          card.style.setProperty('--card-reveal', '0');
        }
      });

      // Drive SVG visual layers – crossfade based on active step
      visuals.forEach((layer, i) => {
        const isActive = i === activeStep && progress > 0;
        layer.setAttribute('data-visible', String(isActive));
      });

      // Set overall progress on the section for the connecting rail line
      section.style.setProperty('--step-scroll', eased.toFixed(4));
    };

    let raf = 0;
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        raf = requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return null;
}
