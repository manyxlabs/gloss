import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { openProject, shot } from './helpers';

async function device(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  return { context, page: await context.newPage() };
}

const synced = (page: Page) => expect(page.getByRole('status').filter({ hasNotText: 'Gloss' })).toHaveText('Synced', { timeout: 15_000 });
const boxes = (page: Page) => page.locator('.page:not([data-copy]) .text-box');
const placeOf = (box: Locator) =>
  box.evaluate((el) => {
    const p = el.closest('.page')!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { x: (b.left - p.left) / p.width, y: (b.top - p.top) / p.height };
  });

/** Places a text box with a click on the first page, at fractions of it, and types in it. */
async function type(page: Page, fx: number, fy: number, text: string) {
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Text box' }).click();
  const at = (await page.locator('.pdfViewer > .page[data-page-number="1"]').boundingBox())!;
  await page.mouse.click(at.x + at.width * fx, at.y + at.height * fy);
  await expect(page.getByRole('textbox', { name: 'Text box' }).last()).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Select' }).click();
}

test('a text box reaches the other device, moved there it moves here, and one on a document kept on this device never leaves it', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await device(browser);
  const b = await device(browser);
  await openProject(a.page);

  await a.page.getByRole('button', { name: 'Share' }).click();
  const sharing = a.page.getByRole('dialog', { name: 'Share this project' });
  await sharing.getByRole('textbox', { name: 'Your name' }).fill('Ada');
  await sharing.getByRole('button', { name: 'Create link' }).click();
  const shared = a.page.getByRole('dialog', { name: 'This project is shared' });
  const link = await shared.getByRole('textbox', { name: 'Share link' }).inputValue();
  await shared.getByRole('button', { name: 'Done' }).click();
  await synced(a.page);

  await b.page.goto(link);
  const naming = b.page.getByRole('dialog', { name: 'What should others call you?' });
  await naming.getByRole('textbox', { name: 'Your name' }).fill('Ben');
  await naming.getByRole('button', { name: 'Save' }).click();
  await synced(b.page);

  await type(a.page, 0.5, 0.42, 'Compare with the 2016 survey');
  const there = boxes(b.page);
  await expect(there).toHaveText('Compare with the 2016 survey', { timeout: 15_000 });
  const placed = await placeOf(boxes(a.page));
  await expect.poll(async () => (await placeOf(there)).x).toBeCloseTo(placed.x, 3);
  await expect.poll(async () => (await placeOf(there)).y).toBeCloseTo(placed.y, 3);
  await shot(b.page, 'text-box-synced');

  // Moved on the other device, it moves here.
  const box = (await there.boundingBox())!;
  await b.page.mouse.move(box.x + 20, box.y + 8);
  await b.page.mouse.down();
  await b.page.mouse.move(box.x - 60, box.y + 88, { steps: 10 });
  await b.page.mouse.up();
  const moved = await placeOf(there);
  expect(moved.y).toBeGreaterThan(placed.y + 0.05);
  await expect.poll(async () => (await placeOf(boxes(a.page))).y, { timeout: 15_000 }).toBeCloseTo(moved.y, 3);

  // A box on a document kept on this device stays here.
  await a.page.getByRole('tab', { name: 'Survey notes' }).click();
  a.page.once('dialog', (d) => d.accept());
  await a.page.getByRole('button', { name: 'More for this document' }).click();
  await a.page.getByRole('menu', { name: 'More for this document' }).getByRole('menuitemcheckbox', { name: 'Only on this device' }).click();
  await expect(b.page.getByRole('tab', { name: 'Survey notes' })).toHaveCount(0, { timeout: 15_000 });
  await type(a.page, 0.5, 0.3, 'Private thought');
  await expect(boxes(a.page)).toHaveText('Private thought');
  await synced(a.page);
  // A change after it, which does reach the other device, shows the private one was not sent before it.
  await a.page.getByRole('tab', { name: 'Reef essay' }).click();
  await type(a.page, 0.5, 0.6, 'Shared after');
  await expect(b.page.getByText('Shared after')).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByText('Private thought')).toHaveCount(0);
  await expect(b.page.getByRole('tab', { name: 'Survey notes' })).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});
