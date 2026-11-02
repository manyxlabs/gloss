import { copyFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, card, picture, readPdf, select, shot } from './helpers';
import { PICTURE, pictureReport } from './pdfs';

// Each test exports or redraws pages several times over, which takes a while on a busy machine.
test.describe.configure({ timeout: 90_000 });

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
type Box = { x: number; y: number; width: number; height: number };

async function openReport(page: Page) {
  await page.goto('/');
  const png = await picture(page, 220, 160, '#d81b1b', 'image/png');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles({ name: 'Reef photo.pdf', mimeType: 'application/pdf', buffer: await pictureReport(png) });
  await expect(page.locator('.textLayer span').first()).toBeVisible();
}

const firstPage = (page: Page) => page.locator('.pdfViewer > .page[data-page-number="1"]');

/** A box of the first page on screen, from one given in PDF points from its bottom left. */
async function onPage(page: Page, x: number, y: number, width: number, height: number): Promise<Box> {
  const b = (await firstPage(page).boundingBox())!;
  return { x: b.x + (x / 612) * b.width, y: b.y + (1 - (y + height) / 792) * b.height, width: (width / 612) * b.width, height: (height / 792) * b.height };
}

/** What the screen shows in a box: its average colour, and how much of it is dark or light. */
async function look(page: Page, box: Box) {
  const png = await page.screenshot({ clip: box });
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
    const g = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    g.drawImage(bitmap, 0, 0);
    const d = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const sum = [0, 0, 0];
    let [dark, light] = [0, 0];
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
      const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (lum < 80) dark++;
      if (lum > 170) light++;
    }
    const n = d.length / 4;
    return { rgb: sum.map((s) => s / n), dark: dark / n, light: light / n };
  }, png.toString('base64'));
}
const lum = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

async function choose(page: Page, item: string) {
  await page.getByRole('button', { name: 'Page colours' }).first().click();
  await page.getByRole('menu', { name: 'Page colours' }).getByRole('menuitemradio', { name: item }).click();
}

