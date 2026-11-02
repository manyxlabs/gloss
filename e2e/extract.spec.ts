import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, openProject, readPdf, select, shot } from './helpers';

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Contents, pages and highlights' });
const thumbs = (page: Page) => sidebar(page).locator('.thumbs > li');
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open documents' }).first().getByRole('tab');

async function openPages(page: Page) {
  if (!(await sidebar(page).isVisible())) await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  await sidebar(page).getByRole('tab', { name: 'Pages' }).click();
}

async function pageAction(page: Page, n: number, action: string) {
  await thumbs(page)
    .nth(n - 1)
    .getByRole('button', { name: 'Page actions' })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: action }).click();
}

test('pages extracted to a new document bring their highlights, comments, links and handwriting, and undo takes it away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProject(page);
  await page.locator('.page[data-page-number="2"]').scrollIntoViewIfNeeded();
  await select(page, 'Mangrove forests protect');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Blue carbon');
  await page.keyboard.press('Control+Enter');
  await select(page, 'Overfishing removes');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Link', exact: true }).click();
  await page.locator('.page[data-page-number="3"]').scrollIntoViewIfNeeded();
  await select(page, 'Kelp forests grow');
  // And one on the first page, which stays behind.
  await page.locator('.page[data-page-number="1"]').scrollIntoViewIfNeeded();
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight pink' }).click();

  await openPages(page);
  await thumbs(page).nth(1).getByRole('button', { name: 'Page 2' }).click();
  await thumbs(page)
    .nth(2)
    .getByRole('button', { name: 'Page 3' })
    .click({ modifiers: ['ControlOrMeta'] });
  await pageAction(page, 2, 'Extract pages to a new document');

  await expect(tabs(page)).toHaveCount(3);
  await expect(tabs(page).nth(1)).toHaveText('Reef essay (pages 2-3)');
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.page-no').first()).toContainText('/ 2');
  const view = page.locator('.page:not([data-copy])');
  await expect(view.locator('.textLayer').first()).toContainText('Mangrove forests protect');
  await expect(view.locator('.hl')).toHaveCount(3);
  await expect(view.locator('.hl.hl-pink')).toHaveCount(0);
  await expect(view.locator('.note-mark')).toHaveAttribute('title', 'Blue carbon');
  await expect(view.locator('.link-mark')).toHaveCount(2);
  await shot(page, 'extract-new-doc');

  // The original keeps everything it had.
  await tabs(page).first().click();
  await expect(page.locator('.page:not([data-copy]) .hl')).toHaveCount(4);

  await page.keyboard.press('Control+z');
  await expect(tabs(page)).toHaveCount(2);
});

test('a page downloaded as a PDF holds only that page', async ({ page }) => {
  await openProject(page);
  await openPages(page);
  const [download] = await Promise.all([page.waitForEvent('download'), pageAction(page, 3, 'Download it as a PDF')]);
  expect(download.suggestedFilename()).toBe('Reef essay (page 3).pdf');
  const file = `${ARTIFACTS}/extract-page-3.pdf`;
  await download.saveAs(file);
  const pdf = await readPdf(file).promise;
  expect(pdf.numPages).toBe(1);
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
  expect(text).toContain('Kelp forests grow');
  expect(text).not.toContain('Mangrove');
  // Nothing changed in the project.
  await expect(tabs(page)).toHaveCount(2);
  await expect(page.locator('.page-no').first()).toContainText('/ 3');
});
