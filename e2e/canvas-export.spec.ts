import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, card, openProject, picture, readPdf, select, shot } from './helpers';
import { PICTURE, pictureReport } from './pdfs';

test.use({ viewport: { width: 1600, height: 1000 } });

const MARGIN = 32;
const PT = 0.75;
type Box = [x: number, y: number, w: number, h: number];
type Cards = { text: string; x: number; y: number; w: number; h: number }[];

const note = (page: Page, text: string) => page.locator('.react-flow__node').filter({ has: page.locator(`.grow[data-value="${text}"]`) });

async function write(page: Page, x: number, y: number, text: string) {
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + x, flow.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.type(text);
}

/** Where the cards on show are, in canvas units, read from React Flow's own placing of them. */
const cardsOnCanvas = (page: Page): Promise<Cards> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.canvas .flow .react-flow__node')].map((n) => {
      const [, x, y] = /translate\(([-\d.]+)px, ?([-\d.]+)px\)/.exec(n.style.transform)!;
      // A note's words are in a field, which the field's sizer repeats; handwriting has none.
      const text = n.querySelector('[data-ink-card]') ? '[ink]' : [n.textContent, ...[...n.querySelectorAll<HTMLElement>('[data-value]')].map((v) => v.dataset.value)].join(' ');
      return { text, x: Number(x), y: Number(y), w: n.offsetWidth, h: n.offsetHeight };
    }),
  );

const boundsOf = (cards: Cards) => {
  const [left, top] = [Math.min(...cards.map((c) => c.x)), Math.min(...cards.map((c) => c.y))];
  return { left, top, width: Math.max(...cards.map((c) => c.x + c.w)) - left, height: Math.max(...cards.map((c) => c.y + c.h)) - top };
};

/** A card's box in the picture: inset, so the sample is of what is inside it. */
const inPicture = (cards: Cards, text: string, scale: number, inset = 10): Box => {
  const b = boundsOf(cards);
  const c = cards.find((c) => c.text.includes(text))!;
  return [(c.x - b.left + MARGIN + inset) * scale, (c.y - b.top + MARGIN + inset) * scale, (c.w - 2 * inset) * scale, (c.h - 2 * inset) * scale].map(Math.round) as Box;
};

/** A thin box down the middle of the gap between two cards, one above the other, where a link joining them runs. */
const linkBetween = (cards: Cards, above: string, below: string, scale: number): Box => {
  const [a, b] = [inPicture(cards, above, scale, 0), inPicture(cards, below, scale, 0)];
  const x = a[0] + a[2] / 2;
  return [x - 3 * scale, a[1] + a[3] + 10 * scale, 6 * scale, b[1] - (a[1] + a[3]) - 20 * scale];
};

/** Decodes a PNG in the browser and counts kinds of pixel in some boxes of it. */
async function inspect(page: Page, file: string, boxes: Record<string, Box>) {
  return page.evaluate(
    async ({ b64, boxes }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext('2d')!;
      g.drawImage(bitmap, 0, 0);
      const near = (d: Uint8ClampedArray, i: number, [r, gr, b]: number[], tolerance: number) =>
        Math.abs(d[i]! - r!) < tolerance && Math.abs(d[i + 1]! - gr!) < tolerance && Math.abs(d[i + 2]! - b!) < tolerance;
      const count = ([x, y, w, h]: number[]) => {
        const d = g.getImageData(x!, y!, w!, h!).data;
        const out = { pixels: w! * h!, dark: 0, grey: 0, light: 0, red: 0, accent: 0 };
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          if (lum < 90) out.dark++;
          if (lum > 200) out.light++;
          if (lum < 180) out.grey++;
          if (d[i]! > 170 && d[i + 1]! < 100 && d[i + 2]! < 100) out.red++;
          // The accent colour of handles, selection rings and resize lines, in either theme.
          if (near(d, i, [81, 69, 229], 30) || near(d, i, [143, 136, 255], 30)) out.accent++;
        }
        return out;
      };
      const pixel = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
      return {
        width: bitmap.width,
        height: bitmap.height,
        corner: pixel(2, 2),
        farCorner: pixel(bitmap.width - 3, bitmap.height - 3),
        all: count([0, 0, bitmap.width, bitmap.height]),
        boxes: Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, count(b)])),
      };
    },
    { b64: readFileSync(file).toString('base64'), boxes },
  );
}

const lum = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

/** Opens the picture dialog from the Export menu, makes the choices given by label, and saves what it exports. */
async function exportPicture(page: Page, choices: string[], name: string, match = false) {
  const dialog = page.getByRole('dialog', { name: 'Export the canvas as a picture' });
  if (!(await dialog.isVisible())) {
    await page.getByRole('button', { name: 'Export notes' }).click();
    await page.getByRole('menuitem', { name: 'Canvas as a picture…' }).click();
  }
  for (const label of choices) await dialog.getByText(label, { exact: true }).click();
  const theme = dialog.getByRole('checkbox', { name: 'Match the current theme' });
  if ((await theme.isChecked()) !== match) await theme.click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export' }).click()]);
  const file = `${ARTIFACTS}/${name}`;
  copyFileSync(await download.path(), file);
  await expect(dialog).toBeHidden();
  return { file, suggested: download.suggestedFilename() };
}

