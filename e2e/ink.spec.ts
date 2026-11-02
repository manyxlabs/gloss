import { copyFileSync, readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, openProject, readPdf, select, shot } from './helpers';
import { noteCard } from './cards';

const canvasTool = (page: Page, name: string) => page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name }).click();

/** A stroke across a box, as a hand would write a short word. */
async function scribble(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const [x, y] = [box.x + box.width * 0.25, box.y + box.height * 0.5];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i * box.width * 0.04, y + (i % 2 ? -1 : 1) * Math.min(12, box.height * 0.2));
  await page.mouse.up();
}

/** The eraser dragged straight from one point to another. */
async function rub(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

async function note(page: Page, text: string, x: number, y: number) {
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + x, flow.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.type(text);
  // Clear of the zoom buttons at the bottom left and the map at the bottom right.
  await page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height - 24);
}

test('an ink box and handwriting on a note: written, resized, erased, undone, kept and exported as pictures', async ({ page }) => {
  test.setTimeout(120_000);
  await openProject(page);
  await page.getByRole('button', { name: 'Ink box' }).click();
  const sketch = page.locator('.card.sketch');
  await expect(sketch).toContainText('Write here with the pen');
  await canvasTool(page, 'Pen');
  await scribble(page, (await sketch.boundingBox())!);
  await expect(sketch.locator('.card-ink path')).toHaveCount(1);
  await expect(sketch).not.toContainText('Write here');
  await expect(page.locator('[data-ink-card]')).toHaveCount(0);

  // Resized from its corner while chosen.
  await canvasTool(page, 'Select');
  const before = (await sketch.boundingBox())!;
  await sketch.click({ position: { x: 8, y: 8 } });
  const corner = (await page.locator('.react-flow__node .sketch-corner.bottom.right').boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 80, corner.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await sketch.boundingBox())!.width).toBeGreaterThan(before.width + 40);

  await note(page, 'Handwritten note', 120, 420);
  const written = noteCard(page, 'Handwritten note');
  await canvasTool(page, 'Pen');
  await scribble(page, (await written.boundingBox())!);
  await expect(written.locator('.card-ink path')).toHaveCount(1);
  await shot(page, 'ink-box-and-note');
  await page.keyboard.press('Control+z');
  await expect(written.locator('.card-ink path')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(written.locator('.card-ink path')).toHaveCount(1);

  // The eraser takes a stroke from a card and leaves the card.
  await canvasTool(page, 'Eraser');
  const stroke = (await written.locator('.card-ink path').boundingBox())!;
  await rub(page, { x: stroke.x + stroke.width / 2, y: stroke.y - 10 }, { x: stroke.x + stroke.width / 2, y: stroke.y + stroke.height + 10 });
  await expect(written.locator('.card-ink path')).toHaveCount(0);
  await expect(written).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(written.locator('.card-ink path')).toHaveCount(1);

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.card.sketch .card-ink path')).toHaveCount(1);
  await expect(noteCard(page, 'Handwritten note').locator('.card-ink path')).toHaveCount(1);

  // Text where there is text, pictures where there is handwriting.
  const exported = async (label: string, ext: string) => {
    await page.getByRole('button', { name: 'Export notes' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label }).click()]);
    const file = `${ARTIFACTS}/ink-notes.${ext}`;
    copyFileSync(await download.path(), file);
    return file;
  };
  const md = readFileSync(await exported('Markdown (.md)', 'md'), 'utf8');
  expect(md).toContain('Handwritten note\n\n![Handwriting](data:image/svg+xml;base64,');
  expect(md.match(/!\[Handwriting\]\(data:image\/svg\+xml;base64,/g)).toHaveLength(2);
  const svg = Buffer.from(/base64,([^)]+)\)/.exec(md)![1]!, 'base64').toString();
  expect(svg).toMatch(/^<svg [^>]*><path d="M/);

  const pdf = await readPdf(await exported('PDF (.pdf)', 'pdf')).promise;
  const ops = await (await pdf.getPage(1)).getOperatorList();
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  expect(ops.fnArray.filter((f) => f === OPS.paintImageXObject).length).toBe(2);
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((t) => ('str' in t ? t.str : '')).join(' ');
  expect(text).toContain('Handwritten note');

  const docx = unzipSync(readFileSync(await exported('Word (.docx)', 'docx')));
  expect(Object.keys(docx).filter((k) => k.startsWith('word/media/') && k.endsWith('.png'))).toHaveLength(2);
});

test('the eraser takes the links it passes over: lines between cards, links to passages and to canvases', async ({ page }) => {
  test.setTimeout(120_000);
  await openProject(page);
  await note(page, 'Cause', 120, 140);
  await note(page, 'Effect', 120, 560);
  await canvasTool(page, 'Pen');
  const a = (await noteCard(page, 'Cause').boundingBox())!;
  const b = (await noteCard(page, 'Effect').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  await canvasTool(page, 'Eraser');
  const line = (await page.locator('.react-flow__edge-path').boundingBox())!;
  const mid = { x: line.x + line.width / 2, y: line.y + line.height / 2 };
  await rub(page, { x: mid.x - 60, y: mid.y }, { x: mid.x + 60, y: mid.y });
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(noteCard(page, 'Cause')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  // A passage linked to a card with the pen, then rubbed out on the card.
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight yellow' }).click();
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Pen' }).click();
  const mark = (await page.locator('.page:not([data-copy]) .hl[data-id]').first().boundingBox())!;
  const target = (await noteCard(page, 'Cause').boundingBox())!;
  await page.mouse.move(mark.x + 30, mark.y + mark.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
  const chip = noteCard(page, 'Cause').getByRole('button', { name: /Linked to Reef essay p\. 1/ });
  await expect(chip).toBeVisible();
  await expect(page.locator('.page:not([data-copy]) .link-mark')).toHaveCount(1);

  // And a link to another canvas.
  await page.getByRole('button', { name: 'New canvas' }).click();
  await page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 1' }).click();
  await canvasTool(page, 'Select');
  await noteCard(page, 'Effect').click();
  await page.getByRole('toolbar', { name: 'Chosen on the canvas' }).getByRole('button', { name: 'Link to a canvas' }).click();
  await page.getByRole('menu', { name: 'Link to a canvas' }).getByRole('menuitemcheckbox', { name: 'Canvas 2' }).click();
  await page.keyboard.press('Escape');
  const canvasChip = noteCard(page, 'Effect').getByRole('button', { name: 'Canvas 2' });
  await expect(canvasChip).toBeVisible();
  await shot(page, 'eraser-before');

  await canvasTool(page, 'Eraser');
  for (const c of [chip, canvasChip]) {
    const box = (await c.boundingBox())!;
    // Kept to the chip's start: once it goes the card shrinks, and the line to the other card moves up under the eraser.
    await rub(page, { x: box.x + 2, y: box.y + box.height / 2 }, { x: box.x + 40, y: box.y + box.height / 2 });
  }
  await expect(chip).toHaveCount(0);
  await expect(canvasChip).toHaveCount(0);
  await expect(page.locator('.page:not([data-copy]) .link-mark')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(chip).toBeVisible();
  await expect(canvasChip).toBeVisible();
  await expect(page.locator('.page:not([data-copy]) .link-mark')).toHaveCount(1);

  await page.waitForTimeout(500);
  await page.reload();
  await expect(noteCard(page, 'Effect').getByRole('button', { name: 'Canvas 2' })).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});
