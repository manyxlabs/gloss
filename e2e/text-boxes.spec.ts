import { copyFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ARTIFACTS, card, openProject, pdf, PHONE, readPdf, select, shot } from './helpers';
import { ESSAY } from './pdfs';

const docTool = (page: Page, name: string) => page.getByRole('toolbar', { name: 'Document tools' }).first().getByRole('button', { name }).click();
const sheet = (page: Page, n = 1) => page.locator(`.pdfViewer > .page[data-page-number="${n}"]`);
const boxes = (page: Page) => page.locator('.page:not([data-copy]) .text-box');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Highlight' });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Contents, pages and highlights' });

/** Where a box is on its page, and how big, as fractions of the page as shown. */
const placeOf = (box: Locator) =>
  box.evaluate((el) => {
    const p = el.closest('.page')!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return {
      x: (b.left - p.left) / p.width,
      y: (b.top - p.top) / p.height,
      w: b.width / p.width,
      h: b.height / p.height,
      page: el.closest<HTMLElement>('.page')!.dataset.pageNumber,
    };
  });

/** Clicks a spot on a page, given as fractions of it. */
async function tapPage(page: Page, fx: number, fy: number, n = 1) {
  const at = (await sheet(page, n).boundingBox())!;
  await page.mouse.click(at.x + at.width * fx, at.y + at.height * fy);
}

/** Drags with the mouse from the middle of an element by an offset, in steps, as a hand would. */
async function drag(page: Page, from: Locator, dx: number, dy: number) {
  const b = (await from.boundingBox())!;
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

async function exported(page: Page, name: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).first().click()]);
  const file = `${ARTIFACTS}/${name}`;
  copyFileSync(await download.path(), file);
  return readPdf(file).promise;
}

