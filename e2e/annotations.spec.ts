import { copyFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { ARTIFACTS, card, inside, readPdf, shot, textBox } from './helpers';

const LINES = [
  'Coral reefs occupy less than one percent of the ocean floor.',
  'Rising sea temperatures cause corals to bleach.',
  'Mangrove forests protect coastlines from storms.',
  'Kelp forests shelter hundreds of species.',
];
const SIZE = 14;
const X = 72;
const baseline = (line: number) => 700 - line * 40;

/**
 * A PDF annotated in another app: a highlight with a note and a pop-up, an underline, a sticky note
 * beside a line and one far from any text, a text box typed beside a line, and a pen stroke.
 */
async function annotatedPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const page = pdf.addPage([612, 792]);
  LINES.forEach((line, i) => page.drawText(line, { x: X, y: baseline(i), size: SIZE, font }));
  const ctx = pdf.context;
  const add = (dict: Record<string, unknown>) => {
    const ref = ctx.register(ctx.obj({ Type: 'Annot', F: 4, P: page.ref, M: PDFString.of('D:20260101000000Z'), ...dict } as never));
    page.node.addAnnot(ref);
    return ref;
  };
  /** The quad over words of a line, as Acrobat writes it. */
  const quad = (line: number, words: string) => {
    const from = X + font.widthOfTextAtSize(LINES[line]!.slice(0, LINES[line]!.indexOf(words)), SIZE);
    const to = from + font.widthOfTextAtSize(words, SIZE);
    const [top, bottom] = [baseline(line) + SIZE * 0.9, baseline(line) - SIZE * 0.25];
    return { QuadPoints: [from, top, to, top, from, bottom, to, bottom], Rect: [from, bottom, to, top] };
  };
  const highlight = add({
    Subtype: 'Highlight',
    ...quad(0, 'Coral reefs occupy'),
    C: [1, 0.9, 0],
    T: PDFHexString.fromText('Reviewer'),
    Contents: PDFHexString.fromText('Check the source of this figure.'),
  });
  const popup = add({ Subtype: 'Popup', Rect: [400, 600, 580, 700], Parent: highlight, Open: false });
  ctx.lookup(highlight, PDFDict).set(PDFName.of('Popup'), popup);
  add({ Subtype: 'Underline', ...quad(1, 'sea temperatures'), C: [0, 0.3, 1] });
  add({ Subtype: 'Text', Rect: [36, baseline(2) - 4, 54, baseline(2) + 14], C: [1, 0.4, 0.7], Contents: PDFHexString.fromText('Is this still true?'), Name: 'Comment' });
  add({ Subtype: 'Text', Rect: [500, 90, 518, 108], C: [1, 1, 0], Contents: PDFHexString.fromText('Remember to cite the survey.'), Name: 'Note' });
  add({ Subtype: 'FreeText', Rect: [330, baseline(3) - 4, 420, baseline(3) + 14], Contents: PDFHexString.fromText('Source?'), DA: PDFString.of('/Helv 12 Tf 0 0 1 rg') });
  add({ Subtype: 'Ink', Rect: [96, 290, 256, 330], InkList: [[100, 300, 150, 324, 200, 300, 250, 324]], C: [0.9, 0.1, 0.1], BS: { W: 3 } });
  return Buffer.from(await pdf.save());
}

const asked = (page: Page) => page.getByRole('region', { name: 'Annotations from another app' });

async function addAnnotated(page: Page) {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles({ name: 'Reef review.pdf', mimeType: 'application/pdf', buffer: await annotatedPdf() });
  await expect(page.locator('.textLayer')).toContainText('Coral reefs occupy');
}

/** How many of the page canvas's pixels across the middle of the first highlight's words are the highlight's yellow, as the PDF itself draws it. */
const yellowInPdf = (page: Page) =>
  page
    .locator('.pdfViewer > .page[data-page-number="1"] .canvasWrapper canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const g = canvas.getContext('2d')!;
      // The first line's words sit at 72 to about 190 points across a 612 point page, 92 points down.
      const y = Math.round(canvas.height * ((792 - 700 - 4) / 792));
      const { data } = g.getImageData(Math.round(canvas.width * (72 / 612)), y, Math.round(canvas.width * (110 / 612)), 1);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! > 200 && data[i + 1]! > 170 && data[i + 2]! < 140) n++;
      return n;
    });

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Contents, pages and highlights' });
async function openHighlights(page: Page) {
  if (!(await sidebar(page).isVisible())) await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  await sidebar(page).getByRole('tab', { name: 'Highlights' }).click();
}