test('dark pages keep text, highlights, pictures and handwriting readable, and change no export', async ({ page }) => {
  await openReport(page);
  const line = page.locator('.textLayer span', { hasText: 'Branching corals' }).first();
  // The margin left of the text, a line of text, and the picture's white middle and red edge.
  const margin = await onPage(page, 12, 600, 40, 120);
  const middle = await onPage(page, PICTURE.x + 80, PICTURE.y + 60, 60, 40);
  const edge = await onPage(page, PICTURE.x + 6, PICTURE.y + 6, 30, 20);

  // Light, as printed: a yellow highlight multiplied onto a white page.
  await select(page, 'Survey of the reef flat');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight yellow' }).click();
  const mark = page.locator('.hl.hl-yellow').first();
  await expect(mark).toBeVisible();
  expect(lum((await look(page, margin)).rgb)).toBeGreaterThan(245);
  await shot(page, 'pages-light-desktop');

  await choose(page, 'Dark pages');
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'dark');
  await expect(page.locator('.photo-layer canvas')).toHaveCount(1);
  expect(lum((await look(page, margin)).rgb)).toBeLessThan(45);
  const text = await look(page, (await line.boundingBox())!);
  expect(text.light).toBeGreaterThan(0.08);
  expect(text.dark).toBeGreaterThan(0.5);
  // The highlight is still yellow, not black: red and green well above blue, and not dark.
  const hl = await look(page, (await mark.boundingBox())!);
  const [r, g, b] = hl.rgb;
  expect(r! - b!).toBeGreaterThan(40);
  expect(g! - b!).toBeGreaterThan(30);
  expect(lum(hl.rgb)).toBeGreaterThan(70);
  // The picture is as it was: white in the middle, red at the edge.
  expect(lum((await look(page, middle)).rgb)).toBeGreaterThan(240);
  const red = (await look(page, edge)).rgb;
  expect(red[0]).toBeGreaterThan(180);
  expect(red[1]).toBeLessThan(60);
  await shot(page, 'pages-dark-desktop');

  // Without keeping images, the picture turns with the page.
  await page.getByRole('button', { name: 'Page colours' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Keep images as they are' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-layer')).toHaveCount(0);
  expect(lum((await look(page, middle)).rgb)).toBeLessThan(45);
  await page.getByRole('button', { name: 'Page colours' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Keep images as they are' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-layer canvas')).toHaveCount(1);

  // Handwriting in the default ink turns light with the page.
  const tools = page.getByRole('toolbar', { name: 'Document tools' });
  await tools.getByRole('button', { name: 'Pen' }).click();
  const ink = await onPage(page, 80, 480, 200, 60);
  await page.mouse.move(ink.x, ink.y + 30);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(ink.x + i * 12, ink.y + 30 + Math.sin(i / 2) * 20);
  await page.mouse.up();
  await expect(page.locator('.ink-layer path')).toHaveCount(1);
  await tools.getByRole('button', { name: 'Select' }).click();
  expect((await look(page, (await page.locator('.ink-layer path').boundingBox())!)).light).toBeGreaterThan(0.01);

  // Selecting and excerpting work on a dark page.
  await select(page, 'Grazing fish were counted');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Grazing fish were counted')).toBeVisible();

  // The thumbnails are dark too.
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).click();
  await page.locator('.side-tabs').getByText('Pages').click();
  const thumb = page.locator('.thumb img').first();
  // Drawn from the PDF once the list is in view.
  await expect(thumb).toBeVisible({ timeout: 15000 });
  expect(lum((await look(page, (await thumb.boundingBox())!)).rgb)).toBeLessThan(80);
  await expect(page.locator('.thumb-photo')).toHaveCount(1);
  await shot(page, 'pages-dark-sidebar');
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).click();

  // The annotated PDF has white pages, whatever the screen shows.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/pages-dark-annotated.pdf`;
  copyFileSync(await download.path(), file);
  const pdf = await readPdf(file).promise;
  const first = await pdf.getPage(1);
  const viewport = first.getViewport({ scale: 1 });
  const { canvas, context } = (
    pdf as unknown as { canvasFactory: { create: (w: number, h: number) => { canvas: never; context: CanvasRenderingContext2D } } }
  ).canvasFactory.create(viewport.width, viewport.height);
  await first.render({ canvas, viewport }).promise;
  const at = (x: number, y: number) => [...context.getImageData(x, viewport.height - y, 1, 1).data.slice(0, 3)];
  expect(at(20, 600)).toEqual([255, 255, 255]);
  expect(lum(at(PICTURE.x + 110, PICTURE.y + 80))).toBeGreaterThan(240);

  // Kept on this device.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'dark');
  await page.getByRole('button', { name: 'Page colours' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Dark pages' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  expect(lum((await look(page, margin)).rgb)).toBeLessThan(45);

  // Sepia tints the paper and keeps the text dark.
  await choose(page, 'Sepia pages');
  const sepia = (await look(page, margin)).rgb;
  expect(sepia[0]! - sepia[2]!).toBeGreaterThan(15);
  expect(lum(sepia)).toBeGreaterThan(200);
  expect((await look(page, (await line.boundingBox())!)).dark).toBeGreaterThan(0.05);
  await shot(page, 'pages-sepia-desktop');
});

test('pages can follow the app theme, on a phone too', async ({ browser }) => {
  const context = await browser.newContext({ ...PHONE, colorScheme: 'light' });
  const page = await context.newPage();
  await openReport(page);
  const margin = await onPage(page, 12, 600, 40, 120);

  // The toolbar keeps to the screen with the page colours button in it.
  const bar = (await page.locator('.doc-status').boundingBox())!;
  expect(bar.x).toBeGreaterThanOrEqual(8);
  expect(bar.x + bar.width).toBeLessThanOrEqual(390 - 8);

  await choose(page, 'Follow the app theme');
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'light');
  expect(lum((await look(page, margin)).rgb)).toBeGreaterThan(245);
  await shot(page, 'pages-light-phone');

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'dark');
  await expect(page.locator('.photo-layer canvas')).toHaveCount(1);
  expect(lum((await look(page, margin)).rgb)).toBeLessThan(45);
  await shot(page, 'pages-dark-phone');
  await page.getByRole('button', { name: 'Page colours' }).click();
  await shot(page, 'pages-menu-phone');
  await page.keyboard.press('Escape');

  // Following the theme is what is kept, so a light theme next time brings light pages.
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'light');
  await page.reload();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'light');
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pages', 'dark');
  await context.close();
});
