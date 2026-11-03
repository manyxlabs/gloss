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

/** Scrolls a tab list, and only it, so its open tab is in view. */
export function revealTab(list: HTMLElement | null) {
  const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')?.parentElement;
  if (!list || !tab) return;
  // The list is positioned, so offsets are measured from it.
  const [left, right] = [tab.offsetLeft, tab.offsetLeft + tab.offsetWidth];
  if (left < list.scrollLeft) list.scrollLeft = left - 8;
  else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8;
}

/** Keeps a tab list's open tab in view as the list is resized, as when what is beside it comes and goes. */
export function useRevealOnResize(list: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const sized = new ResizeObserver(() => revealTab(el));
    sized.observe(el);
    return () => sized.disconnect();
  }, [list]);
}
