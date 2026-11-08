import { expect, test, type Page } from '@playwright/test';
import { LANGS, NAMES, PAGES, pathOf, SITE, type Lang, type Page as PublicPage } from '../src/i18n/langs';
import { CATALOGUES } from '../src/i18n/pages';
import { ESSAY } from './pdfs';
import { pdf, shot } from './helpers';

/** The narrowest phones in common use; a desktop browser's window cannot be made this narrow. */
const PHONE = { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const OTHERS = LANGS.filter((l) => l !== 'en');

/** Every catalogue string of two words or more that this language says differently, with where it is. */
function translated(lang: Lang) {
  const found: [string, string][] = [];
  const walk = (en: unknown, other: unknown, path: string) => {
    if (typeof en === 'string') {
      if (en !== other && !en.includes('<') && en.trim().split(/\s+/).length > 1) found.push([path, en]);
    } else if (en && typeof en === 'object') for (const [k, v] of Object.entries(en)) walk(v, (other as Record<string, unknown>)[k], `${path}.${k}`);
  };
  walk(CATALOGUES.en, CATALOGUES[lang], 'm');
  return found;
}

/** English strings still on screen, in text or in the names and hints a screen reader or a hover shows. */
async function leaked(page: Page, lang: Lang) {
  const shown = await page.evaluate(() =>
    [
      document.body.innerText,
      ...[...document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')].flatMap((el) =>
        ['aria-label', 'title', 'placeholder', 'alt'].map((a) => el.getAttribute(a) ?? ''),
      ),
      document.title,
    ].join('\n'),
  );
  return translated(lang).filter(([, en]) => shown.includes(en));
}

/**
 * Controls and headings whose text does not fit them, text that runs past the screen's edges (where the
 * page clips rather than scrolls), and whether the page itself scrolls sideways.
 */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const name = (el: HTMLElement) => `${el.tagName} ${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 40)}`;
    // Strips that scroll sideways, and the panes a phone slides out of view, are meant to reach past the edge.
    const inScroller = (el: Element) => {
      for (let e = el.parentElement; e; e = e.parentElement) if (/auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
      return false;
    };
    const shown = [...document.querySelectorAll<HTMLElement>('button, [role=tab], [role=menuitem], a, h1, h2, h3, p, li, label, select')].filter((el) => el.offsetParent);
    const cut = shown.filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis').map(name);
    const outside = shown
      .filter((el) => !inScroller(el) && el.closest('.panes') === null)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
      })
      .map(name);
    return { cut, outside, sideways: document.documentElement.scrollWidth > innerWidth };
  });

async function head(page: Page, lang: Lang, at: PublicPage) {
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `${SITE}${pathOf(lang, at)}`);
  const alternates = await page.locator('link[rel=alternate][hreflang]').evaluateAll((links) => links.map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]));
  expect(alternates).toEqual([...LANGS.map((l) => [l, `${SITE}${pathOf(l, at)}`]), ['x-default', `${SITE}${pathOf('en', at)}`]]);
  const meta = CATALOGUES[lang].meta;
  await expect(page).toHaveTitle(at ? meta.privacyTitle : meta.title);
}

/** Starts a project from a PDF on the start page in this language. */
async function openProject(page: Page, lang: Lang) {
  await page.goto(pathOf(lang, ''));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: CATALOGUES[lang].library.openFiles }).click()]);
  await chooser.setFiles(await pdf('Reef essay.pdf', ESSAY));
  await expect(page.locator('.textLayer span').first()).toBeVisible({ timeout: 15_000 });
}

/** Checks a page fits a phone and shows none of the English this language translates. */
async function checked(page: Page, lang: Lang, name: string) {
  expect(await overflowing(page), `${name} at 360px`).toEqual({ cut: [], outside: [], sideways: false });
  expect(await leaked(page, lang), name).toEqual([]);
}

test.describe('on a 360px phone', () => {
  test.use(PHONE);
  for (const lang of LANGS)
    test(`${NAMES[lang]}: public pages say their language to search engines, and every page fits the phone with no English left`, async ({ page }) => {
      for (const at of PAGES) {
        const response = await page.goto(pathOf(lang, at));
        // Served as it is: no page is reached by a redirect.
        expect(response!.request().redirectedFrom()).toBeNull();
        await head(page, lang, at);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await checked(page, lang, `${lang} ${at || 'start'}`);
      }
      await openProject(page, lang);
      await checked(page, lang, `${lang} project`);
      // The phone's More menu holds the switcher, the theme and the exports.
      await page.getByRole('button', { name: CATALOGUES[lang].workspace.more, exact: true }).click();
      await expect(page.getByRole('combobox', { name: CATALOGUES[lang].language })).toBeVisible();
      await checked(page, lang, `${lang} project's More menu`);
      await shot(page, `languages-${lang}-project-phone`);
    });
});

