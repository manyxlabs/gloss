import { create } from 'zustand';

/** How document pages are shown: as printed, dark, sepia, or dark only while the app's theme is. */
export type PageLook = 'light' | 'dark' | 'sepia' | 'theme';
export const PAGE_LOOKS: PageLook[] = ['light', 'dark', 'sepia', 'theme'];

const LOOK_KEY = 'gloss:pages';
const IMAGES_KEY = 'gloss:pages-images';
const root = document.documentElement;

function remembered(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be blocked; the defaults apply.
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved; the choice still applies for this visit.
  }
}

const saved = remembered(LOOK_KEY) as PageLook | null;

/**
 * The page look, kept per device. `keepImages` leaves pictures on a dark page as they are rather
 * than turned negative with the page. `theme` mirrors the app's theme, which the toggle sets on the
 * root element.
 */
export const useReading = create<{ look: PageLook; keepImages: boolean; theme: string | undefined }>(() => ({
  look: saved && PAGE_LOOKS.includes(saved) ? saved : 'light',
  keepImages: remembered(IMAGES_KEY) !== '0',
  theme: root.dataset.theme,
}));

/** What the pages show now, with `theme` resolved. */
export const shownLook = ({ look, theme }: { look: PageLook; theme: string | undefined }) => (look === 'theme' ? (theme === 'dark' ? 'dark' : 'light') : look);

export const setPageLook = (look: PageLook) => (remember(LOOK_KEY, look), useReading.setState({ look }));
export const setKeepImages = (keepImages: boolean) => (remember(IMAGES_KEY, keepImages ? '1' : '0'), useReading.setState({ keepImages }));

// The page styles hang off the root element, so every pane, squeeze copy and thumbnail follows.
const apply = () => void (root.dataset.pages = shownLook(useReading.getState()));
useReading.subscribe(apply);
apply();
new MutationObserver(() => useReading.setState({ theme: root.dataset.theme })).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