test('a text box is placed with a tap, typed in, moved, resized, recoloured and resized again, found, linked, excerpted and deleted, with undo', async ({ page }) => {
  test.setTimeout(120_000);
  await openProject(page);
  await docTool(page, 'Text box');
  await tapPage(page, 0.5, 0.42);
  const box = boxes(page);
  const text = page.getByRole('textbox', { name: 'Text box' });
  await expect(text).toBeFocused();
  // The first line is where the page was tapped.
  const placed = await placeOf(box);
  expect(placed.x).toBeLessThan(0.5);
  expect(placed.x).toBeGreaterThan(0.47);
  expect(placed.y + placed.h / 2).toBeCloseTo(0.42, 2);
  await page.keyboard.type('Check the bleaching figures against the 2016 survey');
  await page.keyboard.press('Enter');
  await page.keyboard.type('and the reef map');
  await expect(text).toHaveText('Check the bleaching figures against the 2016 survey\nand the reef map');
  await expect(toolbar(page)).toBeVisible();
  await shot(page, 'text-box-typing');

  // Escape leaves the typing, with the box still chosen; Escape again lets it go.
  await page.keyboard.press('Escape');
  await expect(text).not.toBeFocused();
  await expect(box).toHaveClass(/chosen/);
  await expect(toolbar(page)).toBeVisible();
  await shot(page, 'text-box-chosen');
  await page.keyboard.press('Escape');
  await expect(toolbar(page)).toBeHidden();
  await expect(box).not.toHaveClass(/chosen/);

  // Undo takes the typing back in one step, then the box; redo brings both.
  await page.keyboard.press('Control+z');
  await expect(text).toHaveText('');
  await page.keyboard.press('Control+z');
  await expect(box).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(text).toHaveText(/and the reef map$/);

  // A box tapped and left empty goes.
  await tapPage(page, 0.3, 0.5);
  await expect(boxes(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(boxes(page)).toHaveCount(1);

  await docTool(page, 'Select');
  await box.click();
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole('button', { name: 'Make it green' }).click();
  await expect(box).toHaveClass(/hl-green/);
  const medium = await placeOf(box);
  await toolbar(page).getByRole('button', { name: 'Text size: medium' }).click();
  await expect(toolbar(page).getByRole('button', { name: 'Text size: large' })).toBeVisible();
  await expect.poll(async () => (await placeOf(box)).h).toBeGreaterThan(medium.h * 1.25);

  // Moved by dragging, by as much as the pointer moved.
  const before = await placeOf(box);
  const page1 = (await sheet(page).boundingBox())!;
  await drag(page, box, -page1.width * 0.2, -page1.height * 0.1);
  await expect.poll(async () => (await placeOf(box)).x).toBeCloseTo(before.x - 0.2, 2);
  expect((await placeOf(box)).y).toBeCloseTo(before.y - 0.1, 2);

  // Resized narrower from its right edge, its words take more lines.
  const wide = await placeOf(box);
  await expect(box).toHaveClass(/chosen/);
  await drag(page, box.locator('.box-grip'), -page1.width * 0.12, 0);
  await expect.poll(async () => (await placeOf(box)).w).toBeCloseTo(wide.w - 0.12, 2);
  expect((await placeOf(box)).h).toBeGreaterThan(wide.h * 1.2);
  await shot(page, 'text-box-resized');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await placeOf(box)).w).toBeCloseTo(wide.w, 2);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await placeOf(box)).w).toBeCloseTo(wide.w - 0.12, 2);

  // A second click on the chosen box types in it again.
  await box.click();
  await expect(box).toHaveClass(/chosen/);
  await box.click();
  await expect(text).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' too');
  await page.keyboard.press('Escape');
  await expect(text).toHaveText(/and the reef map too$/);
  await page.keyboard.press('Escape');

  // Search finds its words, which are not in the PDF.
  await page.getByRole('searchbox', { name: 'Search documents and cards' }).fill('reef map');
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('group', { name: 'Text boxes' })).toBeVisible();
  await page
    .getByRole('listbox', { name: 'Search results' })
    .getByRole('option', { name: /reef map too/ })
    .click();
  await expect(box).toHaveClass(/flash/);

  // Linked to a passage like a highlight: each shows a marker in the margin.
  await box.click();
  await toolbar(page).getByRole('button', { name: 'Link', exact: true }).click();
  await select(page, 'Coral reefs occupy');
  await expect(page.locator('.page:not([data-copy]) .link-mark')).toHaveCount(2);

  // Dragged onto the canvas it is an excerpt that leads back to it, and stays on the page.
  const where = await placeOf(box);
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  const b = (await box.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(flow.x + flow.width / 2, flow.y + 200, { steps: 20 });
  await expect(page.locator('.box-ghost')).toHaveAttribute('data-drop', /excerpt/);
  await shot(page, 'text-box-dragged-to-canvas');
  await page.mouse.up();
  const excerpt = card(page, 'and the reef map too');
  await expect(excerpt).toBeVisible();
  await shot(page, 'text-box-excerpt');
  expect(await placeOf(box)).toEqual(where);
  // Deleting the card keeps the box: it is the reader's own writing.
  await excerpt.click({ position: { x: 20, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(excerpt).toBeHidden();
  await expect(box).toBeVisible();

  // Listed with the highlights, and Delete takes it away; undo brings it back.
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  await sidebar(page).getByRole('tab', { name: 'Highlights' }).click();
  await expect(sidebar(page).locator('.marks')).toContainText('Check the bleaching figures');
  await box.click();
  await page.keyboard.press('Delete');
  await expect(box).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(box).toHaveCount(1);
});

test('a text box keeps its place and words through reload, zoom, a page turn, a move and the dark page, and exports as real text', async ({ page }) => {
  test.setTimeout(120_000);
  await openProject(page);
  await docTool(page, 'Text box');
  await tapPage(page, 0.2, 0.42);
  await page.keyboard.type('Ask about the 2016 survey');
  await page.keyboard.press('Escape');
  await toolbar(page).getByRole('button', { name: 'Make it blue' }).click();
  const box = boxes(page);
  await expect(box).toHaveClass(/hl-blue/);
  await page.keyboard.press('Escape');
  const at = await placeOf(box);

  await page.waitForTimeout(500);
  await page.reload();
  await expect(box).toHaveText('Ask about the 2016 survey');
  await expect(box).toHaveClass(/hl-blue/);
  await expect.poll(async () => (await placeOf(box)).x).toBeCloseTo(at.x, 3);
  await expect.poll(async () => (await placeOf(box)).y).toBeCloseTo(at.y, 3);

  const pdf = await exported(page, 'Text box (annotated).pdf');
  const [freeText] = (await (await pdf.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'FreeText');
  expect(freeText.contentsObj.str).toBe('Ask about the 2016 survey');
  // The words are drawn in an embedded font that readers can extract, where the box is.
  expect(freeText.textContent.join(' ')).toBe('Ask about the 2016 survey');
  const [left, bottom, right, top] = freeText.rect as number[];
  expect(left! / 612).toBeCloseTo(at.x, 2);
  expect(1 - top! / 792).toBeCloseTo(at.y, 2);
  expect((right! - left!) / 612).toBeCloseTo(at.w, 2);
  expect((top! - bottom!) / 792).toBeCloseTo(at.h, 2);

  // Zoomed, it grows with the page.
  await page.getByRole('button', { name: 'Zoom in' }).first().click();
  await expect.poll(async () => (await placeOf(box)).w).toBeCloseTo(at.w, 3);

  // Turned with its page, it stays by the same words, upright and as big as it was.
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  await sidebar(page).getByRole('tab', { name: 'Pages' }).click();
  const act = async (n: number, action: string) => {
    await sidebar(page)
      .locator('.thumbs > li')
      .nth(n - 1)
      .getByRole('button', { name: 'Page actions' })
      .click();
    await page.getByRole('menu').getByRole('menuitem', { name: action }).click();
    await expect(sidebar(page).getByRole('status')).toHaveCount(0);
  };
  await act(1, 'Rotate right');
  await expect.poll(async () => ((b) => (b ? b.width / b.height : 0))(await sheet(page).boundingBox())).toBeGreaterThan(1.2);
  await expect(box).toHaveText('Ask about the 2016 survey');
  const turned = await placeOf(box);
  const [cx, cy] = [at.x + at.w / 2, at.y + at.h / 2];
  expect(turned.x + turned.w / 2).toBeCloseTo(1 - cy, 2);
  expect(turned.y + turned.h / 2).toBeCloseTo(cx, 2);
  // As wide against the page's height now as it was against its width.
  expect(turned.w * (792 / 612)).toBeCloseTo(at.w, 2);
  await box.scrollIntoViewIfNeeded();
  await shot(page, 'text-box-turned');

  const turnedPdf = await exported(page, 'Text box turned (annotated).pdf');
  const [turnedText] = (await (await turnedPdf.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'FreeText');
  expect(turnedText.textContent.join(' ')).toBe('Ask about the 2016 survey');

  // Moved down a page with it.
  await act(1, 'Move down');
  await expect.poll(async () => (await placeOf(box)).page).toBe('2');
  await expect.poll(async () => (await placeOf(box)).x).toBeCloseTo(turned.x, 3);

  // On a dark page it turns with the page, as handwriting does.
  await page.getByRole('button', { name: 'Page colours' }).first().click();
  await page.getByRole('menu', { name: 'Page colours' }).getByRole('menuitemradio', { name: 'Dark pages' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'dark');
  await box.scrollIntoViewIfNeeded();
  await expect(box).toBeVisible();
  await shot(page, 'text-box-dark-page');
});

for (const [name, size] of [
  ['phone', PHONE],
  ['tablet', { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }],
] as const)
  test(`on a ${name}, a tap places a text box and a finger drags it`, async ({ browser }) => {
    const context = await browser.newContext(size);
    const page = await context.newPage();
    await openProject(page);
    await docTool(page, 'Text box');
    const at = (await sheet(page).boundingBox())!;
    await page.touchscreen.tap(at.x + at.width * 0.3, at.y + at.height * 0.3);
    const text = page.getByRole('textbox', { name: 'Text box' });
    await expect(text).toBeFocused();
    await page.keyboard.type('Parrotfish counts');
    await shot(page, `text-box-${name}-typing`);
    await page.keyboard.press('Escape');
    await expect(toolbar(page)).toBeVisible();
    // The toolbar fits the screen.
    const bar = (await toolbar(page).boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(size.viewport.width);
    await shot(page, `text-box-${name}-chosen`);

    const box = boxes(page);
    const before = await placeOf(box);
    const b = (await box.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] } as never);
    await touch('touchStart', b.x + 10, b.y + 8);
    for (let i = 1; i <= 10; i++) await touch('touchMove', b.x + 10 + i * 4, b.y + 8 + i * 6);
    await touch('touchEnd', 0, 0);
    await expect.poll(async () => (await placeOf(box)).y).toBeGreaterThan(before.y + 0.02);
    await context.close();
  });

test('a text box follows the words beside it when its document is replaced with a revised version', async ({ page }) => {
  await openProject(page);
  await docTool(page, 'Text box');
  await tapPage(page, 0.3, 0.42);
  await page.keyboard.type('Bleaching note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const box = boxes(page);
  /** How far below the line ending the third paragraph the box is, as a share of its page's height. */
  const below = () =>
    box.evaluate((el) => {
      const div = el.closest('.page')!;
      const line = [...div.querySelectorAll('.textLayer span')].find((s) => s.textContent?.includes('known as bleaching'));
      // Not yet drawn, as the page is laid out first.
      if (!line) return NaN;
      return (el.getBoundingClientRect().top - line.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    });
  const gap = await below();

  // The revision adds a paragraph at the top, which pushes the third paragraph onto the next page.
  await page.getByRole('button', { name: 'More for this document' }).first().click();
  await page.getByRole('menuitem', { name: 'Replace with a newer version…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace “Reef essay”' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByRole('button', { name: 'Choose the new version' }).click()]);
  const intro = 'Editor’s note: this revised edition adds a summary of recent survey results from three Pacific atolls and corrects two figures.';
  await chooser.setFiles(await pdf('Reef essay, revised.pdf', [[intro, ESSAY[0]![0]!, ESSAY[0]![1]!], [ESSAY[0]![2]!, ...ESSAY[1]!], ESSAY[2]!]));
  await expect(dialog.getByRole('status')).toContainText('Replaced.');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await placeOf(box)).page).toBe('2');
  await box.scrollIntoViewIfNeeded();
  await expect.poll(below).toBeCloseTo(gap, 2);
  await shot(page, 'text-box-replaced');
});
