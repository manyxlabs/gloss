import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, inkStyle, openProject, readPdf, shot, type Box } from './helpers';
import { noteCard } from './cards';

// Several strokes, a reload and an export, on a machine that may be busy with other suites.
test.describe.configure({ timeout: 90_000 });

type Kind = 'red' | 'blue' | 'yellow' | 'green' | 'dark';

/** For each column of a picture, how many of its pixels are of a kind; a highlighter's green is pale. */
function columnsOf(page: Page, png: Buffer, kind: Kind) {
  return page.evaluate(
    async ({ b64, kind }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const g = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      g.drawImage(bitmap, 0, 0);
      const d = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const is = (r: number, gr: number, b: number) =>
        kind === 'red'
          ? r > 150 && r - gr > 80
          : kind === 'blue'
            ? b - r > 60
            : kind === 'yellow'
              ? r > 200 && gr > 170 && r - b > 40
              : kind === 'green'
                ? gr > 190 && gr < 245 && gr - r > 30 && gr - b > 15
                : 0.2126 * r + 0.7152 * gr + 0.0722 * b < 50;
      const out = Array<number>(bitmap.width).fill(0);
      for (let y = 0; y < bitmap.height; y++)
        for (let x = 0; x < bitmap.width; x++) {
          const i = (y * bitmap.width + x) * 4;
          if (is(d[i]!, d[i + 1]!, d[i + 2]!)) out[x]!++;
        }
      return out;
    },
    { b64: png.toString('base64'), kind },
  );
}
/** The same, of what the screen shows in a box. */
const columns = async (page: Page, box: Box, kind: Kind) => columnsOf(page, await page.screenshot({ clip: box }), kind);
/** How thick a stroke of a kind is where it crosses a column of the box, as a fraction across. */
const thickness = async (page: Page, box: Box, kind: Kind, at: number) => (await columns(page, box, kind))[Math.round(box.width * at)]!;
const total = async (page: Page, box: Box, kind: Kind) => (await columns(page, box, kind)).reduce((a, b) => a + b, 0);

/** A pen stroke through these points, each reached in small steps; held still at its end when asked. */
async function draw(page: Page, points: [number, number][], hold = 0) {
  await page.mouse.move(...points[0]!);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...p, { steps: 12 });
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.up();
}
const wave = (x: number, y: number, width: number, height: number) => Array.from({ length: 9 }, (_, i): [number, number] => [x + (i * width) / 8, y + (i % 2 ? height : 0)]);

const page1 = (page: Page) => page.locator('.page:not([data-copy])[data-page-number="1"]');
const inks = (page: Page) => page1(page).locator('.ink-layer path');
const markers = (page: Page) => page1(page).locator('.marker-layer path');

