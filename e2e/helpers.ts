import { mkdirSync, readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ESSAY, makePdf, NOTES } from './pdfs';

export const ARTIFACTS = 'test-results/artifacts';
/** Where pdf.js, reading a PDF in Node, finds the standard fonts that PDFs may use without embedding. */
export const STANDARD_FONTS = 'node_modules/pdfjs-dist/standard_fonts/';
mkdirSync(ARTIFACTS, { recursive: true });

export const shot = (page: Page, name: string) => page.screenshot({ path: `${ARTIFACTS}/${name}.png` });
export const pdf = async (name: string, pages: string[][]) => ({ name, mimeType: 'application/pdf', buffer: await makePdf(pages) });

/** A picture drawn in the browser: a coloured field with a white panel, encoded as `type`. */
export async function picture(page: Page, width: number, height: number, color: string, type: string) {
  const bytes = await page.evaluate(
    async ({ width, height, color, type }) => {
      const canvas = new OffscreenCanvas(width, height);
      const g = canvas.getContext('2d')!;
      g.fillStyle = color;
      g.fillRect(0, 0, width, height);
      g.fillStyle = '#fff';
      g.fillRect(width / 4, height / 4, width / 2, height / 2);
      return [...new Uint8Array(await (await canvas.convertToBlob({ type })).arrayBuffer())];
    },
    { width, height, color, type },
  );
  return Buffer.from(bytes);
}

/** Starts a project from these PDFs, as a reader opening them from the start page would. */
export async function openWith(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles(files.map((f) => ({ ...f, mimeType: 'application/pdf' })));
  await expect(page.locator('.textLayer span').first()).toBeVisible();
}

export async function openProject(page: Page) {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles([await pdf('Reef essay.pdf', ESSAY), await pdf('Survey notes.pdf', NOTES)]);
  // Storing, opening and drawing the first page takes longer on a machine busy with other tests.
  await expect(page.locator('.textLayer span').first()).toBeVisible({ timeout: 15_000 });
}

/** Drags the mouse across the page text from the start of `from` to the end of `to`, as a reader would. */
export async function select(page: Page, from: string, to = from) {
  const start = page.locator('.textLayer span', { hasText: from }).first();
  const end = page.locator('.textLayer span', { hasText: to }).first();
  await start.scrollIntoViewIfNeeded();
  const a = (await start.boundingBox())!;
  const b = (await end.boundingBox())!;
  await page.mouse.move(a.x + 1, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
  return a;
}

export const card = (page: Page, text: string) => page.locator('.react-flow__node').filter({ hasText: text });

/** Opens an exported PDF in Node with pdf.js, as a reader would read it. */
export const readPdf = (file: string) => getDocument({ data: new Uint8Array(readFileSync(file)), standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' });

export const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
export type Box = { x: number; y: number; width: number; height: number };
/** How much of box `a` lies inside box `b`. */
export const inside = (a: Box, b: Box) => {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (w * h) / (a.width * a.height);
};

/** Where a word or phrase of the text layer is on screen, as selecting it would mark it. */
export async function textBox(page: Page, word: string): Promise<Box> {
  const layer = page.locator('.page:not([data-copy]) .textLayer');
  await expect(layer).toContainText(word);
  return layer.evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = new RegExp(`(^|\\s)${word.replace('.', '\\.')}(\\s|$)`).exec(node.textContent!);
      if (!at) continue;
      const range = document.createRange();
      const start = at.index + at[1]!.length;
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      return range.getBoundingClientRect().toJSON() as Box;
    }
    throw new Error(`${word} is not in the text layer`);
  }, word);
}
