import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SWATCHES } from '../src/palette';
import { noteCard } from './cards';
import { card, fromToolbar, openProject, select, shot, useTheme } from './helpers';

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Canvases' });
const path = (page: Page) => page.getByRole('navigation', { name: 'Canvas path' });
const canvasCard = (page: Page, name: string) => page.locator('.react-flow__node', { has: page.getByRole('article', { name: `Canvas ${name}` }) });
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

/** Makes a nested canvas on the canvas on show, names it, and opens it. */
async function nest(page: Page, name: string) {
  await fromToolbar(page, 'Nested canvas', 'More canvas tools');
  const box = page.getByRole('textbox', { name: 'Nested canvas name' }).last();
  await box.fill(name);
  await box.press('Enter');
  await canvasCard(page, name).getByRole('button', { name: 'Open' }).click();
  await expect(path(page).locator('[aria-current="page"]')).toHaveText(name);
}

test('canvases nest in canvases: cards open them, a path leads back up, tabs list them, and cards link across them', async ({ page }) => {
  test.setTimeout(120_000);
  await openProject(page);
  await nest(page, 'Ideas');
  await expect(path(page)).toContainText('Canvas 1');
  // The tabs keep to the top level, with the one this canvas is in chosen.
  await expect(tabs(page).getByRole('tab')).toHaveCount(1);
  await expect(tabs(page).getByRole('tab', { name: 'Canvas 1' })).toHaveAttribute('aria-selected', 'true');

  // An excerpt made here stays here.
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Coral reefs occupy')).toBeVisible();
  await nest(page, 'Deeper');
  await expect(path(page).getByRole('listitem')).toHaveText(['Canvas 1', 'Ideas', 'Deeper']);
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + 200, flow.y + 260);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Deep note');
  await page.mouse.click(flow.x + 500, flow.y + 500);
  await shot(page, 'nested-deeper');

  // Up, then from the path, to the top.
  await path(page).getByRole('button', { name: 'Up to Ideas' }).click();
  await expect(card(page, 'Coral reefs occupy')).toBeVisible();
  await path(page).getByRole('button', { name: 'Canvas 1', exact: true }).click();
  await expect(path(page)).toHaveCount(0);
  await expect(card(page, 'Coral reefs occupy')).toHaveCount(0);

  // The tab's menu lists the canvases in it, at their depth.
  await tabs(page).getByRole('button', { name: 'Canvases in Canvas 1' }).click();
  const menu = page.getByRole('menu', { name: 'Canvases in Canvas 1' });
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Canvas 1', 'Ideas', 'Deeper']);
  await shot(page, 'nested-tab-menu');
  await menu.getByRole('menuitemradio', { name: 'Deeper' }).click();
  await expect(noteCard(page, 'Deep note')).toBeVisible();

  // A card linked to another canvas has a chip that goes there.
  await noteCard(page, 'Deep note').click();
  await page.getByRole('toolbar', { name: 'Chosen on the canvas' }).getByRole('button', { name: 'Link to a canvas' }).click();
  await page.getByRole('menu', { name: 'Link to a canvas' }).getByRole('menuitemcheckbox', { name: 'Canvas 1' }).click();
  await page.keyboard.press('Escape');
  await noteCard(page, 'Deep note').getByRole('button', { name: 'Canvas 1' }).click();
  await expect(path(page)).toHaveCount(0);

  // Showing an excerpt's card opens the canvas it is on, however deep.
  const mark = (await page.locator('.page:not([data-copy]) .hl[data-id]').first().boundingBox())!;
  await page.mouse.click(mark.x + 20, mark.y + mark.height / 2);
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Show on canvas' }).click();
  await expect(path(page).locator('[aria-current="page"]')).toHaveText('Ideas');
  await expect(card(page, 'Coral reefs occupy')).toBeVisible();

  // Kept as a tree.
  await page.waitForTimeout(500);
  await page.reload();
  await tabs(page).getByRole('button', { name: 'Canvases in Canvas 1' }).click();
  await expect(page.getByRole('menu', { name: 'Canvases in Canvas 1' }).getByRole('menuitemradio')).toHaveText(['Canvas 1', 'Ideas', 'Deeper']);
  await page.keyboard.press('Escape');

  // Deleting the card of a canvas takes the canvas with it, the canvases in it and their cards; undo brings all back.
  await canvasCard(page, 'Ideas').click({ position: { x: 10, y: 40 } });
  await page.getByRole('toolbar', { name: 'Chosen on the canvas' }).getByRole('button', { name: 'Delete card' }).click();
  await expect(tabs(page).getByRole('button', { name: 'Canvases in Canvas 1' })).toHaveCount(0);
  await expect(page.locator('.page:not([data-copy]) .hl[data-id]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(tabs(page).getByRole('button', { name: 'Canvases in Canvas 1' })).toBeVisible();
  await expect(page.locator('.page:not([data-copy]) .hl[data-id]')).toHaveCount(1);
  await tabs(page).getByRole('button', { name: 'Canvases in Canvas 1' }).click();
  await page.getByRole('menu', { name: 'Canvases in Canvas 1' }).getByRole('menuitemradio', { name: 'Deeper' }).click();
  await expect(noteCard(page, 'Deep note')).toBeVisible();
  await expect(noteCard(page, 'Deep note').getByRole('button', { name: 'Canvas 1' })).toBeVisible();
});

test('each canvas has its own background, note colour and accent, kept and undoable, light and dark', async ({ page }) => {
  await openProject(page);
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + 200, flow.y + 200);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Tinted note');
  await page.mouse.click(flow.x + 500, flow.y + 500);
  await page.getByRole('button', { name: 'Nested canvas' }).click();

  await page.getByRole('button', { name: 'Canvas style' }).click();
  const style = page.getByRole('dialog', { name: 'Canvas style' });
  await style.getByRole('button', { name: 'Grid' }).click();
  await expect(page.locator('.react-flow__background pattern path')).toHaveCount(1);
  await style.getByRole('button', { name: 'Notes deep teal' }).click();
  await style.getByRole('button', { name: 'Accent rose' }).click();
  await expect(noteCard(page, 'Tinted note').locator('.card')).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.card.canvas-card')).toHaveCSS('border-top-color', rgb(SWATCHES.rose.edge));
  await shot(page, 'canvas-style-light');
  await style.getByRole('button', { name: 'Plain', exact: true }).click();
  await expect(page.locator('.react-flow__background')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Another canvas keeps the default look.
  await page.getByRole('button', { name: 'New canvas' }).click();
  await expect(page.locator('.react-flow__background pattern circle')).toHaveCount(1);
  await tabs(page).getByRole('tab', { name: 'Canvas 1' }).click();
  await expect(page.locator('.react-flow__background')).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__background pattern path')).toHaveCount(1);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.react-flow__background pattern path')).toHaveCount(1);
  await expect(page.locator('.card.canvas-card')).toHaveCSS('border-top-color', rgb(SWATCHES.rose.edge));
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('.card.canvas-card')).toHaveCSS('border-top-color', rgb(SWATCHES.rose.fill));
  await page.getByRole('button', { name: 'Canvas style' }).click();
  await shot(page, 'canvas-style-dark');
});

