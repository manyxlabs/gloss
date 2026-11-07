// The public pages' HTML in every language, for vite.config.ts: what search engines and link previews
// read before any script runs. Not part of the app, which loads only its own language's catalogue.
import bn from './bn';
import { en, type Messages } from './en';
import gu from './gu';
import hi from './hi';
import kn from './kn';
import { LANGS, PAGES, pathOf, SITE, type Lang, type Page } from './langs';
import ml from './ml';
import mr from './mr';
import ta from './ta';
import te from './te';

export const CATALOGUES: Record<Lang, Messages> = { en, hi, bn, mr, te, ta, gu, kn, ml };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (lang: Lang, page: Page) => `${SITE}${pathOf(lang, page)}`;
const ogLocale = (lang: Lang) => `${lang}_IN`;

/** The file a page is written to in the build, served at its address by Cloudflare and the service worker alike. */
export const fileOf = (lang: Lang, page: Page) => `${lang === 'en' ? '' : `${lang}/`}${page || 'index'}.html`;

/** Title, description, canonical address, the other languages' addresses and the link preview. */
export function head(lang: Lang, page: Page) {
  const { meta } = CATALOGUES[lang];
  const title = page ? meta.privacyTitle : meta.title;
  const description = page ? meta.privacyDescription : meta.description;
  const app = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Gloss',
    url: url(lang, page),
    inLanguage: lang,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'A modern web browser',
    description: meta.appDescription,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: 'Manyx Labs', url: 'https://manyxlabs.com/' },
  };
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url(lang, page)}" />`,
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${url(l, page)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${url('en', page)}" />`,
    `<meta property="og:title" content="${esc(page ? meta.privacyTitle : meta.ogTitle)}" />`,
    `<meta property="og:description" content="${esc(page ? meta.privacyDescription : meta.ogDescription)}" />`,
    `<meta property="og:url" content="${url(lang, page)}" />`,
    `<meta property="og:locale" content="${ogLocale(lang)}" />`,
    ...LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${ogLocale(l)}" />`),
    `<meta property="og:image:alt" content="${esc(meta.ogImageAlt)}" />`,
    // `<` is escaped so no text can close the script early.
    ...(page ? [] : [`<script type="application/ld+json">${JSON.stringify(app).replace(/</g, '\\u003c')}</script>`]),
  ].join('\n    ');
}

/** What visitors without JavaScript, and crawlers that run none, see. */
export function noscript(lang: Lang) {
  const { meta } = CATALOGUES[lang];
  const foot = esc(meta.noscriptFoot)
    .replace(/&lt;privacy&gt;(.*?)&lt;\/privacy&gt;/, `<a href="${pathOf(lang, 'privacy')}">$1</a>`)
    .replace(/&lt;maker&gt;(.*?)&lt;\/maker&gt;/, '<a href="https://manyxlabs.com/">$1</a>');
  return `<noscript>
      <h1>${esc(meta.noscriptHeading)}</h1>
      <p>${esc(meta.noscriptIntro)}</p>
      <ul>
        ${Object.values(meta.noscriptPoints)
          .map((p) => `<li>${esc(p)}</li>`)
          .join('\n        ')}
      </ul>
      <p>${foot}</p>
    </noscript>`;
}

/** Every public page in every language, each naming the others. */
export function sitemap(updated: string) {
  const entries = PAGES.flatMap((page) =>
    LANGS.map(
      (lang) => `  <url>
    <loc>${url(lang, page)}</loc>
    <lastmod>${updated}</lastmod>
${[...LANGS.map((l) => [l, url(l, page)]), ['x-default', url('en', page)]].map(([l, u]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${u}" />`).join('\n')}
  </url>`,
    ),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}
