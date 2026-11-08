import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { ARTIFACTS, card, inside, readPdf, shot, textBox, worksOffline, type Box } from './helpers';

// Reading a scan takes a while on a machine busy with other tests, and some tests read two.
test.describe.configure({ timeout: 180_000 });

const LINES = [
  'Lighthouse keepers recorded every passing ship',
  'and the weather at dawn, noon and dusk.',
  'Storms in the winter of 1887 wrecked nine',
  'schooners along the northern headland.',
];
/** A Letter page at 200 dots per inch. */
const [W, H] = [1700, 2200];

/**
 * A scanned page: the lines drawn by the browser into a picture, placed on a PDF page with no
 * text at all. Returns the PDF and where each word was drawn, as fractions of the page.
 */
async function scan(page: Page, lines = LINES, font = 'serif') {
  const { png, words } = await page.evaluate(
    async ({ lines, W, H, font }) => {
      // Devanagari is drawn in the font Gloss writes it with, as the system may have none.
      if (font !== 'serif') document.fonts.add(await new FontFace(font, `url(/ocr/${font}.woff)`).load());
      const canvas = new OffscreenCanvas(W, H);
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#111';
      g.font = `44px ${font}`;
      const words: Record<string, { x: number; y: number; width: number; height: number }> = {};
      lines.forEach((line, i) => {
        const baseline = 260 + i * 80;
        let x = 170;
        for (const word of line.split(' ')) {
          g.fillText(word, x, baseline);
          const m = g.measureText(word);
          words[word] ??= { x: x / W, y: (baseline - m.actualBoundingBoxAscent) / H, width: m.width / W, height: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / H };
          x += m.width + g.measureText(' ').width;
        }
      });
      return { png: [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())], words };
    },
    { lines, W, H, font },
  );
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(Uint8Array.from(png));
  pdf.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  return { buffer: Buffer.from(await pdf.save()), words };
}

const banner = (page: Page) => page.getByRole('region', { name: 'Scanned pages' });
const reading = (page: Page) => page.getByRole('region', { name: 'Making text selectable' });
const sheet = (page: Page) => page.locator('.pdfViewer > .page[data-page-number="1"]');

/** Where on screen a word drawn in the picture is, from where it was drawn on the page. */
async function drawnAt(page: Page, word: Box): Promise<Box> {
  const p = (await sheet(page).boundingBox())!;
  return { x: p.x + word.x * p.width, y: p.y + word.y * p.height, width: word.width * p.width, height: word.height * p.height };
}

/** Drags across one word of the text layer, as a reader would select it. */
async function selectWord(page: Page, word: string) {
  const box = await textBox(page, word);
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function addScan(page: Page, name: string, lines = LINES, font?: string) {
  const { buffer, words } = await scan(page, lines, font);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .getByRole('button', { name: /^(Open files|Add file)$/ })
      .first()
      .click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'application/pdf', buffer });
  return { buffer, words };
}

test('a scanned page is offered for reading, and its text becomes selectable, lined up with the picture, searchable and undoable', async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (r) => /^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(baseURL!).origin && outside.push(r.url()));
  await page.goto('/');
  const { buffer, words } = await addScan(page, 'Lighthouse log.pdf');
  await expect(sheet(page).locator('canvas')).toBeVisible();
  await expect(banner(page)).toContainText('This page is a scan: its text cannot be selected or searched yet.');
  await expect(page.locator('.textLayer span')).toHaveCount(0);
  await shot(page, 'ocr-offered');

  await banner(page).getByRole('button', { name: 'Make text selectable' }).click();
  await expect(reading(page).getByRole('status')).toBeVisible();
  await shot(page, 'ocr-reading');
  await expect(reading(page)).toBeHidden({ timeout: 90_000 });
  await expect(banner(page)).toBeHidden();
  const layer = page.locator('.page:not([data-copy]) .textLayer');
  await expect(layer).toContainText('Lighthouse keepers recorded every passing ship');
  // Nothing was sent anywhere: the worker, its core and the language data all come from Gloss.
  expect(outside).toEqual([]);

  // Each recognised word sits over its picture, as the text layer draws it.
  for (const word of ['Lighthouse', 'recorded', 'weather', 'wrecked', 'headland.']) {
    const drawn = await drawnAt(page, words[word]!);
    const box = await textBox(page, word);
    expect(Math.abs(box.x - drawn.x), word).toBeLessThan(drawn.height * 0.4);
    expect(Math.abs(box.x + box.width - (drawn.x + drawn.width)), word).toBeLessThan(drawn.height * 0.4);
    expect(inside(drawn, box), word).toBeGreaterThan(0.85);
  }

  // Selected and excerpted like any text; its highlight covers the word in the picture.
  await selectWord(page, 'recorded');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'recorded')).toBeVisible();
  const mark = (await page.locator('.page:not([data-copy]) .hl').first().boundingBox())!;
  const drawn = await drawnAt(page, words.recorded!);
  expect(inside(drawn, mark)).toBeGreaterThan(0.9);
  expect(inside(mark, drawn)).toBeGreaterThan(0.4);
  await shot(page, 'ocr-excerpted');

  // Search finds the words, and so does any reader of the file, as its text layer is in the PDF.
  await page.getByRole('searchbox').fill('wrecked nine');
  await expect(page.getByRole('listbox').getByRole('option', { name: /wrecked nine/ })).toBeVisible();
  await page.keyboard.press('Escape');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const exported = `${ARTIFACTS}/Lighthouse log (annotated).pdf`;
  await download.saveAs(exported);
  const text = (await (await (await readPdf(exported).promise).getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('');
  expect(text).toContain('Lighthouse keepers recorded every passing ship');
  expect(text).toContain('wrecked nine');
  writeFileSync(`${ARTIFACTS}/Lighthouse log (scan).pdf`, buffer);

  // Undo puts back the file as it was added: a picture with no text, offered again.
  await page.keyboard.press('Control+z');
  await expect(card(page, 'recorded')).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(banner(page)).toBeVisible();
  await expect(page.locator('.textLayer span')).toHaveCount(0);
  const id = page.url().split('/').at(-1)!;
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((ok) => (indexedDB.open('gloss').onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)));
        const p = await new Promise<{ docs: { file?: string }[] }>(
          (ok) => (db.transaction('projects').objectStore('projects').get(id).onsuccess = (e) => ok((e.target as IDBRequest).result)),
        );
        return p.docs[0]!.file ?? 'original';
      }, id),
    )
    .toBe('original');
  await page.keyboard.press('Control+Shift+z');
  await expect(layer).toContainText('recorded');
});

