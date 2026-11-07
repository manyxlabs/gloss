import { useEffect } from 'react';

/**
 * The portfolio's motion, for the start and privacy pages only, never working screens: `.reveal`
 * fades up as it scrolls into view, staggered by `--i`, and `.spotlight` glows under the pointer
 * and tilts slightly towards it. `content` re-runs it when what is shown changes.
 */
export function useMotion(content?: unknown) {
  useEffect(() => {
    // Any part in view counts: a share of the element, as on the portfolio, never comes for one taller than several screens.
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('shown');
        seen.unobserve(e.target);
      }
    });
    document.querySelectorAll('.reveal:not(.shown)').forEach((el) => seen.observe(el));
    return () => seen.disconnect();
  }, [content]);

  useEffect(() => {
    const tilt = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('.spotlight') : null;
      if (active && active !== el) active.style.rotate = '';
      active = el;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      el.style.setProperty('--x', `${px}px`);
      el.style.setProperty('--y', `${py}px`);
      if (!tilt) return;
      const nx = (px / rect.width) * 2 - 1;
      const ny = (py / rect.height) * 2 - 1;
      const amount = Math.hypot(nx, ny);
      el.style.rotate = amount ? `${-ny} ${nx} 0 ${amount * 2.5}deg` : '';
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
}
