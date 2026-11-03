import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, card, exportNotes, openProject, pdf, select, shot } from './helpers';
import { ESSAY, NOTES } from './pdfs';

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const searchbox = (page: Page) => page.getByRole('searchbox', { name: 'Search documents and cards' });
const selection = (page: Page) => page.getByRole('toolbar', { name: 'Selection' });
const docTabs = (page: Page) => page.getByRole('tablist', { name: 'Open documents' });

/** Whether the middle of an element is what a click there would reach, rather than something over it. */
const reachable = (page: Page, name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.right <= innerWidth && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });

test('search results are walked with the arrow keys, opened with Enter and closed with Escape', async ({ page }) => {
  await openProject(page);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(searchbox(page)).toBeFocused();
  await page.keyboard.type('reef');
  const results = page.getByRole('listbox', { name: 'Search results' });
  const options = results.getByRole('option');
  await expect(options).toHaveCount(3);
  // Opaque, so the page behind does not show through.
  expect(await results.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(searchbox(page)).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!);
  await page.keyboard.press('ArrowUp');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await shot(page, 'search-keyboard');
  await page.keyboard.press('Enter');
  await expect(results).toHaveCount(0);
  await expect(page.locator('.page-no')).toHaveText('Page 2 / 3');

  await searchbox(page).focus();
  await expect(results).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(results).toHaveCount(0);
});

test('on a phone, a long project name wraps onto two lines and takes the header while it is renamed', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  const name = page.getByRole('textbox', { name: 'Project name' });
  const header = page.locator('header.bar');
  const before = (await header.boundingBox())!.height;
  const long = 'Coral reef bleaching and recovery study across the Andaman islands 2026';
  await name.tap();
  await name.fill(long);
  // While it is renamed the header's other buttons step aside, so the name has the width to be read.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
  expect((await name.boundingBox())!.width).toBeGreaterThan(300);
  await shot(page, 'phone-name-editing');
  // Enter finishes rather than starting a new line.
  await name.press('Enter');
  await expect(name).not.toBeFocused();
  await expect(name).toHaveValue(long);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  // At rest it shows two lines, and neither the header nor the page grows for it.
  const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(await name.evaluate((el) => el.clientHeight)).toBeCloseTo(2 * lineHeight, 0);
  expect((await header.boundingBox())!.height).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, 'phone-name-long');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(long);
  await context.close();
});

test('on a phone, search opens over the header and its results stay on the screen', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  const name = page.getByRole('textbox', { name: 'Project name' });
  expect((await name.boundingBox())!.width).toBeGreaterThan(120);
  await expect(searchbox(page)).toBeHidden();
  await page.getByRole('button', { name: 'Search', exact: true }).tap();
  await expect(searchbox(page)).toBeFocused();
  await page.keyboard.type('reef');
  const results = page.getByRole('listbox', { name: 'Search results' });
  await expect(results.getByRole('option')).toHaveCount(3);
  const box = (await results.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(page, 'phone-search');
  await results.getByRole('option').first().tap();
  await expect(searchbox(page)).toBeHidden();

  // Export notes is there too, as an icon, and its menu fits.
  await page.getByRole('tab', { name: 'Canvas', exact: true }).tap();
  await page.getByRole('button', { name: 'Note', exact: true }).tap();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Notes from a phone');
  await exportNotes(page);
  const menu = page.getByRole('menu');
  await expect(menu).toBeInViewport({ ratio: 1 });
  await shot(page, 'phone-export-menu');
  const [download] = await Promise.all([page.waitForEvent('download'), menu.getByRole('group', { name: 'Download' }).getByRole('menuitem', { name: 'Markdown (.md)' }).tap()]);
  copyFileSync(await download.path(), `${ARTIFACTS}/phone-notes.md`);
  expect(readFileSync(`${ARTIFACTS}/phone-notes.md`, 'utf8')).toContain('Notes from a phone');
  await context.close();
});

