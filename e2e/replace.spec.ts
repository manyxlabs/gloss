import { expect, test, type Page } from '@playwright/test';
import { card, inside, openProject, pdf, select, shot, type Box } from './helpers';
import { ESSAY } from './pdfs';

/**
 * The essay revised: a paragraph inserted at the top, a word changed in a sentence, the
 * paragraphs flowing onto different pages, and one paragraph cut.
 */
const NEW = 'Editor’s note: this revised edition adds a summary of recent survey results from three Pacific atolls and corrects two figures.';
const REVISED = [
  [NEW, ESSAY[0]![0]!, ESSAY[0]![1]!],
  [ESSAY[0]![2]!.replace('expel', 'eject'), ESSAY[1]![0]!],
  [ESSAY[1]![1]!, ESSAY[2]![0]!],
];

const selection = (page: Page) => page.getByRole('toolbar', { name: 'Selection' });
const mark = (page: Page, color: string) => page.locator(`.page:not([data-copy]) .hl.hl-${color}`).first();
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Contents, pages and highlights' });

/** Whether a highlight lies over the line of text holding `text`, on the page it is drawn on. */
async function covers(page: Page, color: string, text: string) {
  const el = mark(page, color);
  await el.scrollIntoViewIfNeeded();
  await expect(el).toBeVisible();
  const [line, box, pageNo] = await el.evaluate((m, text) => {
    const div = m.closest('.page') as HTMLElement;
    const span = [...div.querySelectorAll('.textLayer span')].find((s) => s.textContent?.includes(text));
    return [span?.getBoundingClientRect().toJSON() as Box | undefined, m.getBoundingClientRect().toJSON() as Box, Number(div.dataset.pageNumber)] as const;
  }, text);
  expect(line, `the highlighted line holds “${text}”`).toBeTruthy();
  expect(inside(line!, box)).toBeGreaterThan(0.85);
  expect(inside(box, line!)).toBeGreaterThan(0.6);
  return pageNo;
}

/** How far a page's handwriting is below a line of its text, as a share of the page's height. */
async function inkBelow(page: Page, text: string) {
  return page
    .locator('.page:not([data-copy]) .ink-layer path')
    .first()
    .evaluate((path, text) => {
      const div = path.closest('.page')!;
      const span = [...div.querySelectorAll('.textLayer span')].find((s) => s.textContent?.includes(text))!;
      return (path.getBoundingClientRect().top - span.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    }, text);
}

async function replaceWith(page: Page, pages: string[][]) {
  await page.getByRole('button', { name: 'All documents' }).first().click();
  await page.getByRole('dialog', { name: 'All documents' }).getByRole('button', { name: 'Actions for Reef essay' }).click();
  await page.getByRole('menuitem', { name: 'Replace with a newer version…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace “Reef essay”' });
  await expect(dialog).toContainText('move to the same words');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByRole('button', { name: 'Choose the new version' }).click()]);
  await chooser.setFiles(await pdf('Reef essay, revised.pdf', pages));
  return dialog;
}