test('a backup keeps the tree of canvases, their looks and the handwriting in them', async ({ page }) => {
  await openProject(page);
  await nest(page, 'Ideas');
  await page.getByRole('button', { name: 'Canvas style' }).click();
  await page.getByRole('dialog', { name: 'Canvas style' }).getByRole('button', { name: 'Grid' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ink box' }).click();
  await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'Pen' }).click();
  const box = (await page.locator('.card.sketch').boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 110, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.card.sketch .card-ink path')).toHaveCount(1);
  await page.waitForTimeout(500);

  await page.getByRole('link', { name: 'All projects' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up Reef essay' }).click()]);
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Reef essay' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore a backup' }).click()]);
  await chooser.setFiles({ name: 'Reef essay.gloss', mimeType: 'application/octet-stream', buffer: readFileSync(await download.path()) });
  await tabs(page).getByRole('button', { name: 'Canvases in Canvas 1' }).click();
  await page.getByRole('menu', { name: 'Canvases in Canvas 1' }).getByRole('menuitemradio', { name: 'Ideas' }).click();
  await expect(path(page).getByRole('listitem')).toHaveText(['Canvas 1', 'Ideas']);
  await expect(page.locator('.react-flow__background pattern path')).toHaveCount(1);
  await expect(page.locator('.card.sketch .card-ink path')).toHaveCount(1);
});

test('nested canvases, their path and their style on a phone, light and dark', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  await page
    .getByRole('tablist', { name: 'Show' })
    .getByRole('tab', { name: /^Canvas/ })
    .click();
  await nest(page, 'A canvas with a long name');
  await nest(page, 'Deeper still');
  const bar = (await path(page).boundingBox())!;
  expect(bar.width).toBeLessThanOrEqual(390);
  for (const b of await path(page).getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(30);
  await shot(page, 'nested-phone');
  await fromToolbar(page, 'Canvas style', 'More canvas tools');
  const style = (await page.getByRole('dialog', { name: 'Canvas style' }).boundingBox())!;
  expect(style.x).toBeGreaterThanOrEqual(0);
  expect(style.x + style.width).toBeLessThanOrEqual(390);
  await shot(page, 'canvas-style-phone');
  await page.keyboard.press('Escape');
  await useTheme(page, 'dark');
  await shot(page, 'nested-phone-dark');
  await context.close();
});
