import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { card, openProject, select, shot } from './helpers';

/** A browser context as one device, recording the frames it sends to the room. */
async function device(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], ...options });
  const page = await context.newPage();
  const sent: Buffer[] = [];
  page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(Buffer.from(f.payload))));
  return { context, page, sent };
}

const screensButton = (page: Page) => page.getByRole('button', { name: /^Screens/ });
const screensDialog = (page: Page) => page.getByRole('dialog', { name: 'Use another screen' });

/** Scrolls the document to its top or its end, where pdf.js then draws a passage's page. */
async function reveal(page: Page, words: string, to: 'top' | 'end') {
  await page
    .locator('.doc-scroll')
    .first()
    .evaluate((el, top) => el.scrollTo({ top: top ? 0 : el.scrollHeight }), to === 'top');
  await page.locator('.textLayer span', { hasText: words }).first().scrollIntoViewIfNeeded();
}

async function showOnly(page: Page, what: string) {
  await screensButton(page).click();
  await screensDialog(page).getByText(what, { exact: true }).click();
  await expect(screensDialog(page).getByRole('radio', { name: what, exact: true })).toBeChecked();
  await screensDialog(page).getByRole('button', { name: 'Done' }).click();
}

/** How much of the window's width the documents and the canvas each take, 0 when hidden. */
const widths = (page: Page) =>
  page.evaluate(() =>
    ['.panes > .docs', '.panes > .canvas'].map((s) => {
      const el = document.querySelector<HTMLElement>(s)!;
      return getComputedStyle(el).clipPath === 'none' ? Math.round(el.getBoundingClientRect().width / innerWidth / 0.05) * 0.05 : 0;
    }),
  );

