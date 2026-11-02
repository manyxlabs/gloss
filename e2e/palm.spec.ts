import { expect, test, type CDPSession } from '@playwright/test';
import { openProject } from './helpers';

const pen = { pointerType: 'pen', button: 'left', force: 0.5 } as const;
async function penStroke(cdp: CDPSession, x: number, y: number) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, clickCount: 1, buttons: 1, ...pen });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i * 10, y: y + (i % 2) * 6, buttons: 1, ...pen });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 100, y, clickCount: 1, buttons: 0, ...pen });
}
async function fingerDrag(cdp: CDPSession, x: number, y: number, dx: number, dy: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('once a stylus has written, a finger scrolls the page and pans the canvas instead of drawing', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await openProject(page);
  const docTools = page.getByRole('toolbar', { name: 'Document tools' });
  await docTools.getByRole('button', { name: 'Pen' }).click();
  const strokes = page.locator('.page:not([data-copy]) .ink-layer path');

  // Before any stylus, a finger writes: a phone has nothing else to write with.
  const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  await fingerDrag(cdp, box.x + 100, box.y + 420, 120, 10);
  await expect(strokes).toHaveCount(1);

  await penStroke(cdp, box.x + 100, box.y + 480);
  await expect(strokes).toHaveCount(2);

  const scroller = page.locator('.doc-pane .doc-scroll').first();
  const before = await scroller.evaluate((e) => e.scrollTop);
  await fingerDrag(cdp, box.x + 200, box.y + 500, 0, -300);
  await expect(strokes).toHaveCount(2);
  expect(await scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(before + 200);

  // The canvas: the pen writes, a finger pans.
  const canvasTools = page.getByRole('toolbar', { name: 'Canvas tools' });
  await canvasTools.getByRole('button', { name: 'Pen' }).click();
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await penStroke(cdp, flow.x + 120, flow.y + 200);
  await expect(page.locator('[data-ink-card]')).toHaveCount(1);
  const viewport = () => page.locator('.react-flow__viewport').evaluate((e) => getComputedStyle(e).transform);
  const was = await viewport();
  await fingerDrag(cdp, flow.x + 200, flow.y + 400, 120, 80);
  await expect(page.locator('[data-ink-card]')).toHaveCount(1);
  expect(await viewport()).not.toBe(was);

  // Remembered on this device.
  await page.reload();
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Pen' }).click();
  const again = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  await fingerDrag(cdp, again.x + 100, again.y + 300, 120, 0);
  await expect(page.locator('.page:not([data-copy]) .ink-layer path')).toHaveCount(2);
  await context.close();
});
