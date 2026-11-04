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

/** Scrolls a tab list, and only it, so its open tab is in view and the list starts at a tab rather than through one. */
export function revealTab(list: HTMLElement | null) {
  const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')?.parentElement;
  if (!list || !tab) return;
  const tabs = [...list.querySelectorAll<HTMLElement>(':scope > *')];
  // The list is positioned, so offsets are measured from it.
  const [left, right, width] = [tab.offsetLeft, tab.offsetLeft + tab.offsetWidth, list.clientWidth];
  let to = list.scrollLeft;
  if (left < to) to = left - 8;
  else if (right > to + width) to = Math.min((tabs.find((t) => t.offsetLeft >= right - width) ?? tab).offsetLeft, left);
  // Room after the last tab lets the list scroll that far. It is made again on every call, since dropping it on
  // a resize would scroll the list back through a tab.
  for (const t of tabs) t.style.marginInlineEnd = '';
  tabs.at(-1)!.style.marginInlineEnd = `${Math.max(0, to - (list.scrollWidth - width))}px`;
  list.scrollLeft = to;
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
