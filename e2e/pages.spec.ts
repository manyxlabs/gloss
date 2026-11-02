import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ARTIFACTS, card, inside, openProject, readPdf, select, shot, type Box } from './helpers';
import { encryptedPdf, makePdf } from './pdfs';

const span = (page: Page, text: string) => page.locator('.page:not([data-copy]) .textLayer span', { hasText: text }).first();
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Contents, pages and highlights' });
const thumbs = (page: Page) => sidebar(page).locator('.thumbs > li');
const pageNo = (page: Page) => page.locator('.doc-pane').first().locator('.page-no');

async function openPages(page: Page) {
  if (!(await sidebar(page).isVisible())) await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  await sidebar(page).getByRole('tab', { name: 'Pages' }).click();
}

/** Picks an action from a page's menu, and waits for the edit to land. */
async function pageAction(page: Page, n: number, action: string) {
  await thumbs(page)
    .nth(n - 1)
    .getByRole('button', { name: 'Page actions' })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: action }).click();
}

const settled = (page: Page) => expect(sidebar(page).getByRole('status')).toHaveCount(0);

/** How each page of the document in the viewer begins, in order; null while the viewer is replacing its pages. */
async function openings(page: Page) {
  try {
    const out: string[] = [];
    for (const p of await page.locator('.pdfViewer > .page').all()) {
      await p.scrollIntoViewIfNeeded({ timeout: 2000 });
      await expect(p.locator('.textLayer span').first()).toBeAttached({ timeout: 2000 });
      out.push(((await p.locator('.textLayer').textContent({ timeout: 2000 })) ?? '').slice(0, 15));
    }
    return out;
  } catch {
    return null;
  }
}

/** Waits for the viewer to show the pages beginning so, as it opens the new version of the file after an edit. */
const showsPages = (page: Page, expected: string[]) => expect.poll(() => openings(page), { timeout: 10_000 }).toEqual(expected);

/** Checks that a highlight covers the words it was made on, measured together as the page may be scrolling. */
async function highlightCovers(mark: Locator, text: string) {
  await expect(mark).toBeVisible();
  const [words, box] = await mark.evaluate((el, text) => {
    const words = [...el.closest('.page')!.querySelectorAll('.textLayer span')].find((s) => s.textContent?.includes(text));
    return [words!.getBoundingClientRect().toJSON() as Box, el.getBoundingClientRect().toJSON() as Box];
  }, text);
  expect(inside(words, box)).toBeGreaterThan(0.85);
  expect(inside(box, words)).toBeGreaterThan(0.6);
}

test('a turned page keeps its highlight on the same words and its handwriting with it, kept and exported', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight green' }).click();
  const mark = page.locator('.page:not([data-copy]) .hl.hl-green');
  await highlightCovers(mark, 'Coral reefs occupy');

  const docTools = page.getByRole('toolbar', { name: 'Document tools' });
  await docTools.getByRole('button', { name: 'Pen' }).click();
  const first = page.locator('.pdfViewer > .page[data-page-number="1"]');
  const at = (await first.boundingBox())!;
  await page.mouse.move(at.x + at.width * 0.2, at.y + at.height * 0.8);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(at.x + at.width * (0.2 + i * 0.02), at.y + at.height * 0.8);
  await page.mouse.up();
  await docTools.getByRole('button', { name: 'Select' }).click();
  const stroke = page.locator('.page:not([data-copy]) .ink-layer path');
  const flat = (await stroke.boundingBox())!;
  expect(flat.width).toBeGreaterThan(flat.height * 3);
  const inkWidth = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
    const [ink] = (await (await (await readPdf(await download.path()).promise).getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Ink');
    return ink.borderStyle.width as number;
  };
  const penWidth = await inkWidth();

  await openPages(page);
  await pageAction(page, 1, 'Rotate right');
  await settled(page);
  // The mark is redrawn as the page turns; between draws it has no box.
  await expect.poll(async () => ((b) => (b ? b.width / b.height : 0))(await first.boundingBox())).toBeGreaterThan(1.2);
  await highlightCovers(mark, 'Coral reefs occupy');
  // Drawn across the page, it now runs down the turned page, as long and with the same pen.
  const turned = (await stroke.boundingBox())!;
  const after = (await first.boundingBox())!;
  expect(turned.height).toBeGreaterThan(turned.width * 3);
  expect((turned.height / after.width) * 792).toBeCloseTo((flat.width / at.width) * 612, -0.5);
  expect(await inkWidth()).toBeCloseTo(penWidth, 2);
  await expect(thumbs(page).first().locator('.thumb')).toHaveCSS('aspect-ratio', /^1\.2/);
  await shot(page, 'pages-rotated');

  await page.reload();
  await expect(span(page, 'Coral reefs occupy')).toBeVisible();
  // The mark is redrawn as the page turns; between draws it has no box.
  await expect.poll(async () => ((b) => (b ? b.width / b.height : 0))(await first.boundingBox())).toBeGreaterThan(1.2);
  await highlightCovers(mark, 'Coral reefs occupy');

  // The exported page is turned, and its highlight's quad covers the words where they sit in the PDF.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const pdf = await readPdf(await download.path()).promise;
  const p1 = await pdf.getPage(1);
  expect(p1.rotate).toBe(90);
  const item = (await p1.getTextContent()).items.find((i) => 'str' in i && i.str.startsWith('Coral reefs occupy')) as { transform: number[]; width: number; height: number };
  const [highlight] = (await p1.getAnnotations()).filter((a) => a.subtype === 'Highlight');
  const xs = highlight.quadPoints.filter((_: number, i: number) => i % 2 === 0);
  const ys = highlight.quadPoints.filter((_: number, i: number) => i % 2 === 1);
  const [x, y] = [item.transform[4]!, item.transform[5]!];
  expect(x).toBeGreaterThan(Math.min(...xs) - 2);
  expect(x + item.width).toBeLessThan(Math.max(...xs) + 2);
  expect(y).toBeGreaterThan(Math.min(...ys) - 2);
  expect(y).toBeLessThan(Math.max(...ys));
  expect((await p1.getAnnotations()).filter((a) => a.subtype === 'Ink')).toHaveLength(1);
});

