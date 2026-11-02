import { expect, test, type Page } from '@playwright/test';
import { card, openProject, select } from './helpers';

const canvasTabs = (page: Page) => page.getByRole('tablist', { name: 'Canvases' });

test('a project keeps several canvases, and showing a card opens the canvas it is on', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Coral reefs')).toBeVisible();

  await page.getByRole('button', { name: 'New canvas' }).click();
  await expect(canvasTabs(page).getByRole('tab', { name: 'Canvas 2' })).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'Coral reefs')).toHaveCount(0);
  await canvasTabs(page).getByRole('tab', { name: 'Canvas 2' }).dblclick();
  await canvasTabs(page).getByRole('textbox', { name: 'Canvas name' }).fill('Threats');
  await page.keyboard.press('Enter');
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Rising sea')).toBeVisible();

  // The first excerpt's highlight leads back to its own canvas.
  await canvasTabs(page).getByRole('tab', { name: 'Canvas 1' }).click();
  await expect(card(page, 'Rising sea')).toHaveCount(0);
  await canvasTabs(page).getByRole('tab', { name: 'Threats' }).click();
  const mark = (await page.locator('.hl[data-id]').first().boundingBox())!;
  await page.mouse.click(mark.x + 20, mark.y + mark.height / 2);
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Show on canvas' }).click();
  await expect(canvasTabs(page).getByRole('tab', { name: 'Canvas 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'Coral reefs')).toBeVisible();

  // Kept, and removing a canvas takes its cards with it, which undo restores.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(canvasTabs(page).getByRole('tab')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await canvasTabs(page).getByRole('button', { name: 'Remove Threats' }).click();
  await expect(canvasTabs(page).getByRole('tab')).toHaveCount(1);
  await expect(page.locator('.hl[data-id]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(canvasTabs(page).getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.hl[data-id]')).toHaveCount(2);
});

test('a line drawn with the pen from one card to another links them', async ({ page }) => {
  await openProject(page);
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  for (const [y, text] of [
    [120, 'Cause'],
    [360, 'Effect'],
  ] as const) {
    await page.mouse.dblclick(flow.x + 120, flow.y + y);
    await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
    await page.keyboard.type(text);
  }
  await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'Pen' }).click();
  const a = (await page.locator('.react-flow__node').first().boundingBox())!;
  const b = (await page.locator('.react-flow__node').last().boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 10, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.locator('[data-ink-card]')).toHaveCount(0);

  // A stroke that does not end on a card stays handwriting.
  await page.mouse.move(flow.x + 420, flow.y + 200);
  await page.mouse.down();
  await page.mouse.move(flow.x + 520, flow.y + 260, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-ink-card]')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});
