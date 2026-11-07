import { en, type Messages } from './en';
import { intl } from './intl';
import { isLang, LANGS, pathOf, split, type Lang } from './langs';

export type { Messages };

type Other = Exclude<Lang, 'en'>;

// A catalogue and its script's font load only on a page in that language.
const catalogues: Record<Other, () => Promise<{ default: Messages }>> = {
  hi: () => import('./hi'),
  bn: () => import('./bn'),
  mr: () => import('./mr'),
  te: () => import('./te'),
  ta: () => import('./ta'),
  gu: () => import('./gu'),
  kn: () => import('./kn'),
  ml: () => import('./ml'),
};
// The weights the styles use; 450, 550 and 650 are drawn from the nearest.
const devanagari = () =>
  Promise.all([
    import('@fontsource/noto-sans-devanagari/400.css'),
    import('@fontsource/noto-sans-devanagari/500.css'),
    import('@fontsource/noto-sans-devanagari/600.css'),
    import('@fontsource/noto-sans-devanagari/700.css'),
  ]);
const fonts: Record<Other, () => Promise<unknown>> = {
  hi: devanagari,
  mr: devanagari,
  bn: () =>
    Promise.all([
      import('@fontsource/noto-sans-bengali/400.css'),
      import('@fontsource/noto-sans-bengali/500.css'),
      import('@fontsource/noto-sans-bengali/600.css'),
      import('@fontsource/noto-sans-bengali/700.css'),
    ]),
  te: () =>
    Promise.all([
      import('@fontsource/noto-sans-telugu/400.css'),
      import('@fontsource/noto-sans-telugu/500.css'),
      import('@fontsource/noto-sans-telugu/600.css'),
      import('@fontsource/noto-sans-telugu/700.css'),
    ]),
  ta: () =>
    Promise.all([
      import('@fontsource/noto-sans-tamil/400.css'),
      import('@fontsource/noto-sans-tamil/500.css'),
      import('@fontsource/noto-sans-tamil/600.css'),
      import('@fontsource/noto-sans-tamil/700.css'),
    ]),
  gu: () =>
    Promise.all([
      import('@fontsource/noto-sans-gujarati/400.css'),
      import('@fontsource/noto-sans-gujarati/500.css'),
      import('@fontsource/noto-sans-gujarati/600.css'),
      import('@fontsource/noto-sans-gujarati/700.css'),
    ]),
  kn: () =>
    Promise.all([
      import('@fontsource/noto-sans-kannada/400.css'),
      import('@fontsource/noto-sans-kannada/500.css'),
      import('@fontsource/noto-sans-kannada/600.css'),
      import('@fontsource/noto-sans-kannada/700.css'),
    ]),
  ml: () =>
    Promise.all([
      import('@fontsource/noto-sans-malayalam/400.css'),
      import('@fontsource/noto-sans-malayalam/500.css'),
      import('@fontsource/noto-sans-malayalam/600.css'),
      import('@fontsource/noto-sans-malayalam/700.css'),
    ]),
};

const KEY = 'gloss:lang';

/** The language last picked in the switcher, if any. */
function chosen(): Lang | null {
  try {
    const saved = localStorage.getItem(KEY);
    return isLang(saved) ? saved : null;
  } catch {
    return null;
  }
}

const preferred = (): Lang => navigator.languages.map((l) => l.toLowerCase().split('-')[0]).find(isLang) ?? 'en';

/**
 * A public page is in the language its address names, so what search engines index is fixed by its
 * address. The app, behind the start page's address (a project, a share link), is in the language last
 * picked, or else the browser's. The start page itself is the app's home too, so one who picked a
 * language comes back to it there; nobody else, crawlers included, is ever sent away from an English page.
 */
function resolve(): Lang {
  const { prefixed } = split(location.pathname);
  if (prefixed) return prefixed;
  const picked = chosen();
  if (location.hash.length > 1) return picked ?? preferred();
  if (picked && picked !== 'en' && location.pathname === '/') {
    history.replaceState(null, '', `${pathOf(picked, '')}${location.search}`);
    return picked;
  }
  return 'en';
}

export const lang = resolve();
export const { locale, num, plural, date } = intl(lang);
/** The catalogue for this page's language, loaded before anything is drawn. */
export const m: Messages = lang === 'en' ? en : (await Promise.all([catalogues[lang](), fonts[lang]()]))[0].default;
document.documentElement.lang = lang;

/** The address of a public page in this page's language, such as the start page (`''`) or `'privacy'`. */
export const href = (page: string) => pathOf(lang, page);

/** Remembers the language and opens the same page, or the same place in the app, in it. */
export function choose(to: Lang) {
  try {
    localStorage.setItem(KEY, to);
  } catch {
    // Not remembered; the page still opens in the language picked.
  }
  location.assign(`${pathOf(to, split(location.pathname).rest)}${location.search}${location.hash}`);
}

export { LANGS };