test('deleting a page moves the later highlights up with their cards, and undo brings back the page, its file and its highlights', async ({ page }) => {
  await openProject(page);
  await select(page, 'The ocean covers');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight green' }).click();
  await select(page, 'Mangrove forests protect');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  const chip = card(page, 'Mangrove forests').getByRole('button', { name: /Reef essay · p\./ });
  await expect(chip).toHaveText('Reef essay · p. 2');

  await openPages(page);
  let asked = '';
  page.once('dialog', (d) => ((asked = d.message()), d.accept()));
  await pageAction(page, 1, 'Delete page');
  await settled(page);
  expect(asked).toBe('Delete page 1? 1 highlight on it will be deleted too. Undo brings everything back.');
  await expect(pageNo(page)).toHaveText(/\/ 2$/);
  await expect(thumbs(page)).toHaveCount(2);
  await expect(chip).toHaveText('Reef essay · p. 1');
  // The highlight on the deleted page went with it; the excerpt's is the only one left.
  await expect(page.locator('.hl:not(.linked)')).toHaveCount(0);
  await showsPages(page, ['Mangrove forest', 'Kelp forests gr']);
  await highlightCovers(page.locator('.page[data-page-number="1"] .hl.linked'), 'Mangrove forests protect');
  await chip.click();
  await expect(page.locator('.page:not([data-copy]) .hl.flash')).toBeInViewport();

  // Undo is one step: the page, its highlight and the card's page all come back.
  await page.keyboard.press('Control+z');
  await expect(pageNo(page)).toHaveText(/\/ 3$/);
  await expect(chip).toHaveText('Reef essay · p. 2');
  await showsPages(page, ['The ocean cover', 'Mangrove forest', 'Kelp forests gr']);
  await highlightCovers(page.locator('.page[data-page-number="1"] .hl:not(.linked)'), 'The ocean covers');
  await expect(thumbs(page)).toHaveCount(3);

  await page.keyboard.press('Control+Shift+z');
  await expect(pageNo(page)).toHaveText(/\/ 2$/);
  await expect(chip).toHaveText('Reef essay · p. 1');
});

