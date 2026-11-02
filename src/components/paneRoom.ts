import { useSyncExternalStore } from 'react';

/** A third pane needs a wide screen; narrower, it waits, and phones show one pane as before. */
const WIDE = '(min-width: 1280px)';

const wide = () => matchMedia(WIDE).matches;
const onWide = (change: () => void) => {
  const query = matchMedia(WIDE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};
/** How many panes there is room for side by side. */
export const usePaneRoom = () => (useSyncExternalStore(onWide, wide) ? 3 : 2);