test('a scan can be cancelled, and pages are read from the page menu', async ({ page }) => {
  await page.goto('/');
  await addScan(page, 'Lighthouse log.pdf');
  await banner(page).getByRole('button', { name: 'Make text selectable' }).click();
  await reading(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(reading(page)).toBeHidden();
  await expect(banner(page)).toBeVisible();
  await expect(page.locator('.textLayer span')).toHaveCount(0);

  await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  const sidebar = page.getByRole('complementary', { name: 'Contents, pages and highlights' });
  await sidebar.getByRole('tab', { name: 'Pages' }).click();
  await sidebar.getByRole('button', { name: 'Page actions' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Make text selectable' }).click();
  await expect(page.locator('.page:not([data-copy]) .textLayer')).toContainText('wrecked nine', { timeout: 90_000 });
});

test('on a phone in the dark, the offer and the progress fit the page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  await addScan(page, 'Lighthouse log.pdf');
  await expect(banner(page)).toBeVisible();
  for (const box of [await banner(page).boundingBox(), await banner(page).getByRole('button', { name: 'Make text selectable' }).boundingBox()]) {
    expect(box!.x).toBeGreaterThanOrEqual(8);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 8);
  }
  await shot(page, 'ocr-phone-offered');
  await banner(page).getByRole('button', { name: 'Make text selectable' }).click();
  await expect(reading(page)).toBeVisible();
  await shot(page, 'ocr-phone-reading');
  await expect(page.locator('.page:not([data-copy]) .textLayer')).toContainText('wrecked nine', { timeout: 90_000 });
  await context.close();
});

test('a scan in Hindi is read in Hindi, and its words are written into the PDF in reading order', async ({ page }) => {
  await page.goto('/');
  await addScan(page, 'Hindi notes.pdf', ['भारत एक विशाल देश है', 'यहाँ अनेक भाषाएँ बोली जाती हैं'], 'NotoSansDevanagari');
  await banner(page).getByRole('combobox', { name: 'Language of the text' }).selectOption('Hindi');
  await banner(page).getByRole('button', { name: 'Make text selectable' }).click();
  const layer = page.locator('.page:not([data-copy]) .textLayer');
  await expect(layer).toContainText('विशाल देश', { timeout: 90_000 });
  await page.getByRole('searchbox').fill('भाषाएँ');
  await expect(page.getByRole('listbox').getByRole('option', { name: /भाषाएँ/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await shot(page, 'ocr-hindi');
});

// Through the service worker, which the other tests leave out.
test.describe(() => {
  test.use({ serviceWorkers: 'allow' });

  test('once used, reading scans works with no network', async ({ page, context }) => {
    await page.goto('/');
    await worksOffline(page);
    // Loaded again, the page is in the service worker's hands.
    await page.goto('/');
    await addScan(page, 'Lighthouse log.pdf');
    await banner(page).getByRole('button', { name: 'Make text selectable' }).click();
    await expect(page.locator('.page:not([data-copy]) .textLayer')).toContainText('recorded every', { timeout: 90_000 });
    const project = page.url();

    await context.setOffline(true);
    const fromNetwork: string[] = [];
    page.on('response', (r) => new URL(r.url()).pathname.startsWith('/ocr/') && !r.fromServiceWorker() && fromNetwork.push(r.url()));
    await page.goto(project);
    await addScan(page, 'Harbour log.pdf', ['Fishing boats returned late with', 'herring and mackerel in their holds.']);
    await banner(page).getByRole('button', { name: 'Make text selectable' }).click();
    await expect(page.locator('.page:not([data-copy]) .textLayer')).toContainText('herring and mackerel', { timeout: 90_000 });
    expect(fromNetwork).toEqual([]);
    const cached = await page.evaluate(async () => (await (await caches.open('gloss-data')).keys()).map((r) => new URL(r.url).pathname));
    expect(cached).toEqual(expect.arrayContaining(['/ocr/worker.min.js', '/ocr/tesseract-core-simd-lstm.wasm', '/ocr/lang/eng.traineddata.gz']));
    await shot(page, 'ocr-offline');
    await context.setOffline(false);
  });
});