test('the canvas exports as a picture of its cards, links and handwriting, without the controls', async ({ page }) => {
  await openProject(page);
  await write(page, 60, 80, 'Heat');
  await write(page, 60, 420, 'Bleaching');
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Coral reefs')).toBeVisible();

  // A link drawn from note to note, and a red stroke of handwriting on its own.
  const tools = page.getByRole('toolbar', { name: 'Canvas tools' });
  await tools.getByRole('button', { name: 'Pen' }).click();
  await tools.getByRole('button', { name: 'red ink' }).click();
  const [a, b] = [(await note(page, 'Heat').boundingBox())!, (await note(page, 'Bleaching').boundingBox())!];
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.canvas .flow .react-flow__edge')).toHaveCount(1);
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.move(flow.x + flow.width - 180, flow.y + 120);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(flow.x + flow.width - 180 + i * 10, flow.y + 120 + Math.sin(i / 2) * 30);
  await page.mouse.up();
  await expect(page.locator('.canvas .flow [data-ink-card]')).toHaveCount(1);
  await tools.getByRole('button', { name: 'Select' }).click();

  // A chosen card with its handles showing: neither ring nor handles belong in the picture.
  await note(page, 'Heat').click({ position: { x: 4, y: 4 } });
  await card(page, 'Coral reefs').hover();
  await expect(card(page, 'Coral reefs').locator('.react-flow__handle').first()).toHaveCSS('opacity', '1');
  const cards = await cardsOnCanvas(page);
  expect(cards).toHaveLength(4);
  const bounds = boundsOf(cards);
  await shot(page, 'canvas-export-source');

  const png = await exportPicture(page, ['Whole canvas', 'PNG', '2×'], 'canvas-export-light.png');
  expect(png.suggested).toBe('Reef essay - Canvas.png');
  const light = await inspect(page, png.file, {
    excerpt: inPicture(cards, 'Coral reefs', 2),
    heat: inPicture(cards, 'Heat', 2),
    ink: inPicture(cards, '[ink]', 2, 0),
    link: linkBetween(cards, 'Heat', 'Bleaching', 2),
  });
  // Sized to the cards with a margin, at twice the scale.
  expect(Math.abs(light.width - (bounds.width + 2 * MARGIN) * 2)).toBeLessThanOrEqual(4);
  expect(Math.abs(light.height - (bounds.height + 2 * MARGIN) * 2)).toBeLessThanOrEqual(4);
  // Light by default: a pale background, white cards with dark text on them.
  expect(lum(light.corner)).toBeGreaterThan(235);
  expect(light.boxes.excerpt!.dark).toBeGreaterThan(400);
  expect(light.boxes.excerpt!.light / light.boxes.excerpt!.pixels).toBeGreaterThan(0.6);
  expect(light.boxes.heat!.dark).toBeGreaterThan(50);
  expect(light.boxes.ink!.red).toBeGreaterThan(100);
  expect(light.boxes.link!.grey).toBeGreaterThan(100);
  // No selection ring, handle or resize line, and nothing of the minimap in its corner.
  expect(light.all.accent).toBe(0);
  expect(light.farCorner).toEqual(light.corner);

  // In the dark theme a picture is still light unless asked to match.
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } });
  const stillLight = await inspect(page, (await exportPicture(page, ['PNG', '1×'], 'canvas-export-light-1x.png')).file, {
    excerpt: inPicture(cards, 'Coral reefs', 1),
  });
  expect(lum(stillLight.corner)).toBeGreaterThan(235);
  expect(stillLight.boxes.excerpt!.dark).toBeGreaterThan(100);
  expect(Math.abs(stillLight.width - (bounds.width + 2 * MARGIN))).toBeLessThanOrEqual(2);
  const dark = await inspect(page, (await exportPicture(page, ['PNG', '1×'], 'canvas-export-dark.png', true)).file, {
    excerpt: inPicture(cards, 'Coral reefs', 1),
  });
  expect(lum(dark.corner)).toBeLessThan(30);
  expect(dark.boxes.excerpt!.light).toBeGreaterThan(100);
  expect(dark.boxes.excerpt!.dark / dark.boxes.excerpt!.pixels).toBeGreaterThan(0.6);
  expect(dark.all.accent).toBe(0);
  await page.getByRole('button', { name: 'Use light theme' }).click();

  // Only the chosen cards: a smaller picture.
  await note(page, 'Heat').click({ position: { x: 4, y: 4 } });
  const one = await inspect(page, (await exportPicture(page, ['Selected (1)', 'PNG', '1×'], 'canvas-export-selected.png')).file, {});
  const heat = cards.find((c) => c.text.includes('Heat'))!;
  expect(Math.abs(one.width - (heat.w + 2 * MARGIN))).toBeLessThanOrEqual(2);
  expect(Math.abs(one.height - (heat.h + 2 * MARGIN))).toBeLessThanOrEqual(2);

  // A PDF of one page the size of the canvas, and one tiled onto A4.
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 700 } });
  const fit = await await readPdf((await exportPicture(page, ['Whole canvas', 'PDF', 'One page'], 'canvas-export.pdf')).file).promise;
  expect(fit.numPages).toBe(1);
  const [, , fw, fh] = (await fit.getPage(1)).view;
  expect(fw).toBeCloseTo((bounds.width + 2 * MARGIN) * PT, -1);
  expect(fh).toBeCloseTo((bounds.height + 2 * MARGIN) * PT, -1);
  const a4 = await readPdf((await exportPicture(page, ['A4'], 'canvas-export-a4.pdf')).file).promise;
  const portrait = bounds.height >= bounds.width;
  const [w, h] = portrait ? [595.28, 841.89] : [841.89, 595.28];
  const drawn = (bounds.height + 2 * MARGIN) * Math.min(PT, (w - 72) / (bounds.width + 2 * MARGIN));
  expect(a4.numPages).toBe(Math.ceil(drawn / (h - 72) - 0.001));
  const [, , aw, ah] = (await a4.getPage(1)).view;
  expect([Math.round(aw!), Math.round(ah!)]).toEqual([Math.round(w), Math.round(h)]);

  // An SVG of the same size, which a browser shows as an image.
  const svg = (await exportPicture(page, ['SVG'], 'canvas-export.svg')).file;
  const size = await page.evaluate(
    async (text) => {
      const img = new Image();
      img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    },
    readFileSync(svg, 'utf8'),
  );
  expect(size).toEqual([Math.ceil(bounds.width + 2 * MARGIN), Math.ceil(bounds.height + 2 * MARGIN)]);
});