test('a second screen shows its own part of the project, follows jumps both ways, and its loss gives the rest back', async ({ browser }) => {
  test.setTimeout(180_000);
  const laptop = await device(browser);
  const tablet = await device(browser, { viewport: { width: 1180, height: 820 }, hasTouch: true });
  const a = laptop.page;
  const b = tablet.page;

  await test.step('the laptop makes two excerpts and links another screen', async () => {
    await openProject(a);
    for (const words of ['Coral reefs occupy', 'Kelp forests grow']) {
      await reveal(a, words, words.startsWith('Kelp') ? 'end' : 'top');
      await select(a, words);
      await a.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
      await expect(card(a, words)).toBeVisible();
    }
    await screensButton(a).click();
    await expect(screensDialog(a)).toContainText('so this shares the project');
    await expect(screensDialog(a).getByRole('status')).toHaveText('While no other screen is open, this one shows everything.');
    await shot(a, 'screens-dialog-unlinked');
    await screensDialog(a).getByRole('button', { name: 'Link another screen' }).click();
    await expect(screensDialog(a).getByRole('img', { name: 'QR code of the link' })).toBeVisible();
    // Linking shares the project without asking for a name: the screens are one person.
    await expect(a.getByRole('dialog', { name: 'What should others call you?' })).toHaveCount(0);
    await shot(a, 'screens-dialog-link');
  });
  const link = await screensDialog(a).getByRole('textbox', { name: 'Screen link' }).inputValue();
  expect(link).toMatch(/\/#\/join\/[\w-]{22}\.[\w-]{43}\/screen\/[\w-]{22}$/);
  const group = link.split('/screen/')[1]!;

  await test.step('the tablet opens the link and is linked, not another person', async () => {
    await b.goto(link);
    await expect(b).toHaveURL(/#\/p\/[\w-]+$/);
    await expect(card(b, 'Kelp forests grow')).toBeVisible({ timeout: 15_000 });
    await expect(b.getByRole('dialog', { name: 'What should others call you?' })).toHaveCount(0);
    await expect(screensButton(a)).toHaveAccessibleName('Screens, 1 other linked', { timeout: 15_000 });
    await expect(screensDialog(a).getByRole('status')).toHaveText('1 other screen is linked.');
    await screensDialog(a).getByRole('button', { name: 'Done' }).click();
    await expect(screensButton(b)).toHaveAccessibleName('Screens, 1 other linked');
    // Each other's screen is not a person in the project.
    await expect(a.locator('.peers .avatar')).toHaveCount(1);
    await expect(b.locator('.peers .avatar')).toHaveCount(1);
  });

  await test.step('each screen keeps its own view, and the place it was at', async () => {
    // The document widens and zooms to fit, with the passage last excerpted still in view.
    const kelp = a.locator('.textLayer span', { hasText: 'Kelp forests grow' });
    await expect(kelp).toBeInViewport();
    await showOnly(a, 'Document');
    await expect(kelp).toBeInViewport({ ratio: 0.99 });
    await showOnly(b, 'Canvas');
    expect(await widths(a)).toEqual([1, 0]);
    expect(await widths(b)).toEqual([0, 1]);
    await shot(a, 'screens-laptop-document');
    await shot(b, 'screens-tablet-canvas');
  });

  await test.step('a tap on an excerpt on the canvas screen scrolls the document on the other', async () => {
    const kelp = a.locator('.textLayer span', { hasText: 'Kelp forests grow' });
    await reveal(a, 'The ocean covers', 'top');
    await expect(kelp).not.toBeInViewport();
    await card(b, 'Kelp forests grow')
      .getByRole('button', { name: /Reef essay/ })
      .click();
    await expect(kelp).toBeInViewport({ timeout: 10_000 });
    // The tablet stays on its canvas.
    expect(await widths(b)).toEqual([0, 1]);
    expect(await widths(a)).toEqual([1, 0]);
  });

  await test.step('and Show on canvas in the document brings the card into view on the canvas screen', async () => {
    const coral = card(b, 'Coral reefs occupy');
    // Pans the canvas from empty space right of the cards; a drag starting on the minimap in its corner flings the view
    // hundreds of thousands of pixels away, and the card was then only glimpsed in passing on its way back.
    const flow = (await b.locator('.canvas .flow').boundingBox())!;
    const y = flow.y + flow.height / 2;
    await b.mouse.move(flow.x + flow.width * 0.75, y);
    await b.mouse.down();
    await b.mouse.move(flow.x + 40, y, { steps: 8 });
    await b.mouse.up();
    await expect(coral).not.toBeInViewport();
    await reveal(a, 'Coral reefs occupy', 'top');
    const mark = (await a.locator('.hl[data-id]').first().boundingBox())!;
    await a.mouse.click(mark.x + 20, mark.y + mark.height / 2);
    await a.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Show on canvas' }).click();
    await expect(coral).toBeInViewport({ ratio: 1 });
    await expect(coral).toHaveClass(/selected/);
    await shot(b, 'screens-tablet-followed');
    expect(await widths(a)).toEqual([1, 0]);
  });

  await test.step('a screen showing one pane takes the jumps there', async () => {
    await a.getByRole('button', { name: 'Open side by side' }).click();
    await expect(a.locator('.doc-pane')).toHaveCount(2);
    await showOnly(a, 'Pane 2');
    const pane = a.locator('.doc-pane');
    await expect(pane).toHaveCount(1);
    await expect(pane.getByRole('tab', { name: 'Survey notes' })).toHaveAttribute('aria-selected', 'true');
    await card(b, 'Kelp forests grow')
      .getByRole('button', { name: /Reef essay/ })
      .click();
    await expect(pane.getByRole('tab', { name: 'Reef essay' })).toHaveAttribute('aria-selected', 'true');
    await expect(pane.locator('.textLayer span', { hasText: 'Kelp forests grow' })).toBeInViewport({ timeout: 10_000 });
    await shot(a, 'screens-laptop-one-pane');
    await showOnly(a, 'Document');
    await expect(a.locator('.doc-pane')).toHaveCount(2);
    await expect(a.locator('.doc-pane').nth(1).locator('.textLayer span', { hasText: 'Kelp forests grow' })).toBeInViewport({ ratio: 0.99 });
    await a.getByRole('button', { name: 'Close this pane' }).click();
    await expect(a.locator('.doc-pane')).toHaveCount(1);
  });

  await test.step('a second window on the laptop is a screen too, through the same link', async () => {
    await screensButton(a).click();
    const [win] = await Promise.all([laptop.context.waitForEvent('page'), screensDialog(a).getByRole('button', { name: 'Open a window here' }).click()]);
    await screensDialog(a).getByRole('button', { name: 'Done' }).click();
    await expect(card(win, 'Coral reefs occupy')).toBeVisible({ timeout: 15_000 });
    await expect(screensButton(a)).toHaveAccessibleName('Screens, 2 other linked', { timeout: 15_000 });
    // Its own view: everything, not the laptop window's choice.
    await expect(win.locator('.panes')).not.toHaveClass(/alone/);
    const coral = a.locator('.textLayer span', { hasText: 'Coral reefs occupy' });
    await reveal(a, 'Kelp forests grow', 'end');
    await expect(coral).not.toBeInViewport();
    await card(win, 'Coral reefs occupy')
      .getByRole('button', { name: /Reef essay/ })
      .click();
    await expect(coral).toBeInViewport({ timeout: 10_000 });
    await win.close();
    await expect(screensButton(a)).toHaveAccessibleName('Screens, 1 other linked', { timeout: 15_000 });
  });

  await test.step('a screen that loses its connection shows everything until it is back', async () => {
    const coral = a.locator('.textLayer span', { hasText: 'Coral reefs occupy' });
    await expect(coral).toBeInViewport();
    await tablet.context.setOffline(true);
    await expect(screensButton(b)).toHaveAccessibleName('Screens');
    expect(await widths(b)).toEqual([0.5, 0.5]);
    await expect(screensButton(a)).toHaveAccessibleName('Screens', { timeout: 15_000 });
    expect(await widths(a)).toEqual([0.5, 0.5]);
    await expect(coral).toBeInViewport({ ratio: 0.99 });
    await tablet.context.setOffline(false);
    await expect(screensButton(a)).toHaveAccessibleName('Screens, 1 other linked', { timeout: 30_000 });
    await expect.poll(() => widths(b)).toEqual([0, 1]);
    await expect.poll(() => widths(a)).toEqual([1, 0]);
    await expect(coral).toBeInViewport({ ratio: 0.99 });
  });

  await test.step('a screen closed for good gives the laptop everything back', async () => {
    await tablet.context.close();
    await expect(screensButton(a)).toHaveAccessibleName('Screens', { timeout: 15_000 });
    expect(await widths(a)).toEqual([0.5, 0.5]);
    await screensButton(a).click();
    await expect(screensDialog(a).getByRole('status')).toHaveText('While no other screen is open, this one shows everything.');
    // The choice is kept for when a screen is linked again.
    await expect(screensDialog(a).getByRole('radio', { name: 'Document', exact: true })).toBeChecked();
    await shot(a, 'screens-laptop-alone');
    await a.getByRole('button', { name: 'Done' }).click();
  });

  // The screens' group and where they jumped are encrypted like the rest.
  const ids = await a.locator('.hl[data-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id!));
  for (const secret of [group, ...ids]) expect(laptop.sent.some((f) => f.includes(secret))).toBe(false);
  expect(laptop.sent.length).toBeGreaterThan(0);
  await laptop.context.close();
});

test('the Screens dialog fits a phone and a tablet, in light and dark', async ({ browser }) => {
  const phone = await device(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = phone.page;
  await openProject(p);
  // A phone's header has no room for the Screens button; the Share dialog leads to it.
  await expect(screensButton(p)).toBeHidden();
  await p.getByRole('button', { name: 'Share' }).click();
  await shot(p, 'screens-share-entry-phone');
  await p.getByRole('dialog', { name: 'Share this project' }).getByRole('button', { name: 'use another screen' }).click();
  await screensDialog(p).getByRole('button', { name: 'Link another screen' }).click();
  await expect(screensDialog(p).getByRole('img', { name: 'QR code of the link' })).toBeVisible();
  const fits = async (name: string) => {
    const box = (await screensDialog(p).boundingBox())!;
    const width = p.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 16);
    expect(await screensDialog(p).evaluate((d) => d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // A theme change fades its colours in.
    await p.evaluate(() => Promise.all(document.getAnimations().flatMap((a) => (a.effect?.getComputedTiming().endTime === Infinity ? [] : [a.finished]))));
    await shot(p, name);
  };
  await fits('screens-phone-light');
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.evaluate(() => document.documentElement.classList.add('dark'));
  await fits('screens-phone-dark');
  await p.setViewportSize({ width: 820, height: 1180 });
  await fits('screens-tablet-dark');
  await p.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await fits('screens-tablet-light');
  await p.setViewportSize({ width: 1400, height: 860 });
  await p.evaluate(() => document.documentElement.classList.add('dark'));
  await fits('screens-desktop-dark');
  await phone.context.close();
});
