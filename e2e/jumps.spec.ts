import { expect, test, type Page } from '@playwright/test';
import { openProject, openWith, pdf, PHONE, select, shot } from './helpers';
import { reportWithContents } from './pdfs';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Go to' });
/** Opens the palette and waits for its field, so no key typed next goes elsewhere. */
async function openPalette(page: Page, key = 'p') {
  await page.keyboard.press(`ControlOrMeta+${key}`);
  await expect(palette(page).getByRole('combobox')).toBeFocused();
}
const pageNo = (page: Page, pane = 0) => page.locator('.doc-pane').nth(pane).locator('.page-no');
const allSearch = (page: Page) => page.getByRole('searchbox', { name: 'Search all projects' });
const allResults = (page: Page) => page.getByRole('listbox', { name: 'Results in all projects' });

test('the palette jumps to a page, a document, a contents entry, a canvas, a tag and an action, in the pane last used', async ({ page }) => {
  const report = await reportWithContents(8, [
    { title: 'Introduction', page: 1 },
    { title: 'Methods', page: 4, children: [{ title: 'Sampling', page: 5 }] },
  ]);
  await openWith(page, [
    { name: 'Reef report.pdf', buffer: report },
    { name: 'Reef essay.pdf', buffer: (await pdf('Reef essay.pdf', [['The ocean covers most of the Earth.'], ['Coral reefs are rich.']])).buffer },
  ]);

  await test.step('A page number', async () => {
    await openPalette(page);
    await expect(palette(page)).toBeVisible();
    await page.keyboard.type('6');
    await expect(palette(page).getByRole('option').first()).toHaveText(/Go to page 6 of 8/);
    await shot(page, 'palette-page');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toHaveCount(0);
    await expect(pageNo(page)).toHaveText('Page 6 / 8');
  });

  await test.step('A contents entry, walked to with the arrow keys', async () => {
    await openPalette(page, 'g');
    await page.keyboard.type('contents');
    const options = palette(page).getByRole('option');
    await expect(options).toHaveText([/Introduction/, /Methods/, /Sampling/]);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(pageNo(page)).toHaveText('Page 4 / 8');
  });

  await test.step('A document, a canvas and an action', async () => {
    await openPalette(page);
    await page.keyboard.type('essay');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Reef essay' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('button', { name: 'New canvas' }).click();
    await page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab').first().click();
    await openPalette(page);
    await page.keyboard.type('canvas 2');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 2' })).toHaveAttribute('aria-selected', 'true');

    await openPalette(page);
    await page.keyboard.type('new note');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('Written from the palette');
    await page.locator('.react-flow__pane').click({ position: { x: 30, y: 400 } });
    await openPalette(page);
    await page.keyboard.type('undo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.card .grow[data-value="Written from the palette"]')).toHaveCount(0);
  });

  await test.step('A tag filters the canvas', async () => {
    await select(page, 'Coral reefs are rich.');
    await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight with tag' }).click();
    await page.getByRole('textbox', { name: 'Find or make a tag' }).fill('Coral');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Done' }).click();
    await openPalette(page);
    await page.keyboard.type('coral');
    await expect(palette(page).getByRole('option', { name: /Filter by Coral/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Filtered by Coral' })).toBeVisible();
  });

  await test.step('In the second pane, a page number moves that pane only', async () => {
    await page.getByRole('tab', { name: 'Reef report' }).click();
    await page.getByRole('button', { name: 'Open side by side' }).click();
    await expect(page.locator('.doc-pane')).toHaveCount(2);
    const second = page.locator('.doc-pane').nth(1);
    await second.getByRole('tab', { name: 'Reef report' }).click();
    await expect(second.locator('.textLayer span').first()).toBeVisible();
    await second.locator('.doc-scroll').click({ position: { x: 20, y: 200 } });
    const before = await pageNo(page).textContent();
    await openPalette(page);
    await page.keyboard.type('p 7');
    await page.keyboard.press('Enter');
    await expect(pageNo(page, 1)).toHaveText('Page 7 / 8');
    await expect(pageNo(page)).toHaveText(before!);
    await openPalette(page);
    await page.keyboard.type('Nothing is called this');
    await expect(palette(page)).toContainText('Nothing matches');
    for (const scheme of ['light', 'dark'] as const) {
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      await page.waitForTimeout(300);
      await shot(page, `palette-${scheme}`);
    }
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
  });
});

test('on a phone, the palette fits the screen and jumps to a page', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  await openPalette(page);
  await page.keyboard.type('3');
  const box = (await palette(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(page, 'palette-phone');
  await palette(page).getByRole('option').first().tap();
  await expect(pageNo(page)).toHaveText(/3 \/ 3$/);
  await context.close();
});

/** Records whether the start page said it was reading documents, as it may say so only briefly. */
const watchIndexing = (page: Page) =>
  page.evaluate(() => {
    const w = window as { sawIndexing?: boolean };
    w.sawIndexing = false;
    new MutationObserver(() => {
      if (document.body.textContent?.includes('Reading documents for search')) w.sawIndexing = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
const sawIndexing = (page: Page) => page.evaluate(() => (window as { sawIndexing?: boolean }).sawIndexing);

test('the start page searches every project, reading each document once, and opens a project at what it found', async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Parrotfish census plan');
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 420 } });
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  await page.getByRole('dialog', { name: 'Comment' }).getByRole('textbox').fill('Ask about turbidity');
  await page.getByRole('dialog', { name: 'Comment' }).getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);

  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles(await pdf('Kelp report.pdf', [['Cold water upwelling feeds the forest.'], ['Under the giant kelp canopy, light is scarce.']]));
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.goto('/');

  await test.step('The first search reads the documents and says so', async () => {
    await watchIndexing(page);
    await allSearch(page).fill('kelp canopy');
    const hit = allResults(page)
      .getByRole('group', { name: 'Kelp report' })
      .getByRole('option', { name: /Kelp report, p\. 2/ });
    await expect(hit).toBeVisible();
    expect(await sawIndexing(page)).toBe(true);
    for (const scheme of ['light', 'dark'] as const) {
      await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
      await page.waitForTimeout(300);
      await shot(page, `all-search-${scheme}`);
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await hit.click();
    await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Kelp report');
    await expect(pageNo(page)).toHaveText('Page 2 / 2');
    await expect(page.locator('.textLayer .highlight').first()).toBeVisible();
  });

  await test.step('A card and a comment open where they are, from the keyboard', async () => {
    await page.goto('/');
    await watchIndexing(page);
    await allSearch(page).fill('parrotfish census');
    await expect(allResults(page).getByRole('option', { name: 'Parrotfish census plan' })).toBeVisible();
    // Read once: the index is kept, so this search has nothing to read.
    expect(await sawIndexing(page)).toBe(false);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Reef essay');
    await expect(page.locator('.react-flow__node.selected .grow[data-value="Parrotfish census plan"]')).toBeVisible();

    await page.goto('/');
    await allSearch(page).fill('turbidity');
    await allResults(page)
      .getByRole('option', { name: /Ask about turbidity/ })
      .click();
    await expect(page.locator('.hl.flash').first()).toBeInViewport();
  });

  await test.step('A project is found by its name', async () => {
    await page.goto('/');
    await allSearch(page).fill('kelp report');
    await allResults(page).getByRole('option', { name: 'Kelp report', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Kelp report');
  });
});

test('on a phone, the start page search and its results fit the screen', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  await page.goto('/');
  await allSearch(page).fill('reef');
  await expect(allResults(page).getByRole('option').first()).toBeVisible();
  const box = (await allResults(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => document.documentElement.classList.toggle('dark', s === 'dark'), scheme);
    await page.waitForTimeout(300);
    await shot(page, `all-search-phone-${scheme}`);
  }
  await context.close();
});