test('pens on a page: highlighter under the text, calligraphy, widths and straight lines, kept, undone and exported', async ({ page }) => {
  await openProject(page);
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Pen' }).click();
  const line = (await page.locator('.textLayer span', { hasText: 'Coral reefs occupy' }).first().boundingBox())!;
  const darkBefore = await total(page, line, 'dark');
  expect(darkBefore).toBeGreaterThan(200);

  // A highlighter across a line of text: wide and yellow, with the words as dark as before under it.
  await inkStyle(page, 'Document tools', 'Yellow ink', 'Highlighter', 'Medium');
  await draw(page, [
    [line.x, line.y + line.height / 2],
    [line.x + line.width, line.y + line.height / 2],
  ]);
  await expect(markers(page)).toHaveCount(1);
  await expect(inks(page)).toHaveCount(0);
  await expect(markers(page)).toHaveAttribute('fill-opacity', '0.4');
  expect(await thickness(page, line, 'yellow', 0.5)).toBeGreaterThan(line.height * 0.4);
  expect(await total(page, line, 'yellow')).toBeGreaterThan(line.width * line.height * 0.2);
  expect(await total(page, line, 'dark')).toBeGreaterThan(darkBefore * 0.85);

  // Calligraphy: a V whose first stroke runs along the slanted nib and comes out thin, and whose second runs across it, thick.
  const box = (await page1(page).boundingBox())!;
  const [vx, vy] = [box.x + box.width * 0.15, box.y + box.height * 0.4];
  await inkStyle(page, 'Document tools', 'Red ink', 'Calligraphy', 'Bold');
  await draw(page, [
    [vx, vy],
    [vx + 80, vy + 80],
    [vx + 160, vy],
  ]);
  await expect(inks(page)).toHaveCount(1);
  const v = { x: vx - 20, y: vy - 20, width: 200, height: 120 };
  const calligraphy = async () => [await thickness(page, v, 'red', 0.3), await thickness(page, v, 'red', 0.7)] as const;
  const [thin, thick] = await calligraphy();
  expect(thin).toBeGreaterThan(0);
  expect(thick).toBeGreaterThan(thin * 2.5);

  // A ballpoint fine and bold: even lines, the bold one several times as thick.
  const lines = { x: vx - 20, y: box.y + box.height * 0.6 - 20, width: 240, height: 100 };
  const across = (y: number) => [[lines.x + 20, y] as [number, number], [lines.x + 220, y] as [number, number]];
  await inkStyle(page, 'Document tools', 'Blue ink', 'Ballpoint', 'Fine');
  await draw(page, across(lines.y + 25));
  await inkStyle(page, 'Document tools', 'Bold');
  await draw(page, across(lines.y + 75));
  await expect(inks(page)).toHaveCount(3);
  const widths = async () => {
    const top = { ...lines, height: 50 };
    const bottom = { ...lines, y: lines.y + 50, height: 50 };
    return [await thickness(page, top, 'blue', 0.5), await thickness(page, bottom, 'blue', 0.5)] as const;
  };
  const [fine, bold] = await widths();
  expect(fine).toBeGreaterThan(0);
  expect(bold).toBeGreaterThan(fine * 2.5);
  // Even along its length, unlike the pressure pen, which a mouse thins as it speeds up.
  const boldColumns = (await columns(page, { ...lines, y: lines.y + 50, height: 50 }, 'blue')).slice(60, 180);
  expect(Math.max(...boldColumns) - Math.min(...boldColumns)).toBeLessThanOrEqual(2);

  // A wavy stroke held still at its end snaps to a straight line while the pen rests, before it lifts.
  await inkStyle(page, 'Document tools', 'Black ink', 'Pressure', 'Medium');
  const [sx, sy] = [box.x + box.width * 0.15, box.y + box.height * 0.8];
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const p of wave(sx, sy, 200, 40).slice(1)) await page.mouse.move(...p, { steps: 6 });
  const live = page.locator('.doc-body > .ink-live path').first();
  expect((await live.boundingBox())!.height).toBeGreaterThan(30);
  await expect.poll(async () => (await live.boundingBox())!.height).toBeLessThan(12);
  await page.mouse.up();
  await expect(inks(page)).toHaveCount(4);
  expect((await inks(page).last().boundingBox())!.height).toBeLessThan(12);
  expect((await inks(page).last().boundingBox())!.width).toBeGreaterThan(190);
  await shot(page, 'pens-page');

  // The eraser takes a highlighter stroke, under the text, as it takes the pen's.
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Eraser' }).click();
  await draw(page, [
    [line.x + 10, line.y + line.height / 2],
    [line.x + 60, line.y + line.height / 2],
  ]);
  await expect(markers(page)).toHaveCount(0);
  await expect(inks(page)).toHaveCount(4);
  await page.keyboard.press('Control+z');
  await expect(markers(page)).toHaveCount(1);

  // Undone and redone, the highlighter is still under the text.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  await expect(inks(page)).toHaveCount(0);
  await expect(markers(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(markers(page)).toHaveCount(0);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+Shift+z');
  await expect(markers(page)).toHaveCount(1);
  await expect(inks(page)).toHaveCount(4);

  // Kept: each stroke draws as it did, and the pen is as it was left.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(markers(page)).toHaveCount(1);
  await expect(inks(page)).toHaveCount(4);
  expect(await total(page, line, 'dark')).toBeGreaterThan(darkBefore * 0.85);
  expect(await total(page, line, 'yellow')).toBeGreaterThan(line.width * line.height * 0.2);
  const [thinAgain, thickAgain] = await calligraphy();
  expect(thickAgain).toBeGreaterThan(thinAgain * 2.5);
  const [fineAgain, boldAgain] = await widths();
  expect(boldAgain).toBeGreaterThan(fineAgain * 2.5);
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Pen' }).click();
  const style = page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Ink style' });
  await expect(style).toHaveAttribute('title', 'Ink style: Black ink, Pressure, Medium');
  await style.click();
  const dialog = page.getByRole('dialog', { name: 'Ink style' });
  for (const name of ['Black ink', 'Pressure', 'Medium']) await expect(dialog.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'pens-style');
  await page.keyboard.press('Escape');

  // The exported PDF draws each stroke as the screen does: the highlighter multiplied under the text.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/pens-annotated.pdf`;
  copyFileSync(await download.path(), file);
  const pdf = await readPdf(file).promise;
  const first = await pdf.getPage(1);
  const annots = (await first.getAnnotations()).filter((a) => a.subtype === 'Ink');
  expect(annots).toHaveLength(5);
  const marker = annots.find((a) => a.color && a.color[2] > 120 && a.color[0] > 240)!;
  expect([...marker.color]).toEqual([247, 225, 156]);
  const scale = 2;
  const viewport = first.getViewport({ scale });
  const { canvas, context } = (
    pdf as unknown as { canvasFactory: { create: (w: number, h: number) => { canvas: { toBuffer: (type: string) => Buffer }; context: CanvasRenderingContext2D } } }
  ).canvasFactory.create(viewport.width, viewport.height);
  await first.render({ canvas: canvas as never, viewport }).promise;
  writeFileSync(`${ARTIFACTS}/pens-annotated-page1.png`, canvas.toBuffer('image/png'));
  const item = (await first.getTextContent()).items.find((i) => 'str' in i && i.str.startsWith('Coral reefs occupy')) as { transform: number[]; width: number };
  const [left, baseline] = viewport.convertToViewportPoint(item.transform[4]!, item.transform[5]!) as [number, number];
  const data = context.getImageData(left, baseline - 9 * scale, item.width * scale, 12 * scale).data;
  let [yellow, dark] = [0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
    if (r > 200 && g > 170 && r - b > 40) yellow++;
    if (0.2126 * r + 0.7152 * g + 0.0722 * b < 50) dark++;
  }
  expect(yellow).toBeGreaterThan(data.length / 4 / 3);
  expect(dark).toBeGreaterThan(100);
});

test('pens on the canvas: Shift draws straight, nibs show in cards, and the canvas picture and notes carry them', async ({ page }) => {
  await openProject(page);
  const tools = page.getByRole('toolbar', { name: 'Canvas tools' });
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + 80, flow.y + 320);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Nib test');
  await page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height - 24);
  const note = noteCard(page, 'Nib test');
  await tools.getByRole('button', { name: 'Pen' }).click();

  // Shift held, a wave becomes a straight line.
  await inkStyle(page, 'Canvas tools', 'Green ink', 'Highlighter', 'Medium');
  await page.keyboard.down('Shift');
  await draw(page, wave(flow.x + 60, flow.y + 160, 240, 60));
  await page.keyboard.up('Shift');
  const ink = page.locator('.canvas .flow [data-ink-card] path');
  await expect(ink).toHaveCount(1);
  const straight = (await ink.boundingBox())!;
  expect(straight.height).toBeLessThan(20);
  expect(straight.width).toBeGreaterThan(230);
  await expect(ink).toHaveAttribute('fill-opacity', '0.4');

  // On a note, a highlighter and calligraphy are kept in it.
  const n = (await note.boundingBox())!;
  await draw(page, [
    [n.x + 16, n.y + n.height / 2],
    [n.x + n.width - 16, n.y + n.height / 2],
  ]);
  await inkStyle(page, 'Canvas tools', 'Red ink', 'Calligraphy', 'Bold');
  await draw(page, wave(n.x + 20, n.y + 12, n.width - 40, n.height - 24));
  await expect(note.locator('.card-ink path')).toHaveCount(2);
  await shot(page, 'pens-canvas');

  await page.waitForTimeout(500);
  await page.reload();
  await expect(ink).toHaveAttribute('fill-opacity', '0.4');
  await expect(note.locator('.card-ink path')).toHaveCount(2);
  await expect(note.locator('.card-ink path').last()).toHaveAttribute('fill', '#dc2626');

  // The canvas as a picture shows the highlighter pale and see-through, and the calligraphy.
  await page.getByRole('button', { name: 'Export notes' }).click();
  await page.getByRole('menuitem', { name: 'Canvas as a picture…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export the canvas as a picture' });
  await dialog.getByText('PNG', { exact: true }).click();
  const [picture] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export' }).click()]);
  copyFileSync(await picture.path(), `${ARTIFACTS}/pens-canvas.png`);
  const png = readFileSync(await picture.path());
  const sum = async (kind: Kind) => (await columnsOf(page, png, kind)).reduce((a, b) => a + b, 0);
  expect(await sum('green')).toBeGreaterThan(1000);
  expect(await sum('red')).toBeGreaterThan(100);

  // The notes in Markdown draw the note's handwriting as a picture, with its nibs.
  await page.getByRole('button', { name: 'Export notes' }).click();
  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Markdown (.md)' }).click()]);
  copyFileSync(await md.path(), `${ARTIFACTS}/pens-notes.md`);
  const svg = Buffer.from(/base64,([^)]+)\)/.exec(readFileSync(await md.path(), 'utf8'))![1]!, 'base64').toString();
  expect(svg).toContain('fill="#16a34a" fill-opacity="0.4"');
  expect(svg).toContain('fill="#dc2626"');
});