test('the switcher, by keyboard, opens the same page or the same project in another language, remembered for the start page only', async ({ page }) => {
  const { hi, ta } = CATALOGUES;
  await page.goto('/hi/');
  await page.goto('/');
  // Visiting a page in a language is not choosing it.
  await expect(page).toHaveURL('/');

  await page.goto('/privacy');
  const select = page.getByRole('combobox', { name: 'Language' });
  await expect(select).toHaveValue('en');
  await select.focus();
  // Hindi follows English in the list.
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL('/hi/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(hi.privacy.heading);
  await expect(page.getByText(hi.privacy.updated)).toBeVisible();
  // The note that the English policy prevails links to it.
  await page.getByRole('link', { name: /<en>(.*?)<\/en>/.exec(hi.privacy.prevails)![1] }).click();
  await expect(page).toHaveURL('/privacy');

  // The choice brings the start page to Hindi; no other English address moves.
  await page.goto('/');
  await expect(page).toHaveURL('/hi/');
  await page.goto('/privacy');
  await expect(page).toHaveURL('/privacy');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // A project keeps its place across a switch: only the language prefix changes.
  await openProject(page, 'hi');
  const project = new URL(page.url()).hash;
  expect(project).toMatch(/^#\/p\//);
  await page.getByRole('combobox', { name: hi.language }).selectOption('ta');
  await expect(page).toHaveURL(`/ta/${project}`);
  await expect(page.locator('.textLayer span').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('textbox', { name: ta.workspace.projectName })).toHaveValue('Reef essay');
  await page.getByRole('combobox', { name: ta.language }).selectOption('en');
  await expect(page).toHaveURL(`/${project}`);
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Reef essay');
  await page.goto('/');
  await expect(page).toHaveURL('/');
});

test('a visitor who never picked a language is never moved, whatever their browser speaks', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'hi-IN' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The app behind the start page follows the browser's language.
  await openProject(page, 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('textbox', { name: CATALOGUES.hi.workspace.projectName })).toHaveValue('Reef essay');
  await context.close();
});

test('the sitemap lists every public page in every language, each with all its alternates', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  expect(urls.sort()).toEqual(LANGS.flatMap((l) => PAGES.map((p) => `${SITE}${pathOf(l, p)}`)).sort());
  expect(xml.match(/hreflang="/g)).toHaveLength(urls.length * (LANGS.length + 1));
});

// Through the service worker, which the other tests leave out.
test.describe(() => {
  test.use({ serviceWorkers: 'allow' });

  test('a Hindi page and project keep working, in Hindi and its font, with no network after one visit', async ({ page, context }) => {
    const hi = CATALOGUES.hi;
    await page.goto('/hi/');
    await expect(page.getByRole('status')).toHaveText(hi.updates.offline, { timeout: 30_000 });
    await openProject(page, 'hi');
    const project = page.url();
    await page.waitForTimeout(500);

    await context.setOffline(true);
    await page.goto('/hi/');
    await expect(page.getByRole('link', { name: /Reef essay/ })).toBeVisible();
    await page.goto('/hi/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(hi.privacy.heading);
    await page.goto(project);
    await expect(page.locator('.textLayer span').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: hi.workspace.projectName })).toHaveValue('Reef essay');
    const font = await page.evaluate(async () => (await document.fonts.ready, [...document.fonts].some((f) => f.family.includes('Devanagari') && f.status === 'loaded')));
    expect(font).toBe(true);
    await context.setOffline(false);
  });
});

test('screenshots: Hindi at phone and desktop sizes in both themes, and each other language’s start page', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const)
    for (const [size, device] of [
      ['phone', PHONE],
      ['desktop', DESKTOP],
    ] as const) {
      const context = await browser.newContext({ ...device, colorScheme });
      const page = await context.newPage();
      for (const at of PAGES) {
        await page.goto(pathOf('hi', at));
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot(page, `languages-hi-${at || 'start'}-${size}-${colorScheme}`);
      }
      await openProject(page, 'hi');
      await shot(page, `languages-hi-project-${size}-${colorScheme}`);
      await context.close();
    }
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  for (const lang of OTHERS) {
    await page.goto(pathOf(lang, ''));
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `languages-${lang}-start-phone`);
  }
  await context.close();
});