async function exported(page: Page, name: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/${name}`;
  copyFileSync(await download.path(), file);
  return (await (await readPdf(file).promise).getPage(1)).getAnnotations();
}

const storedFile = (page: Page) =>
  page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((ok) => (indexedDB.open('gloss').onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)));
    const p = await new Promise<{ docs: { file?: string }[] }>(
      (ok) => (db.transaction('projects').objectStore('projects').get(id).onsuccess = (e) => ok((e.target as IDBRequest).result)),
    );
    return p.docs[0]!.file ?? 'original';
  }, page.url().split('/').at(-1)!);

test('annotations from another app are brought in as highlights, comments, a canvas note and ink, drawn and exported once', async ({ page }) => {
  await addAnnotated(page);
  await expect(asked(page)).toContainText('This PDF has 2 highlights, 3 notes and 1 drawing from another app. Bring them in?');
  await expect.poll(() => yellowInPdf(page)).toBeGreaterThan(30);
  await shot(page, 'annotations-asked');

  await asked(page).getByRole('button', { name: 'Bring them in' }).click();
  await expect(asked(page)).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('1 note (p. 1) had no text near it, so it is a note on the canvas.');

  // The highlight covers the words the other app marked, in the nearest Gloss colour, with its note as the comment.
  const marks = page.locator('.pdfViewer > .page[data-page-number="1"] .hl');
  await expect(marks).toHaveCount(4);
  const coral = page.locator('.pdfViewer > .page[data-page-number="1"] .hl.hl-yellow').first();
  const words = await textBox(page, 'Coral reefs occupy');
  const box = (await coral.boundingBox())!;
  expect(inside(words, box)).toBeGreaterThan(0.85);
  expect(inside(box, words)).toBeGreaterThan(0.6);
  await expect(page.locator('.note-mark')).toHaveCount(3);

  await openHighlights(page);
  const list = sidebar(page).locator('.marks > li');
  await expect(list).toHaveCount(4);
  await expect(list.nth(0)).toContainText('Coral reefs occupy');
  await expect(list.nth(0)).toContainText('Check the source of this figure.');
  await expect(list.nth(0).locator('button').first()).toHaveClass(/hl-yellow/);
  await expect(list.nth(1)).toContainText('sea temperatures');
  await expect(list.nth(1).locator('button').first()).toHaveClass(/hl-blue/);
  // A sticky note in the margin and a text box beside a line become comments on those lines.
  await expect(list.nth(2)).toContainText('Mangrove forests protect coastlines from storms.');
  await expect(list.nth(2)).toContainText('Is this still true?');
  await expect(list.nth(3)).toContainText('Kelp forests shelter hundreds of species.');
  await expect(list.nth(3)).toContainText('Source?');
  // The note far from any text is a note on the canvas, saying where it came from.
  await expect(card(page, 'Remember to cite the survey.')).toContainText('(Reef review, p. 1)');
  // The pen stroke is Gloss handwriting, in red, where it was drawn.
  const ink = page.locator('.pdfViewer > .page[data-page-number="1"] .ink-layer path');
  await expect(ink).toHaveCount(1);
  await expect(ink).toHaveAttribute('fill', '#dc2626');
  const sheet = (await page.locator('.pdfViewer > .page[data-page-number="1"]').boundingBox())!;
  const stroke = (await ink.boundingBox())!;
  expect(Math.abs((stroke.x - sheet.x) / sheet.width - 100 / 612)).toBeLessThan(0.01);
  expect(Math.abs((stroke.x + stroke.width - sheet.x) / sheet.width - 250 / 612)).toBeLessThan(0.01);
  expect(Math.abs((stroke.y + stroke.height - sheet.y) / sheet.height - (792 - 300) / 792)).toBeLessThan(0.01);
  await shot(page, 'annotations-brought-in');

  // The PDF no longer draws its own copies, so each shows once: in Gloss's colours, over a white page.
  await expect.poll(() => yellowInPdf(page)).toBe(0);
  await expect(page.locator('.annotationLayer section')).toHaveCount(0);

  // The exported file has each once.
  const annots = await exported(page, 'Reef review (annotated).pdf');
  expect(annots.filter((a) => a.subtype === 'Highlight')).toHaveLength(4);
  expect(annots.filter((a) => a.subtype === 'Ink')).toHaveLength(1);
  expect(annots.filter((a) => ['Text', 'FreeText', 'Underline', 'Popup'].includes(a.subtype))).toEqual([]);
  expect(annots.filter((a) => a.contentsObj?.str.includes('Check the source of this figure.'))).toHaveLength(1);

  // Undo is one step: the file as it was added, with its own annotations, and none of Gloss's.
  await page.keyboard.press('Control+z');
  await expect(marks).toHaveCount(0);
  await expect(ink).toHaveCount(0);
  await expect(card(page, 'Remember to cite the survey.')).toBeHidden();
  await expect.poll(() => yellowInPdf(page)).toBeGreaterThan(30);
  await expect.poll(() => storedFile(page)).toBe('original');
});

test('declined, the PDF stays as it is, and its annotations can be brought in later from the sidebar', async ({ page }) => {
  await addAnnotated(page);
  await asked(page).getByRole('button', { name: 'Keep as is' }).click();
  await expect(asked(page)).toBeHidden();
  await expect(page.locator('.hl')).toHaveCount(0);
  await expect.poll(() => yellowInPdf(page)).toBeGreaterThan(30);
  await expect.poll(() => storedFile(page)).toBe('original');
  const annots = await exported(page, 'Reef review (kept).pdf');
  expect(annots.filter((a) => a.subtype === 'Highlight')).toHaveLength(1);
  expect(annots.filter((a) => a.subtype === 'Text')).toHaveLength(2);

  // Opened again, the question is not asked twice; the sidebar offers it instead.
  await page.reload();
  await expect(page.locator('.textLayer')).toContainText('Coral reefs occupy');
  await expect(asked(page)).toBeHidden();
  await openHighlights(page);
  await expect(sidebar(page)).toContainText('This PDF has 2 highlights, 3 notes and 1 drawing from another app.');
  await shot(page, 'annotations-sidebar');
  await sidebar(page).getByRole('button', { name: 'Bring in this PDF’s annotations' }).click();
  await expect(sidebar(page).locator('.marks > li')).toHaveCount(4);
  await expect(sidebar(page).getByRole('button', { name: 'Bring in this PDF’s annotations' })).toBeHidden();
  await expect(sidebar(page).getByRole('alert')).toContainText('had no text near it');
  await expect.poll(() => yellowInPdf(page)).toBe(0);
});
