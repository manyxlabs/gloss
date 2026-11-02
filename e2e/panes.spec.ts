import { expect, test, type Page } from '@playwright/test';
import { card, openProject, pdf, select, shot } from './helpers';

const GUIDE = [
  ['A field guide to reef fish, with notes on parrotfish, wrasse and the grazers that keep algae down.'],
  ['Parrotfish sleep in a bubble of mucus that hides their scent from moray eels.'],
];
const panes = (page: Page) => page.locator('.doc-pane');
const pane = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const tabsOf = (page: Page, name: string) => pane(page, name).getByRole('tablist', { name: 'Open documents' });
const selectedTab = (page: Page, name: string) => tabsOf(page, name).getByRole('tab', { selected: true });
const flashing = (page: Page, name: string) => pane(page, name).locator('.page:not([data-copy]) .hl.flash');

test('three documents side by side on a wide screen: dividers, jumps to the pane showing a document, and links across panes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openProject(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add file' }).click()]);
  await chooser.setFiles(await pdf('Field guide.pdf', GUIDE));
  await expect(selectedTab(page, 'Documents')).toHaveText('Field guide');
  await tabsOf(page, 'Documents').getByRole('tab', { name: 'Reef essay' }).click();

  await test.step('Two panes, then a third, each showing a document the others do not', async () => {
    await page.getByRole('button', { name: 'Open side by side' }).click();
    await expect(page.getByRole('button', { name: 'Open side by side' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open a third pane' }).click();
    await expect(panes(page)).toHaveCount(3);
    await expect(selectedTab(page, 'Documents')).toHaveText('Reef essay');
    await expect(selectedTab(page, 'Second document')).toHaveText('Survey notes');
    await expect(selectedTab(page, 'Third document')).toHaveText('Field guide');
    await expect(page.getByRole('button', { name: 'Open a third pane' })).toHaveCount(0);
    // The documents take two thirds of the screen, shared evenly.
    const widths = await panes(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of widths) expect(Math.abs(w - widths[0]!)).toBeLessThan(4);
    expect(widths[0]! * 3).toBeGreaterThan(1000);
    for (const name of ['Documents', 'Second document', 'Third document']) await expect(pane(page, name).locator('.textLayer span').first()).toBeVisible();
    await shot(page, 'panes-three');
  });

  await test.step('A divider between two panes moves the space between them only, and is kept', async () => {
    const divider = page.getByRole('separator', { name: 'Resize pane 2' });
    const at = (await divider.boundingBox())!;
    const [first, second, third] = await panes(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    await page.mouse.move(at.x + 2, at.y + 200);
    await page.mouse.down();
    await page.mouse.move(at.x + 82, at.y + 200, { steps: 5 });
    await page.mouse.up();
    const after = await panes(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(Math.abs(after[0]! - first!)).toBeLessThan(2);
    expect(after[1]! - second!).toBeGreaterThan(70);
    expect(third! - after[2]!).toBeGreaterThan(70);
    await page.reload();
    await expect(panes(page)).toHaveCount(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gloss:pane-sizes')!)['3'].length)).toBe(3);
    await page.getByRole('button', { name: 'Open side by side' }).click();
    await page.getByRole('button', { name: 'Open a third pane' }).click();
    const kept = await panes(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(kept[1]! - kept[2]!).toBeGreaterThan(140);
  });

  await test.step('Showing an excerpt’s source jumps in the pane that shows its document', async () => {
    await select(page, 'Parrotfish sleep in a bubble');
    await pane(page, 'Third document').getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
    await card(page, 'Parrotfish sleep')
      .getByRole('button', { name: /Field guide · p\. 2/ })
      .click();
    await expect(flashing(page, 'Third document')).toBeVisible();
    await expect(selectedTab(page, 'Documents')).toHaveText('Reef essay');
    await expect(selectedTab(page, 'Second document')).toHaveText('Survey notes');
  });

  await test.step('A link’s other end opens in the pane showing it, so both are in view', async () => {
    await select(page, 'Coral reefs occupy');
    await pane(page, 'Documents').getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Link' }).click();
    await select(page, 'A field guide to reef fish');
    await expect(page.locator('.page:not([data-copy]) .link-mark')).toHaveCount(2);
    await pane(page, 'Documents').locator('.page:not([data-copy]) .link-mark').click();
    await expect(flashing(page, 'Third document')).toBeVisible();
    await expect(selectedTab(page, 'Documents')).toHaveText('Reef essay');
    // From the third pane, the other end shows in the first.
    await page.keyboard.press('Escape');
    await pane(page, 'Third document').locator('.page:not([data-copy]) .link-mark').click();
    await expect(flashing(page, 'Documents')).toBeVisible();
    await expect(selectedTab(page, 'Third document')).toHaveText('Field guide');
    await shot(page, 'panes-link');
  });

  await test.step('Narrower, the third pane waits; closed, the panes to its right move left', async () => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(panes(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Open a third pane' })).toHaveCount(0);
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(panes(page)).toHaveCount(3);
    await pane(page, 'Second document').getByRole('button', { name: 'Close this pane' }).click();
    await expect(panes(page)).toHaveCount(2);
    await expect(selectedTab(page, 'Second document')).toHaveText('Field guide');
  });

  await test.step('On a phone, one pane as before', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(pane(page, 'Second document')).toBeHidden();
    await expect(pane(page, 'Documents')).toBeVisible();
    await shot(page, 'panes-phone');
  });
});
