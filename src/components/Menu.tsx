import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const EDGE = 8;

/**
 * A menu opened from a button, over everything else: below the button, or above it where there is
 * no room, following it as the page scrolls. It is drawn in the page's body, as a scrolling list or
 * a lifted card would clip or move it. A click elsewhere or Escape closes it.
 */
export function Menu({
  anchor,
  label,
  onClose,
  children,
  panel,
}: {
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** A panel of its own controls rather than a list of commands, such as the list of documents. */
  panel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const place = () => {
      const box = anchor.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = ref.current!;
      const below = box.bottom + GAP + h <= innerHeight - EDGE;
      setAt({
        top: below ? box.bottom + GAP : Math.max(EDGE, box.top - GAP - h),
        left: Math.min(Math.max(EDGE, panel ? box.left : box.right - w), innerWidth - w - EDGE),
      });
    };
    place();
    ref.current!.querySelector<HTMLElement>(panel ? '[aria-current="page"], button:not(:disabled)' : '[role^="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    addEventListener('scroll', place, { capture: true, passive: true });
    addEventListener('resize', place);
    return () => {
      removeEventListener('scroll', place, { capture: true });
      removeEventListener('resize', place);
    };
  }, [anchor, panel]);

  useEffect(() => {
    // A menu opened from inside a panel is drawn apart from it, yet belongs to it.
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (ref.current?.contains(t) || anchor.contains(t) || (!!panel && t instanceof Element && !!t.closest('.menu.floating')));
    const down = (e: PointerEvent) => !inside(e.target) && close.current();
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (panel && document.querySelectorAll('.menu.floating').length > 1)) return;
      close.current();
      anchor.focus();
    };
    addEventListener('pointerdown', down);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('keydown', key);
    };
  }, [anchor, panel]);

  const step = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus({ preventScroll: true });
  };

  return createPortal(
    <div
      ref={ref}
      className={`menu glass floating${panel ? ` ${panel}` : ''}`}
      role={panel ? 'dialog' : 'menu'}
      aria-label={label}
      onKeyDown={panel ? undefined : step}
      style={at ?? { top: 0, left: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
