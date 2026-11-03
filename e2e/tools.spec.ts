import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, card, inkStyle, openProject, readPdf, select, shot } from './helpers';

/** A note's text is in a field, which a text match does not see; the field's sizer carries it. */
const note = (page: Page, text: string) => page.locator('.react-flow__node').filter({ has: page.locator(`.grow[data-value^="${text}"]`) });

const span = (page: Page, text: string) => page.locator('.textLayer span', { hasText: text }).first();

/**
 * Where a line of text shows on screen. A squeezed page keeps its hidden lines in place under a
 * clip, and shows the rest of the page in a copy, so the line in view is the one whose page
 * shows that stretch.
 */
const shownAt = async (page: Page, text: string) => {
  // pdf.js rebuilds a page's text after a zoom; wait for it.
  await span(page, text).waitFor();
  return page.evaluate((text) => {
    for (const el of document.querySelectorAll<HTMLElement>('.textLayer span')) {
      if (!el.textContent?.includes(text)) continue;
      const pageDiv = el.closest<HTMLElement>('.page')!;
      const box = pageDiv.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const f = (r.top + r.height / 2 - box.top) / box.height;
      if (f >= Number(pageDiv.dataset.from ?? 0) && f <= Number(pageDiv.dataset.to ?? 1)) return { y: r.top, height: r.height, x: r.left, width: r.width };
    }
    throw new Error(`"${text}" is not in view`);
  }, text);
};

/** The gap on screen between the bottom of one line and the top of another. */
async function gap(page: Page, above: string, below: string) {
  const a = await shownAt(page, above);
  const b = await shownAt(page, below);
  return b.y - (a.y + a.height);
}
const zoomOut = async (page: Page, times: number) => {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
};

test('squeezing folds the text between two passages away, and expanding brings it back', async ({ page }) => {
  await openProject(page);
  await zoomOut(page, 4);
  const apart = await gap(page, 'of all marine species.', 'Marine protected areas');
  expect(apart).toBeGreaterThan(300);

  // Everything from the third paragraph of page 1 to the second of page 2 is squeezed away.
  await select(page, 'Rising sea temperatures', 'smothered by seaweed.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Squeeze' }).click();
  const bar = page.locator('.fold-bar');
  await expect(bar).toHaveCount(1);
  await expect(bar).toContainText('squeezed');
  const together = await gap(page, 'of all marine species.', 'Marine protected areas');
  expect(together).toBeLessThan(60);
  await shot(page, 'squeeze-across-pages');

  // Kept with the project.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.fold-bar')).toHaveCount(1);
  await zoomOut(page, 4);
  expect(await gap(page, 'of all marine species.', 'Marine protected areas')).toBeLessThan(60);

  await page.locator('.fold-bar').click();
  await expect(page.locator('.fold-bar')).toHaveCount(0);
  expect(Math.abs((await gap(page, 'of all marine species.', 'Marine protected areas')) - apart)).toBeLessThan(2);

  // Within one page: the rest of the page follows as a copy, whose text can still be excerpted.
  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Squeeze' }).click();
  expect(await gap(page, 'of its water.', 'Rising sea temperatures')).toBeLessThan(60);
  const copy = page.locator('.fold-tail .textLayer span', { hasText: 'Rising sea temperatures' });
  await expect(copy).toHaveCount(1);
  const c = (await copy.boundingBox())!;
  await page.mouse.move(c.x + 1, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width - 1, c.y + c.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Rising sea temperatures')).toBeVisible();
  await shot(page, 'squeeze-within-page');
  // Unsqueezed, the highlight made in the copy sits on the line in the page itself.
  await page.locator('.fold-bar').first().click();
  const line = (await span(page, 'Rising sea temperatures').boundingBox())!;
  const mark = (await page.locator('.page:not([data-copy]) .hl').first().boundingBox())!;
  expect(Math.abs(mark.y - line.y)).toBeLessThan(4);
});