test('Escape puts the selection toolbar away; a drag that lands nowhere brings it back; Copy says it copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await expect(selection(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(selection(page)).toHaveCount(0);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');

  // Pressed inside the selection and let go back on the page, nothing took the drag.
  const from = await select(page, 'Coral reefs occupy');
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 220, { steps: 10 });
  await page.mouse.up();
  await expect(selection(page)).toBeVisible();

  await selection(page).getByRole('button', { name: 'Copy' }).click();
  await expect(selection(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  await shot(page, 'copied');
  await expect(selection(page)).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Coral reefs occupy');

  // A highlight's toolbar goes on Escape too.
  await select(page, 'Rising sea temperatures');
  await selection(page).getByRole('button', { name: 'Highlight green' }).click();
  const mark = (await page.locator('.page:not([data-copy]) .hl.hl-green').first().boundingBox())!;
  await page.mouse.click(mark.x + 20, mark.y + mark.height / 2);
  await expect(page.getByRole('toolbar', { name: 'Highlight' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Highlight' })).toHaveCount(0);

  // Escape in the comment editor keeps what was written.
  await page.mouse.click(mark.x + 20, mark.y + mark.height / 2);
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Kept on Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Comment' })).toHaveCount(0);
  await expect(page.locator('.page:not([data-copy]) .note-mark')).toHaveAttribute('title', 'Kept on Escape');
});

test('however many documents, canvases and panes, the buttons beside the tabs stay in reach', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles(
    await Promise.all(
      ['Reef essay', 'Survey notes', 'Kelp forests', 'Mangroves of the northern coast', 'Seagrass meadows', 'Parrotfish counts'].map((n, i) =>
        pdf(`${n}.pdf`, i % 2 ? NOTES : ESSAY),
      ),
    ),
  );
  await expect(docTabs(page).getByRole('tab')).toHaveCount(6);
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'New canvas' }).click();
  await expect(page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 8' })).toBeInViewport();
  await page.getByRole('button', { name: 'Open side by side' }).click();
  await shot(page, 'tabs-overflow');
  for (const name of ['Contents, pages and highlights', 'Add file', 'Add from a link', 'Close this pane', 'New canvas']) expect(await reachable(page, name), name).toBe(true);
  // Only the tab list scrolls, and the pane itself does not.
  expect(
    await page
      .locator('.doc-pane')
      .first()
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);

  // The arrow keys move between the tabs, and only the open one is in the Tab order.
  const tabs = docTabs(page).first().getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(tabs.nth(5)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(5)).toBeInViewport();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
});

test('a document removed comes back with undo, with its highlights, comments and cards', async ({ page }) => {
  await openProject(page);
  await page.getByRole('tab', { name: 'Survey notes' }).click();
  await select(page, 'Field notes from the reef survey.');
  await selection(page).getByRole('button', { name: 'Excerpt' }).click();
  await card(page, 'Field notes').getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Before the heatwave.');
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 560 } });

  let asked = '';
  page.once('dialog', (d) => ((asked = d.message()), void d.accept()));
  await page.getByRole('button', { name: 'Remove Survey notes' }).click();
  expect(asked).toContain('Undo brings it all back');
  await expect(docTabs(page).getByRole('tab')).toHaveCount(1);
  await expect(card(page, 'Field notes')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(docTabs(page).getByRole('tab')).toHaveCount(2);
  await expect(card(page, 'Field notes')).toContainText('Before the heatwave.');
  await page.getByRole('tab', { name: 'Survey notes' }).click();
  await expect(page.locator('.textLayer span', { hasText: 'Field notes from the reef survey.' })).toBeVisible();
  await expect(page.locator('.page:not([data-copy]) .hl')).toHaveCount(1);

  // Removed for good once the project is closed: its file goes then, and only then.
  const files = () =>
    page.evaluate(
      () =>
        new Promise<number>((done) => {
          const open = indexedDB.open('gloss');
          open.onsuccess = () => {
            const count = open.result.transaction('files').objectStore('files').count();
            count.onsuccess = () => (done(count.result), open.result.close());
          };
        }),
    );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove Survey notes' }).click();
  expect(await files()).toBe(2);
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect.poll(files).toBe(1);
  await expect(page.getByRole('link', { name: /Reef essay/ })).toContainText('1 document');
});

test('the project keeps a name, and an empty project takes the name of its first document', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start an empty project' }).click();
  const name = page.getByRole('textbox', { name: 'Project name' });
  await expect(name).toHaveValue('Untitled project');
  // The empty project offers files and web pages once, in its middle.
  await expect(page.getByRole('button', { name: 'Add file' })).toHaveCount(0);
  await expect(page.locator('.doc-pane .empty').getByRole('button', { name: 'Add from a link' })).toBeVisible();
  await shot(page, 'empty-project');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose files' }).click()]);
  await chooser.setFiles(await pdf('Reef essay.pdf', ESSAY));
  await expect(name).toHaveValue('Reef essay');

  await name.fill('');
  await name.blur();
  await expect(name).toHaveValue('Reef essay');
  await name.fill('Draft name');
  await name.press('Escape');
  await expect(name).toHaveValue('Reef essay');
  await expect(page).toHaveTitle('Reef essay · Gloss');
  await name.fill('Reef project');
  await name.press('Enter');
  await expect(page).toHaveTitle('Reef project · Gloss');
});

test('a tablet held upright shows one side at a time, and held sideways shows both', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  const show = page.getByRole('tablist', { name: 'Show' });
  await expect(show).toBeVisible();
  await expect(page.locator('.textLayer span').first()).toBeInViewport();
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).not.toBeInViewport();
  await shot(page, 'tablet-portrait');
  await show.getByRole('tab', { name: 'Canvas', exact: true }).tap();
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeInViewport();

  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(show).toBeHidden();
  await expect(page.locator('.textLayer span').first()).toBeInViewport();
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeInViewport();
  await shot(page, 'tablet-landscape');
  await context.close();
});

test('on a phone the sidebar closes from its own button or the dimmed page beside it', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  const sidebar = page.getByRole('complementary', { name: 'Contents, pages and highlights' });
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).tap();
  await expect(sidebar).toBeVisible();
  await shot(page, 'phone-sidebar');
  await page.getByRole('button', { name: 'Close the sidebar' }).tap();
  await expect(sidebar).toHaveCount(0);
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).tap();
  await page.locator('.side-backdrop').tap({ position: { x: 370, y: 300 } });
  await expect(sidebar).toHaveCount(0);
  await expect(page.locator('.doc-status')).toBeInViewport({ ratio: 1 });
  await context.close();
});

test('a problem shows over the workspace without moving it, and a link cut short says so', async ({ page }) => {
  await openProject(page);
  const top = (await page.locator('.doc-pane').boundingBox())!.y;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add file' }).click()]);
  await chooser.setFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not really') });
  await expect(page.getByRole('alert')).toContainText('broken could not be read as a PDF.');
  expect((await page.locator('.doc-pane').boundingBox())!.y).toBe(top);
  await shot(page, 'problem-toast');
  await page.getByRole('alert').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.goto('/#/join/garbage');
  await expect(page.getByRole('heading', { name: 'This share link is not complete' })).toBeVisible();
  await shot(page, 'share-link-cut-short');
  await page.getByRole('link', { name: 'All projects' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await page.goto('/#/p/not-here');
  await expect(page.getByRole('heading', { name: 'This project is not here' })).toBeVisible();
});
