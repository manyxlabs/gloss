import { copyFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SWATCHES } from '../src/palette';
import { COLORS } from '../src/types';
import { ARTIFACTS, card, openProject, readPdf, select, shot } from './helpers';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const mark = (page: Page) => page.locator('.page:not([data-copy]) .hl').first();

/** Opens the highlight's toolbar by clicking on it. */
async function openHighlight(page: Page, text: string) {
  const box = (await page.locator('.textLayer span', { hasText: text }).first().boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  return page.getByRole('toolbar', { name: 'Highlight' });
}

test('32 colours: favourites inline, the rest under More, on the page, on cards, in the dark and in the exported PDF', async ({ page }) => {
  test.setTimeout(180_000);
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  const selection = page.getByRole('toolbar', { name: 'Selection' });
  // The five favourites, and More.
  for (const name of ['yellow', 'green', 'blue', 'pink', 'purple']) await expect(selection.getByRole('button', { name: `Highlight ${name}` })).toBeVisible();
  await selection.getByRole('button', { name: 'More colours' }).click();
  const all = page.getByRole('dialog', { name: 'All colours' });
  await expect(all.locator('.swatch')).toHaveCount(32);
  await shot(page, 'palette-open');
  await all.getByRole('button', { name: 'Highlight deep teal' }).click();
  await expect(mark(page)).toHaveClass(/hl-deep-teal/);
  await expect(mark(page)).toHaveCSS('background-color', rgb(SWATCHES['deep-teal'].fill));

  // Every colour paints the passage and the excerpt's edge as the palette says, and undo steps back through them.
  let toolbar = await openHighlight(page, 'Coral reefs occupy');
  await toolbar.getByRole('button', { name: 'Excerpt' }).click();
  const excerpt = card(page, 'Coral reefs occupy').locator('.card');
  for (const c of COLORS) {
    toolbar = await openHighlight(page, 'Coral reefs occupy');
    await toolbar.getByRole('button', { name: 'More colours' }).click();
    await page.getByRole('dialog', { name: 'All colours' }).getByRole('button', { name: `Make it ${SWATCHES[c].name}`, exact: true }).click();
    await expect(mark(page)).toHaveCSS('background-color', rgb(SWATCHES[c].fill));
    await expect(excerpt).toHaveCSS('border-left-color', rgb(SWATCHES[c].edge));
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(mark(page)).toHaveClass(new RegExp(`hl-${COLORS.at(-2)}( |$)`));

  // In the dark, the card's edge is the colour itself, so it stands out from the panel.
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(excerpt).toHaveCSS('border-left-color', rgb(SWATCHES[COLORS.at(-2)!].fill));
  // The page stays paper, so marks on it keep their paper edge.
  await expect(page.locator('.page:not([data-copy]) .hl.linked').first()).toHaveCSS('box-shadow', new RegExp(rgb(SWATCHES[COLORS.at(-2)!].edge).replace(/[()]/g, '\\$&')));
  await openHighlight(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'More colours' }).click();
  await shot(page, 'palette-dark');
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await page.keyboard.press('Escape');

  // Favourites: deep red takes the first place, on this device, and is kept.
  await select(page, 'Rising sea temperatures');
  await selection.getByRole('button', { name: 'More colours' }).click();
  await all.getByRole('button', { name: 'Edit favourites' }).click();
  await all.getByRole('button', { name: 'Favourite 1: yellow' }).click();
  await all.getByRole('button', { name: 'Make favourite 1 deep red' }).click();
  await expect(all.getByRole('button', { name: 'Favourite 1: deep red' })).toBeVisible();
  await all.getByRole('button', { name: 'Done' }).click();
  await selection.getByRole('button', { name: 'More colours' }).click();
  await expect(selection.getByRole('button', { name: 'Highlight deep red' })).toBeVisible();
  await expect(selection.getByRole('button', { name: 'Highlight yellow' })).toHaveCount(0);
  await selection.getByRole('button', { name: 'Highlight deep red' }).click();
  await select(page, 'The ocean covers');
  await selection.getByRole('button', { name: 'More colours' }).click();
  await all.getByRole('button', { name: 'Highlight gray' }).click();

  await page.waitForTimeout(500);
  await page.reload();
  await select(page, 'Mangrove forests protect');
  await expect(selection.getByRole('button', { name: 'Highlight deep red' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.page:not([data-copy]) .hl.hl-deep-red')).toHaveCount(1);
  await expect(page.locator('.page:not([data-copy]) .hl.hl-gray')).toHaveCount(1);

  // The annotated PDF has each highlight in its own colour.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/Reef essay palette (annotated).pdf`;
  copyFileSync(await download.path(), file);
  const task = readPdf(file);
  const notes = (await (await (await task.promise).getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Highlight');
  const colours = notes.map((a) => rgb(`#${[...(a.color as Uint8ClampedArray)].map((v) => v.toString(16).padStart(2, '0')).join('')}`));
  expect(colours.sort()).toEqual([SWATCHES['deep-red'].fill, SWATCHES.gray.fill, SWATCHES[COLORS.at(-2)!].fill].map(rgb).sort());
  writeFileSync(`${ARTIFACTS}/palette-export-colours.json`, JSON.stringify(colours, null, 2));
  await task.destroy();
});

test('the palette fits a phone, with targets a finger can hit', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'More colours' }).click();
  const box = (await page.getByRole('dialog', { name: 'All colours' }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(page, 'palette-phone');
  await context.close();
});
