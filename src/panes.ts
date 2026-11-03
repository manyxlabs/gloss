import { useSyncExternalStore } from 'react';

/** A third pane needs a wide screen; narrower, it waits, and phones show one pane as before. */
const WIDE = '(min-width: 1440px)';

/** Whether a media query matches, kept up to date. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (change) => {
      const list = matchMedia(query);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => matchMedia(query).matches,
  );
}

/** How many document panes there is room for side by side. */
export const paneRoom = () => (matchMedia(WIDE).matches ? 3 : 2);
export const usePaneRoom = () => (useMedia(WIDE) ? 3 : 2);
