import { useEffect, type KeyboardEvent, type RefObject } from 'react';

/** Arrow keys, Home and End move between the tabs of a tab list and open the one reached; only the open tab is in the Tab order. */
export function onTabKeys(e: KeyboardEvent<HTMLElement>) {
  const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const at = tabs.findIndex((t) => t.parentElement?.contains(document.activeElement));
  const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (to === undefined || at < 0) return;
  e.preventDefault();
  const tab = tabs[(to + tabs.length) % tabs.length]!;
  tab.focus();
  tab.click();
}

/** Scrolls a tab list, and only it, so its open tab is in view and clear of the faded sides. */
export function revealTab(list: HTMLElement | null) {
  const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')?.parentElement;
  if (!list || !tab) return;
  const fade = parseFloat(getComputedStyle(list).getPropertyValue('--fade'));
  // The list is positioned, so offsets are measured from it. The browser keeps scrollLeft within the list.
  const [left, right, width] = [tab.offsetLeft - fade, tab.offsetLeft + tab.offsetWidth + fade, list.clientWidth];
  if (left < list.scrollLeft) list.scrollLeft = left;
  else if (right > list.scrollLeft + width) list.scrollLeft = right - width;
  markMore(list);
}

/** Marks the sides a tab list has more tabs past, which fade so a tab cut at the edge reads as scrolled out of sight. */
function markMore(list: HTMLElement) {
  // Rounded, since a zoomed page scrolls by fractions of a pixel.
  const end = Math.round(list.scrollLeft + list.clientWidth) < list.scrollWidth;
  const more = [list.scrollLeft > 0 && 'start', end && 'end'].filter(Boolean).join(' ');
  if (more) list.dataset.more = more;
  else delete list.dataset.more;
}

/** Keeps a tab list's open tab in view as the list is resized, as when what is beside it comes and goes, and its faded sides true as it scrolls. */
export function useRevealOnResize(list: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const sized = new ResizeObserver(() => revealTab(el));
    sized.observe(el);
    const scrolled = () => markMore(el);
    el.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      sized.disconnect();
      el.removeEventListener('scroll', scrolled);
    };
  }, [list]);
}
