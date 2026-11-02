import { expect, test, type Page } from '@playwright/test';
import { openProject } from './helpers';

const note = (page: Page, text: string) => page.locator('.react-flow__node').filter({ has: page.locator(`.grow[data-value="${text}"]`) });
const group = (page: Page) => page.locator('.react-flow__node').filter({ has: page.locator('.group') });

async function write(page: Page, x: number, y: number, text: string) {
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + x, flow.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.type(text);
}

test('a group folds down to its name with links ending on it, and opens again as it was', async ({ page }) => {
  await openProject(page);
  await write(page, 80, 160, 'Heat');
  await write(page, 80, 280, 'Bleaching');
  await write(page, 420, 420, 'Recovery');
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 600 } });

  // Link Bleaching to Recovery, then group Heat and Bleaching.
  const from = note(page, 'Bleaching');
  await from.hover();
  const handle = (await from.locator('.react-flow__handle-right').boundingBox())!;
  const to = (await note(page, 'Recovery').boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await note(page, 'Heat').click({ position: { x: 4, y: 4 } });
  await note(page, 'Bleaching').click({ position: { x: 4, y: 4 }, modifiers: ['ControlOrMeta'] });
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  // Compared to a card inside it, so the canvas's zoom after a reload does not matter.
  const ratio = async () => (await group(page).boundingBox())!.height / (await note(page, 'Heat').boundingBox())!.height;
  const open = await ratio();

  await group(page).getByRole('button', { name: 'Collapse group' }).click();
  await expect(note(page, 'Heat')).toBeHidden();
  await expect(group(page)).toContainText('2 cards');
  expect((await group(page).boundingBox())!.height).toBeLessThan(60);
  // The link from inside now starts at the group.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  await page.waitForTimeout(500);
  await page.reload();
  await expect(group(page)).toContainText('2 cards');
  await group(page).getByRole('button', { name: 'Open group' }).click();
  await expect(note(page, 'Heat')).toBeVisible();
  expect(await ratio()).toBeCloseTo(open, 1);
  await page.keyboard.press('Control+z');
  await expect(note(page, 'Heat')).toBeHidden();
});

test('on a touch screen, pinching two cards together groups them, and a pinch closes or opens the group', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await openProject(page);
  await write(page, 80, 160, 'Kelp');
  await write(page, 80, 300, 'Urchins');

  const pinch = async (a: { x: number; y: number }, b: { x: number; y: number }, scale: number) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const at = (p: { x: number; y: number }, t: number) => ({ x: p.x + (mid.x - p.x) * (1 - scale) * t, y: p.y + (mid.y - p.y) * (1 - scale) * t });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(a, i / 8), at(b, i / 8)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const middle = async (text: string) => {
    const r = (await note(page, text).boundingBox())!;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };

  await pinch(await middle('Kelp'), await middle('Urchins'), 0.2);
  await expect(group(page)).toHaveCount(1);
  await expect(note(page, 'Kelp')).toBeVisible();

  const g = (await group(page).boundingBox())!;
  const left = { x: g.x + 12, y: g.y + g.height - 14 };
  const right = { x: g.x + g.width - 12, y: g.y + g.height - 14 };
  await pinch(left, right, 0.3);
  await expect(group(page)).toContainText('2 cards');
  await expect(note(page, 'Kelp')).toBeHidden();

  const c = (await group(page).boundingBox())!;
  const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  await pinch({ x: mid.x - 20, y: mid.y }, { x: mid.x + 20, y: mid.y }, 4);
  await expect(note(page, 'Kelp')).toBeVisible();
  await context.close();
});
