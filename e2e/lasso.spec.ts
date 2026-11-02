import { expect, test, type Page } from '@playwright/test';
import { card, openProject, shot } from './helpers';

/** Where some words are on screen: the box of their text in the page's text layer. */
async function wordsBox(page: Page, words: string) {
  const span = page.locator('.page:not([data-copy]) .textLayer span', { hasText: words }).first();
  await span.scrollIntoViewIfNeeded();
  return span.evaluate((el, words) => {
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.includes(words))!;
    const range = document.createRange();
    const at = node.textContent!.indexOf(words);
    range.setStart(node, at);
    range.setEnd(node, at + words.length);
    const r = range.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, words);
}

/** Draws an ellipse around a box with the mouse, ending where it began. */
async function loop(page: Page, box: { x: number; y: number; width: number; height: number }, pad = 6) {
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  const [rx, ry] = [box.width / 2 + pad, box.height / 2 + pad];
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 48; i++) await page.mouse.move(cx + rx * Math.cos((i / 48) * 2 * Math.PI), cy + ry * Math.sin((i / 48) * 2 * Math.PI));
  await page.mouse.up();
}

test('with the pen, a loop round words excerpts exactly those words, a loop round no words a figure, and an open stroke stays ink', async ({ page }) => {
  await openProject(page);
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Pen' }).click();
  await loop(page, await wordsBox(page, 'Rising sea temperatures'));
  const excerpt = card(page, 'Rising sea temperatures');
  await expect(excerpt.locator('blockquote')).toHaveText('Rising sea temperatures');
  await expect(page.locator('.page:not([data-copy]) .hl:not(.area)')).toHaveCount(1);
  await expect(page.locator('.page:not([data-copy]) .ink-layer path')).toHaveCount(0);
  await shot(page, 'lasso-words');

  // Two words in the middle of a line, and nothing either side of them.
  await loop(page, await wordsBox(page, 'percent of'), 4);
  await expect(card(page, 'percent of').locator('blockquote')).toHaveText('percent of');

  // One step to undo, the highlight with its card.
  await page.keyboard.press('Control+z');
  await expect(card(page, 'percent of')).toHaveCount(0);
  await expect(page.locator('.page:not([data-copy]) .hl')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(card(page, 'percent of')).toBeVisible();

  // A loop round empty paper keeps that part of the page as a figure.
  const sheet = (await page.locator('.page[data-page-number="1"]').first().boundingBox())!;
  await loop(page, { x: sheet.x + sheet.width * 0.3, y: sheet.y + sheet.height * 0.6, width: sheet.width * 0.3, height: sheet.height * 0.1 });
  await expect(page.locator('.page:not([data-copy]) .hl.area')).toHaveCount(1);
  await expect(page.locator('.react-flow__node .card img.snip')).toBeVisible();

  // An open stroke is handwriting.
  await page.mouse.move(sheet.x + 100, sheet.y + sheet.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(sheet.x + 300, sheet.y + sheet.height * 0.82, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.page:not([data-copy]) .ink-layer path')).toHaveCount(1);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await shot(page, 'lasso-figure-and-ink');

  await page.waitForTimeout(500);
  await page.reload();
  await expect(card(page, 'Rising sea temperatures').locator('blockquote')).toHaveText('Rising sea temperatures');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
});