test('two fingers held one above the other and pinched together squeeze a phone page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  const before = await gap(page, 'of its water.', 'Rising sea temperatures');
  const a = await shownAt(page, 'of its water.');
  const b = await shownAt(page, 'Rising sea temperatures');
  const cdp = await context.newCDPSession(page);
  const top = a.y + a.height + 2;
  const bottom = b.y - 2;
  for (let i = 0; i <= 6; i++) {
    const squeeze = ((bottom - top) / 2) * (i / 6) * 0.8;
    await cdp.send('Input.dispatchTouchEvent', {
      type: i ? 'touchMove' : 'touchStart',
      touchPoints: [
        { x: 195, y: top + squeeze },
        { x: 200, y: bottom - squeeze },
      ],
    });
    if (i === 4) await shot(page, 'phone-squeeze-pinching');
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.fold-bar')).toHaveCount(1);
  expect(await gap(page, 'of its water.', 'Rising sea temperatures')).toBeLessThan(before);
  await shot(page, 'phone-squeezed');
  await context.close();
});

test('handwriting on a page and on the canvas can be erased, undone and is kept', async ({ page }) => {
  await openProject(page);
  const docTools = page.getByRole('toolbar', { name: 'Document tools' });
  await docTools.getByRole('button', { name: 'Pen' }).click();
  await inkStyle(page, 'Document tools', 'Red ink');
  const pageBox = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  const [x, y] = [pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * 0.6];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x + i * 12, y + Math.sin(i / 2) * 18);
  await page.mouse.up();
  const strokes = page.locator('.page:not([data-copy]) .ink-layer path');
  await expect(strokes).toHaveCount(1);
  await expect(strokes).toHaveAttribute('fill', '#dc2626');

  // The pen does not select text.
  expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('');

  await docTools.getByRole('button', { name: 'Eraser' }).click();
  const drawn = (await strokes.boundingBox())!;
  await page.mouse.move(drawn.x - 5, drawn.y + drawn.height / 2);
  await page.mouse.down();
  await page.mouse.move(drawn.x + drawn.width + 5, drawn.y + drawn.height / 2, { steps: 30 });
  await page.mouse.up();
  await expect(strokes).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(strokes).toHaveCount(1);
  await docTools.getByRole('button', { name: 'Select' }).click();

  // On the canvas, the pen writes a card of its own.
  const canvasTools = page.getByRole('toolbar', { name: 'Canvas tools' });
  await canvasTools.getByRole('button', { name: 'Pen' }).click();
  const canvas = (await page.locator('.canvas').boundingBox())!;
  const [cx, cy] = [canvas.x + 150, canvas.y + 250];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(cx + i * 10, cy + (i % 2) * 20);
  await page.mouse.up();
  await expect(page.locator('[data-ink-card]')).toHaveCount(1);

  // A stylus writes even while the select tool is chosen; a finger or mouse would pan.
  await canvasTools.getByRole('button', { name: 'Select' }).click();
  const cdp = await page.context().newCDPSession(page);
  const pen = { pointerType: 'pen', button: 'left', force: 0.6 } as const;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy + 120, clickCount: 1, buttons: 1, ...pen });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + i * 12, y: cy + 120 + i * 3, buttons: 1, ...pen });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 120, y: cy + 150, clickCount: 1, buttons: 0, ...pen });
  await expect(page.locator('[data-ink-card]')).toHaveCount(2);
  await shot(page, 'handwriting');

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.page:not([data-copy]) .ink-layer path')).toHaveCount(1);
  await expect(page.locator('[data-ink-card]')).toHaveCount(2);
});

