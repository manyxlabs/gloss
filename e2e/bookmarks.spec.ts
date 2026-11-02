import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, openProject, readPdf, shot } from './helpers';

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Contents, pages and highlights' });
const marks = (page: Page) => sidebar(page).getByRole('list', { name: 'Bookmarks' }).getByRole('listitem');
const pageNo = (page: Page) => page.locator('.doc-pane').first().locator('.page-no');

/** Scrolls the main pane so a page's top, a little way down, is at the top of the view. */
const scrollTo = (page: Page, n: number) =>
  page
    .locator('.doc-scroll')
    .first()
    .evaluate((el, n) => {
      el.scrollTop = (el.querySelector(`.page[data-page-number="${n}"]`) as HTMLElement).offsetTop + 30;
    }, n);

async function action(page: Page, name: string, item: string) {
  await sidebar(page)
    .getByRole('button', { name: `Actions for ${name}` })
    .click();
  await page.getByRole('menu', { name }).getByRole('menuitem', { name: item }).click();
}

test('bookmarks are added from the toolbar and with Ctrl+D, named, reordered, deleted, jumped to, kept, undone and exported', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProject(page);
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
  await expect(sidebar(page)).toContainText('No bookmarks yet.');

  await test.step('The toolbar bookmarks the place in view, named after its words, ready to rename', async () => {
    await scrollTo(page, 2);
    await page.getByRole('button', { name: 'Bookmark this place' }).click();
    await expect(page.getByRole('button', { name: 'Bookmarked' })).toBeVisible();
    const name = sidebar(page).getByRole('textbox', { name: 'Bookmark name' });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue(/^Mangrove forests protect/);
    await page.keyboard.type('Mangroves');
    await page.keyboard.press('Enter');
    await expect(marks(page)).toHaveText(['Mangrovesp. 2']);
  });

  await test.step('Ctrl+D bookmarks too, and each lands in page order', async () => {
    await scrollTo(page, 3);
    await page
      .locator('.doc-scroll')
      .first()
      .click({ position: { x: 20, y: 300 } });
    const name = sidebar(page).getByRole('textbox', { name: 'Bookmark name' });
    await page.keyboard.press('Control+d');
    await expect(name).toBeFocused();
    await page.keyboard.press('Enter');
    await scrollTo(page, 1);
    await page.keyboard.press('Control+d');
    await expect(name).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(marks(page)).toHaveText([/^The ocean covers.*p\. 1$/, 'Mangrovesp. 2', /^Kelp forests grow.*p\. 3$/]);
  });

  await test.step('Renamed, moved and deleted from their menus, and moved by dragging', async () => {
    await action(page, (await marks(page).nth(2).locator('.text').textContent())!, 'Rename');
    await page.keyboard.type('Kelp');
    await page.keyboard.press('Enter');
    await action(page, 'Kelp', 'Move up');
    await expect(marks(page)).toHaveText([/^The ocean covers/, 'Kelpp. 3', 'Mangrovesp. 2']);
    await marks(page)
      .nth(0)
      .dragTo(marks(page).nth(2), { targetPosition: { x: 40, y: 24 } });
    await expect(marks(page)).toHaveText(['Kelpp. 3', 'Mangrovesp. 2', /^The ocean covers/]);
    await action(page, (await marks(page).nth(2).locator('.text').textContent())!, 'Delete');
    await expect(marks(page)).toHaveText(['Kelpp. 3', 'Mangrovesp. 2']);
    await page.keyboard.press('Control+z');
    await expect(marks(page)).toHaveCount(3);
    await page.keyboard.press('Control+Shift+z');
    await expect(marks(page)).toHaveCount(2);
    await page.mouse.move(700, 500);
    await shot(page, 'bookmarks-sidebar');
  });

  await test.step('A bookmark goes to its place', async () => {
    await sidebar(page).getByRole('button', { name: /^Kelp/ }).click();
    await expect(pageNo(page)).toContainText('3 / 3');
    await sidebar(page)
      .getByRole('button', { name: /^Mangroves/ })
      .click();
    await expect(pageNo(page)).toContainText('2 / 3');
    const top = await page
      .locator('.doc-scroll')
      .first()
      .evaluate((el) => (el.querySelector('.page[data-page-number="2"]') as HTMLElement).getBoundingClientRect().top - el.getBoundingClientRect().top);
    expect(top).toBeLessThan(0);
  });

  await test.step('Kept, and exported as outline entries of the annotated PDF', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
    await expect(marks(page)).toHaveText(['Kelpp. 3', 'Mangrovesp. 2']);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
    const file = `${ARTIFACTS}/bookmarks-export.pdf`;
    await download.saveAs(file);
    const pdf = await readPdf(file).promise;
    const outline = (await pdf.getOutline())!;
    expect(outline.map((o) => o.title)).toEqual(['Kelp', 'Mangroves']);
    const pages = await Promise.all(outline.map(async (o) => (await pdf.getPageIndex((o.dest as [{ num: number; gen: number }])[0])) + 1));
    expect(pages).toEqual([3, 2]);
    // The place, not just the page: a little below the top of page 2.
    const top = (o: (typeof outline)[number]) => (o.dest as unknown[])[3] as number;
    expect(top(outline[1]!)).toBeLessThan(792);
    expect(top(outline[1]!)).toBeGreaterThan(700);
    writeFileSync(
      `${ARTIFACTS}/bookmarks-outline.json`,
      JSON.stringify(
        outline.map((o) => ({ title: o.title, dest: o.dest })),
        null,
        2,
      ),
    );
  });
});

test('on a phone, the toolbar bookmarks and the sidebar lists them over the page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openProject(page);
  await page.getByRole('button', { name: 'Use dark theme' }).tap();
  await page.getByRole('button', { name: 'Bookmark this place' }).tap();
  await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().tap();
  await expect(marks(page)).toHaveText([/^The ocean covers.*p\. 1$/]);
  const action = sidebar(page).getByRole('button', { name: /^Actions for/ });
  const box = (await action.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  await shot(page, 'bookmarks-phone');
  await context.close();
});