test('replacing a document with a revised version keeps its marks on the same words, sets aside what is gone, and undoes in one step', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProject(page);

  await test.step('Mark the essay: an excerpt, a highlight with a comment, two more highlights and a stroke', async () => {
    await page.locator('.page[data-page-number="2"]').scrollIntoViewIfNeeded();
    await select(page, 'Overfishing removes');
    await selection(page).getByRole('button', { name: 'Excerpt' }).click();
    await expect(card(page, 'Overfishing removes')).toBeVisible();
    await select(page, 'Marine protected areas');
    await selection(page).getByRole('button', { name: 'Highlight pink' }).click();

    await page.locator('.page[data-page-number="1"]').scrollIntoViewIfNeeded();
    await select(page, 'Coral reefs occupy');
    await selection(page).getByRole('button', { name: 'Highlight blue' }).click();
    const coral = (await mark(page, 'blue').boundingBox())!;
    await page.mouse.click(coral.x + 40, coral.y + coral.height / 2);
    await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Comment' }).click();
    await page.keyboard.type('Check this figure against the survey');
    await page.keyboard.press('Control+Enter');
    await select(page, 'Rising sea temperatures');
    await selection(page).getByRole('button', { name: 'Highlight green' }).click();

    // A stroke in the margin under the coral line.
    const tools = page.getByRole('toolbar', { name: 'Document tools' });
    await tools.getByRole('button', { name: 'Pen' }).click();
    const line = (await mark(page, 'blue').boundingBox())!;
    await page.mouse.move(line.x, line.y + 30);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(line.x + i * 12, line.y + 30);
    await page.mouse.up();
    await tools.getByRole('button', { name: 'Select' }).click();
    expect(await inkBelow(page, 'Coral reefs occupy')).toBeGreaterThan(0.01);
  });
  const inkBefore = await inkBelow(page, 'Coral reefs occupy');

  await test.step('Replace it with the revised version', async () => {
    const dialog = await replaceWith(page, REVISED);
    const report = dialog.getByRole('status');
    await expect(report).toContainText('3 highlights are on the same words in the new version.');
    await expect(report).toContainText('1 highlight could not be found.');
    await expect(report.getByRole('listitem')).toHaveText([/^Marine protected areas/]);
    await shot(page, 'replace-report');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
  });

  await test.step('Each mark is on its words in the new pages', async () => {
    await expect(page.locator('.page-no').first()).toHaveText(/\/ 3$/);
    await expect(page.locator('.pdfViewer > .page[data-page-number="1"] .textLayer')).toContainText('Editor’s note', { timeout: 10_000 });
    expect(await covers(page, 'blue', 'Coral reefs occupy')).toBe(1);
    // The sentence with a word changed, now on the second page.
    expect(await covers(page, 'green', 'Rising sea temperatures')).toBe(2);
    expect(await covers(page, 'yellow', 'Overfishing removes')).toBe(3);
    await expect(page.locator('.page:not([data-copy]) .note-mark')).toHaveAttribute('title', 'Check this figure against the survey');
    await expect(card(page, 'Overfishing removes').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 3');
    // The stroke moved down with the line it was under.
    expect(Math.abs((await inkBelow(page, 'Coral reefs occupy')) - inkBefore)).toBeLessThan(0.008);
    await mark(page, 'blue').scrollIntoViewIfNeeded();
    await shot(page, 'replace-after');
  });

  await test.step('The highlight whose paragraph was cut waits in the sidebar, and is placed again on a selection', async () => {
    await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
    await sidebar(page).getByRole('tab', { name: 'Highlights' }).click();
    const unplaced = sidebar(page).getByRole('region', { name: 'Unplaced highlights' });
    await expect(unplaced).toContainText('Unplaced (1)');
    await expect(unplaced.getByRole('listitem')).toHaveText(/Marine protected areas/);
    await page.mouse.move(600, 500);
    await shot(page, 'replace-unplaced');
    const place = unplaced.getByRole('button', { name: 'Place', exact: true });
    await expect(place).toBeDisabled();
    await select(page, 'Kelp forests grow');
    await place.click();
    await expect(unplaced).toHaveCount(0);
    expect(await covers(page, 'pink', 'Kelp forests grow')).toBe(3);
    await page.keyboard.press('Control+z');
    await expect(unplaced).toContainText('Unplaced (1)');
  });

  await test.step('Undo brings back the old version with every mark where it was', async () => {
    await page.keyboard.press('Control+z');
    await expect(page.locator('.pdfViewer > .page[data-page-number="1"] .textLayer')).not.toContainText('Editor’s note', { timeout: 10_000 });
    await expect(sidebar(page).getByRole('region', { name: 'Unplaced highlights' })).toHaveCount(0);
    expect(await covers(page, 'pink', 'Marine protected areas')).toBe(2);
    expect(await covers(page, 'green', 'Rising sea temperatures')).toBe(1);
    await expect(card(page, 'Overfishing removes').getByRole('button', { name: /Reef essay · p\./ })).toHaveText('Reef essay · p. 2');
    expect(Math.abs((await inkBelow(page, 'Coral reefs occupy')) - inkBefore)).toBeLessThan(0.001);
    // And redo replaces it again.
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.pdfViewer > .page[data-page-number="1"] .textLayer')).toContainText('Editor’s note', { timeout: 10_000 });
  });

  await test.step('Kept after a reload', async () => {
    await page.reload();
    await expect(page.locator('.pdfViewer > .page[data-page-number="1"] .textLayer')).toContainText('Editor’s note', { timeout: 10_000 });
    expect(await covers(page, 'blue', 'Coral reefs occupy')).toBe(1);
  });
});

test('a document replaced on a phone reports in a dialog that fits the screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await selection(page).getByRole('button', { name: 'Highlight blue' }).click();
  const dialog = await replaceWith(page, REVISED);
  await expect(dialog.getByRole('status')).toContainText('1 highlight is on the same words');
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(page, 'replace-phone');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await context.close();
});