test('cards gather into a named group that moves, takes new cards and exports as a section', async ({ page }) => {
  await openProject(page);
  const canvas = (await page.locator('.canvas').boundingBox())!;
  const write = async (x: number, y: number, text: string) => {
    await page.mouse.dblclick(canvas.x + x, canvas.y + y);
    await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
    await page.keyboard.type(text);
  };
  await write(80, 140, 'Warming bleaches corals.');
  await write(80, 260, 'Overfishing lets algae win.');
  await write(420, 420, 'Protected areas help.');
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 560 } });

  await note(page, 'Warming').click({ position: { x: 4, y: 4 } });
  await note(page, 'Overfishing').click({ position: { x: 4, y: 4 }, modifiers: ['ControlOrMeta'] });
  await page.getByRole('button', { name: 'Group' }).click();
  const group = page.locator('.react-flow__node').filter({ has: page.locator('.group') });
  await expect(group).toHaveCount(1);
  await group.getByRole('textbox', { name: 'Group name' }).fill('Reef threats');

  // Dragging the group by its margin carries its cards.
  const before = (await note(page, 'Warming').boundingBox())!;
  const g = (await group.boundingBox())!;
  await page.mouse.move(g.x + 8, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 68, g.y + g.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const after = (await note(page, 'Warming').boundingBox())!;
  const moved = (await group.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(30);
  expect(after.x - before.x).toBeCloseTo(moved.x - g.x, 0);
  expect(after.y - before.y).toBeCloseTo(moved.y - g.y, 0);

  // A card dropped inside the group joins it.
  const loose = (await note(page, 'Protected').boundingBox())!;
  const inside = (await group.boundingBox())!;
  await page.mouse.move(loose.x + 6, loose.y + 6);
  await page.mouse.down();
  await page.mouse.move(inside.x + 40, inside.y + inside.height - 30, { steps: 10 });
  await page.mouse.up();
  await shot(page, 'group');

  await page.getByRole('button', { name: 'Export notes' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('group', { name: 'Download' }).getByRole('menuitem', { name: 'Markdown (.md)' }).click()]);
  copyFileSync(await download.path(), `${ARTIFACTS}/group-notes.md`);
  const notes = readFileSync(`${ARTIFACTS}/group-notes.md`, 'utf8');
  expect(notes).toMatch(/## Reef threats\n\nWarming bleaches corals\.\n\n---\n\nOverfishing lets algae win\.\n\n---\n\nProtected areas help\./);

  await group.hover();
  await group.getByRole('button', { name: 'Ungroup' }).click();
  await expect(group).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  expect(Math.round((await note(page, 'Warming').boundingBox())!.x)).toBe(Math.round(after.x));
});

test('the exported PDF carries highlights, comments and handwriting as annotations any reader shows', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await card(page, 'Coral reefs').getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Tiny area, huge share.');
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight blue' }).click();

  const docTools = page.getByRole('toolbar', { name: 'Document tools' });
  await docTools.getByRole('button', { name: 'Pen' }).click();
  const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.72, { steps: 20 });
  await page.mouse.up();
  await docTools.getByRole('button', { name: 'Select' }).click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  expect(download.suggestedFilename()).toBe('Reef essay (annotated).pdf');
  const file = `${ARTIFACTS}/Reef essay (annotated).pdf`;
  copyFileSync(await download.path(), file);

  const task = readPdf(file);
  const doc = await task.promise;
  const first = await doc.getPage(1);
  const annots = await first.getAnnotations();
  const highlights = annots.filter((a) => a.subtype === 'Highlight');
  expect(highlights).toHaveLength(2);
  expect(highlights.map((h) => h.contentsObj?.str)).toContain('Tiny area, huge share.');
  expect(annots.filter((a) => a.subtype === 'Ink')).toHaveLength(1);

  // Each highlight covers its own lines of text in the file, not just somewhere on the page.
  const { items } = await first.getTextContent();
  const lineY = (text: string) => (items.find((i) => 'str' in i && i.str.startsWith(text)) as { transform: number[] }).transform[5]!;
  const spans = highlights.map((h) => [h.rect[1], h.rect[3]] as [number, number]);
  for (const text of ['Coral reefs occupy', 'of all marine species.', 'Rising sea temperatures'])
    expect(spans.some(([bottom, top]) => lineY(text) >= bottom - 2 && lineY(text) <= top)).toBe(true);
  await task.destroy();

  // Opened again, the annotations are drawn by the PDF itself.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add file' }).click()]);
  await chooser.setFiles({ name: 'annotated.pdf', mimeType: 'application/pdf', buffer: readFileSync(file) });
  await expect(page.getByRole('tab', { name: 'annotated' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.hl')).toHaveCount(0);
  // The page is drawn a while after the document opens, longer on a busy machine.
  const pixels = () =>
    page
      .locator('.page[data-page-number="1"] canvas')
      .first()
      .evaluate((c: HTMLCanvasElement) => {
        const g = c.getContext('2d')!;
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let yellow = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i]! > 200 && d[i + 1]! > 180 && d[i + 2]! < 120) yellow++;
        return yellow;
      });
  await expect.poll(pixels).toBeGreaterThan(500);
  await shot(page, 'exported-pdf-reopened');
});