test('a collapsed group exports as its chip, and a phone exports from the canvas tools', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  await page.getByRole('tablist', { name: 'Show' }).getByRole('tab', { name: 'Canvas' }).click();
  await write(page, 40, 140, 'Kelp');
  await write(page, 40, 300, 'Urchins');
  await page.locator('.react-flow__pane').click({ position: { x: 200, y: 600 } });
  await note(page, 'Kelp').click({ position: { x: 4, y: 4 } });
  await note(page, 'Urchins').click({ position: { x: 4, y: 4 }, modifiers: ['ControlOrMeta'] });
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  const group = page.locator('.canvas .flow .react-flow__node').filter({ has: page.locator('.group') });
  await group.locator('input').fill('Grazers');
  await group.getByRole('button', { name: 'Collapse group' }).click();
  await expect(note(page, 'Kelp')).toBeHidden();
  const chip = (await cardsOnCanvas(page)).find((c) => c.text.includes('2 cards'))!;

  await page.getByRole('button', { name: 'Export the canvas as a picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export the canvas as a picture' });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16);
  await shot(page, 'canvas-export-dialog-phone');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export' }).click()]);
  const file = `${ARTIFACTS}/canvas-export-phone.png`;
  copyFileSync(await download.path(), file);
  const picture = await inspect(page, file, { chip: [MARGIN * 2 + 20, MARGIN * 2 + 10, (chip.w - 20) * 2, (chip.h - 20) * 2] });
  // Just the chip, at 2×: the cards inside are not drawn.
  expect(Math.abs(picture.width - (chip.w + 2 * MARGIN) * 2)).toBeLessThanOrEqual(4);
  expect(Math.abs(picture.height - (chip.h + 2 * MARGIN) * 2)).toBeLessThanOrEqual(4);
  expect(picture.boxes.chip!.dark).toBeGreaterThan(50);
  await context.close();
});

test('a figure card exports with its picture, drawn from the PDF', async ({ page }) => {
  await page.goto('/');
  const png = await picture(page, 220, 160, '#d81b1b', 'image/png');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles({ name: 'Reef photo.pdf', mimeType: 'application/pdf', buffer: await pictureReport(png) });
  await expect(page.locator('.textLayer span').first()).toBeVisible();

  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Snip' }).click();
  const box = (await page.locator('.pdfViewer > .page[data-page-number="1"]').boundingBox())!;
  const at = (x: number, y: number) => [box.x + (x / 612) * box.width, box.y + (1 - y / 792) * box.height] as const;
  const [x0, y0] = at(PICTURE.x - 10, PICTURE.y + PICTURE.height + 10);
  const [x1, y1] = at(PICTURE.x + PICTURE.width + 10, PICTURE.y - 10);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Excerpt' }).click();
  const figure = page.locator('.canvas .flow .react-flow__node').filter({ has: page.locator('img.snip') });
  await expect.poll(() => figure.locator('img.snip').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);

  const cards = await cardsOnCanvas(page);
  const { file } = await exportPicture(page, ['PNG', '1×'], 'canvas-export-figure.png');
  const shot = await inspect(page, file, { figure: inPicture(cards, 'Reef photo', 1, 14) });
  // Mostly the red of the picture, with its white middle.
  expect(shot.boxes.figure!.red / shot.boxes.figure!.pixels).toBeGreaterThan(0.25);
  expect(shot.boxes.figure!.light / shot.boxes.figure!.pixels).toBeGreaterThan(0.1);
});