test('pages move by dragging and by menu, take pages from another file, and the result exports, reloads and restores from a backup', async ({ page }) => {
  await openProject(page);
  await page.locator('.page[data-page-number="3"]').scrollIntoViewIfNeeded();
  await select(page, 'Kelp forests grow');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await openPages(page);

  // Dragged above the first page, the last page becomes the first.
  await thumbs(page)
    .nth(2)
    .dragTo(thumbs(page).nth(0), { targetPosition: { x: 50, y: 10 } });
  await settled(page);
  await expect(card(page, 'Kelp forests').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 1');
  await showsPages(page, ['Kelp forests gr', 'The ocean cover', 'Mangrove forest']);
  // It stays selected where it landed.
  await expect(thumbs(page).nth(0).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-pressed', 'true');

  await pageAction(page, 1, 'Move down');
  await settled(page);
  await showsPages(page, ['The ocean cover', 'Kelp forests gr', 'Mangrove forest']);

  // A text file's pages go in after page 1.
  await thumbs(page).nth(0).getByRole('button', { name: 'Page actions' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menu').getByRole('menuitem', { name: 'Insert pages after…' }).click()]);
  await chooser.setFiles({
    name: 'Appendix.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Appendix: dive log for the northern transect, with water temperatures for each dive.'),
  });
  await settled(page);
  await showsPages(page, ['The ocean cover', 'Appendix: dive ', 'Kelp forests gr', 'Mangrove forest']);
  await expect(card(page, 'Kelp forests').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 3');

  // Two pages picked with Ctrl are duplicated together.
  await thumbs(page).nth(0).getByRole('button', { name: 'Page 1' }).click();
  await thumbs(page)
    .nth(1)
    .getByRole('button', { name: 'Page 2' })
    .click({ modifiers: ['ControlOrMeta'] });
  await expect(sidebar(page).getByRole('toolbar', { name: 'Selected pages' })).toContainText('2 pages');
  await shot(page, 'pages-selected');
  await pageAction(page, 2, 'Duplicate');
  await settled(page);
  const texts = ['The ocean cover', 'The ocean cover', 'Appendix: dive ', 'Appendix: dive ', 'Kelp forests gr', 'Mangrove forest'];
  await showsPages(page, texts);
  await expect(card(page, 'Kelp forests').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 5');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const pdf = await readPdf(await download.path()).promise;
  expect(pdf.numPages).toBe(6);
  const exported: string[] = [];
  for (let i = 1; i <= 6; i++) exported.push(((await (await pdf.getPage(i)).getTextContent()).items as { str: string }[]).map((t) => t.str).join(' '));
  expect(exported.map((t) => t.slice(0, 15))).toEqual(texts);
  expect((await (await pdf.getPage(5)).getAnnotations()).filter((a) => a.subtype === 'Highlight')).toHaveLength(1);
  writeFileSync(`${ARTIFACTS}/pages-exported.json`, JSON.stringify({ pages: exported }, null, 2));

  await page.reload();
  await expect(card(page, 'Kelp forests').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 5');
  await showsPages(page, texts);

  // A backup carries the edited file, and the restored copy has it.
  await page.goto('/');
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up Reef essay' }).click()]);
  const file = `${ARTIFACTS}/Reef essay (pages edited).gloss`;
  copyFileSync(await backup.path(), file);
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Reef essay' }).click();
  const [restore] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore a backup' }).click()]);
  await restore.setFiles({ name: 'Reef essay.gloss', mimeType: 'application/octet-stream', buffer: readFileSync(file) });
  await expect(card(page, 'Kelp forests').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 5');
  await showsPages(page, texts);
  await card(page, 'Kelp forests')
    .getByRole('button', { name: /Reef essay · p\./ })
    .click();
  await highlightCovers(page.locator('.page[data-page-number="5"] .hl.linked'), 'Kelp forests grow');
});

test('page tools say a password protected PDF needs an unprotected copy, and on a phone the menu fits', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles([
    { name: 'Survey.pdf', mimeType: 'application/pdf', buffer: await makePdf([['First page of the survey.'], ['Second page of the survey.']]) },
    { name: 'Locked.pdf', mimeType: 'application/pdf', buffer: await encryptedPdf('reef') },
  ]);
  const ask = page.getByRole('dialog', { name: 'Password needed' });
  await ask.getByLabel('Password').fill('reef');
  await ask.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.textLayer span').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Survey' }).click();
  await openPages(page);
  await thumbs(page).nth(1).getByRole('button', { name: 'Page actions' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 8);
  await shot(page, 'pages-phone-menu-dark');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await page.getByRole('tab', { name: 'Locked' }).click();
  await openPages(page);
  await expect(sidebar(page)).toContainText('Page tools need an unprotected copy of this PDF.');
  await expect(sidebar(page).getByRole('button', { name: 'Page actions' })).toHaveCount(0);
  await expect(thumbs(page).first()).toHaveAttribute('draggable', 'false');
  await context.close();
});
