import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARTIFACTS, card, openProject, select, shot } from './helpers';
import { ESSAY } from './pdfs';

test('read, excerpt, connect, find and export', async ({ page }) => {
  await openProject(page);
  await expect(page.getByRole('tab', { name: 'Reef essay' })).toHaveAttribute('aria-selected', 'true');

  // A sentence that wraps onto a second line becomes one excerpt with its text joined.
  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  const coral = card(page, 'Coral reefs occupy');
  await expect(coral.locator('blockquote')).toHaveText(ESSAY[0]![1]!);
  await expect(coral.getByRole('button', { name: 'Reef essay · p. 1' })).toBeVisible();
  await expect(page.locator('.hl.linked')).toHaveCount(2);

  // Dragging a selection onto the canvas drops the excerpt where it lands.
  const from = await select(page, 'Rising sea temperatures');
  const canvas = (await page.locator('.canvas').boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 160, canvas.y + 140, { steps: 12 });
  await page.mouse.up();
  const rising = card(page, 'Rising sea temperatures');
  await expect(rising).toBeVisible();
  const dropped = (await rising.boundingBox())!;
  expect(Math.abs(dropped.x - (canvas.x + 160 - 24))).toBeLessThan(40);

  // A note, written in place, linked to the first excerpt by dragging from its edge onto the card.
  await page.mouse.dblclick(canvas.x + 140, canvas.y + canvas.height - 160);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.keyboard.type('Bleaching and low grazing seem linked.');
  const note = page.locator('.react-flow__node').filter({ has: page.locator('.card.note') });
  await note.hover();
  const handle = (await note.locator('.react-flow__handle-top').boundingBox())!;
  const target = (await coral.boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await shot(page, 'desktop-canvas');

  // From the card back to the passage, from far down the document.
  await page.locator('.doc-scroll').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await coral.getByRole('button', { name: 'Reef essay · p. 1' }).click();
  const flashed = page.locator('.hl.flash').first();
  await expect(flashed).toBeInViewport();
  await shot(page, 'desktop-jump-to-source');
  await expect(page.locator('.hl.flash')).toHaveCount(0);

  // And from the passage to its card.
  await page.locator('.canvas .react-flow__pane').click({ position: { x: 20, y: 300 } });
  const mark = (await page.locator('.hl[data-id]').first().boundingBox())!;
  await page.mouse.click(mark.x + 20, mark.y + mark.height / 2);
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Show on canvas' }).click();
  await expect(coral.locator('.card')).toHaveClass(/selected/);

  // Search covers every document, and opens the other one at the match.
  await page.getByRole('searchbox').fill('parrotfish');
  await page.getByRole('option', { name: /p\. 2/ }).click();
  await expect(page.getByRole('tab', { name: 'Survey notes' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Page 2 / 2')).toBeVisible();
  await expect(page.locator('.textLayer .highlight').first()).toBeInViewport();
  await shot(page, 'desktop-search');

  // A deleted card comes back with undo, highlight included.
  await page.getByRole('tab', { name: 'Reef essay' }).click();
  await rising.click();
  await page.keyboard.press('Delete');
  // Two lines are marked for the first excerpt and one for this one.
  await expect(rising).toHaveCount(0);
  await expect(page.locator('.hl[data-id]')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(rising).toBeVisible();
  await expect(page.locator('.hl[data-id]')).toHaveCount(3);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export notes' }).click()]);
  copyFileSync(await download.path(), `${ARTIFACTS}/notes.md`);
  const notes = readFileSync(`${ARTIFACTS}/notes.md`, 'utf8');
  expect(notes).toContain(`> ${ESSAY[0]![1]}\n> (Reef essay, p. 1)`);
  expect(notes).toContain('Bleaching and low grazing seem linked.\n\nLinked to: “Coral reefs occupy less than one percent of…”');

  // Everything is still there after a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Bleaching and low grazing seem linked.');
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Reef essay.*2 PDFs · 3 cards/ })).toBeVisible();
});

test('a phone shows one side at a time and excerpts a touch selection', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);

  // A two-finger spread zooms the page, not the app.
  const scale = page.getByTitle('Fit to width');
  const before = parseInt((await scale.textContent())!);
  const cdp = await context.newCDPSession(page);
  for (let i = 0; i <= 6; i++) {
    const d = 40 + i * 20;
    await cdp.send('Input.dispatchTouchEvent', {
      type: i ? 'touchMove' : 'touchStart',
      touchPoints: [
        { x: 195 - d, y: 500 },
        { x: 195 + d, y: 500 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => parseInt((await scale.textContent())!)).toBeGreaterThan(before * 2);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  await scale.tap();
  await expect.poll(async () => parseInt((await scale.textContent())!)).toBe(before);

  const span = page.locator('.textLayer span', { hasText: 'Coral reefs occupy' }).first();
  await span.tap();
  // A long press is not something Playwright can do; the selection it makes is set directly.
  await span.evaluate((el) => getSelection()!.selectAllChildren(el));
  const toolbar = page.getByRole('toolbar', { name: 'Selection' });
  await expect(toolbar).toBeInViewport({ ratio: 1 });
  expect((await toolbar.boundingBox())!.y).toBeGreaterThan((await span.boundingBox())!.y);
  await shot(page, 'phone-selection');
  await toolbar.getByRole('button', { name: 'Excerpt' }).tap();

  await expect(page.getByRole('tab', { name: 'Canvas (1)' })).toBeVisible();
  // The canvas is behind the document until asked for.
  await expect(card(page, 'Coral reefs')).not.toBeInViewport();
  const centre = () =>
    page.evaluate(() =>
      document
        .elementFromPoint(innerWidth / 2, innerHeight / 2)
        ?.closest('section')
        ?.getAttribute('aria-label'),
    );
  expect(await centre()).toBe('Documents');
  await page.getByRole('tab', { name: 'Canvas (1)' }).tap();
  await expect(card(page, 'Coral reefs')).toBeInViewport();
  expect(await centre()).toBe('Canvas');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    // Colours ease over 150 ms.
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, `phone-canvas-${scheme}`);
  }

  // Showing the source switches back to the document.
  await card(page, 'Coral reefs')
    .getByRole('button', { name: /Reef essay/ })
    .tap();
  expect(await centre()).toBe('Documents');
  await context.close();
});

test('files that are not PDFs are refused with a reason', async ({ page }) => {
  await openProject(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add PDF' }).click()]);
  await chooser.setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a pdf') });
  await expect(page.getByRole('alert')).toHaveText(/photo\.jpg is not a PDF\./);
  await expect(page.getByRole('tab')).toHaveCount(2);
});
