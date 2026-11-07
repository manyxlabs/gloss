// Pure, so the build (vite.config.ts) and the tests can read it as well as the app.

/** English first: it is the default, at the unprefixed addresses; every other language lives under /<code>/. */
export const LANGS = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'kn', 'ml'] as const;
export type Lang = (typeof LANGS)[number];

/** Each language's name in its own script, as a reader looking for theirs would recognise it. */
export const NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  bn: 'বাংলা',
  mr: 'मराठी',
  te: 'తెలుగు',
  ta: 'தமிழ்',
  gu: 'ગુજરાતી',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
};

/** The public pages, by their path after the language's prefix; everything else is the app, behind the start page's address. */
export const PAGES = ['', 'privacy'] as const;
export type Page = (typeof PAGES)[number];

export const SITE = 'https://gloss.manyxlabs.com';

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** The language an address names by its prefix, and the path after it; null where it has none, as English addresses do. */
export function split(pathname: string): { prefixed: Lang | null; rest: string } {
  const [, first = '', rest = ''] = /^\/([^/]*)(?:\/(.*))?$/.exec(pathname) ?? [];
  return isLang(first) && first !== 'en' ? { prefixed: first, rest } : { prefixed: null, rest: pathname.slice(1) };
}

/** The address of a page in a language: `/privacy`, `/hi/privacy`, `/`, `/hi/`. */
export const pathOf = (lang: Lang, rest: string) => (lang === 'en' ? `/${rest}` : `/${lang}/${rest}`);

/** The Noto Sans face each language is set in, as @fontsource names it. */
export const SCRIPTS: Record<Exclude<Lang, 'en'>, string> = {
  hi: 'devanagari',
  mr: 'devanagari',
  bn: 'bengali',
  te: 'telugu',
  ta: 'tamil',
  gu: 'gujarati',
  kn: 'kannada',
  ml: 'malayalam',
};
