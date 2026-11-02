import { expect, test, type Page } from '@playwright/test';
import { openWith, PHONE, shot } from './helpers';
import { makePdf } from './pdfs';

/** A short contract defining its terms in the ways contracts do, and using them on the next page. */
const contract = () =>
  makePdf([
    [
      'This Services Agreement (the "Agreement") is made between Coral Holdings Ltd (the "Company") and Reef Analytics LLC (hereinafter referred to as the "Contractor").',
      '“Services” means the reef survey and the analysis work described in Schedule A.',
      '"Effective Date" shall mean the first day of March 2026.',
    ],
    ['The Contractor shall perform the Services for the Company from the Effective Date.', 'This Agreement may be ended by either party with thirty days written notice.'],
  ]);

const definition = (page: Page) => page.getByRole('dialog', { name: /^Definition of / });
const mark = (page: Page, term: string, pageNo: number) => page.locator(`.pdfViewer > .page[data-page-number="${pageNo}"] .term-mark[data-term="${term}"]`).first();

/** Brings a term's mark to the middle of the pane, clear of the tabs that float over the pane's top. */
const reveal = (page: Page, term: string, pageNo: number) => mark(page, term, pageNo).evaluate((m) => m.scrollIntoView({ block: 'center' }));

async function hover(page: Page, term: string, pageNo: number) {
  await reveal(page, term, pageNo);
  const box = (await mark(page, term, pageNo).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 3, { steps: 4 });
}

test('a defined term shows its definition when pointed at, goes to it, and the lookup turns off and on', async ({ page }) => {
  await openWith(page, [{ name: 'Services agreement.pdf', buffer: await contract() }]);
  const panel = page.getByRole('button', { name: 'Squeeze around highlights or words' });
  const toggle = page.getByRole('switch', { name: 'Defined terms' });
  await panel.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'terms-panel');
  await panel.click();

  await test.step('Later uses are underlined; the term where it is defined is not', async () => {
    await page.locator('.pdfViewer > .page[data-page-number="2"]').scrollIntoViewIfNeeded();
    await expect(mark(page, 'Services', 2)).toBeAttached();
    await expect(mark(page, 'Effective Date', 2)).toBeAttached();
    await expect(mark(page, 'Contractor', 2)).toBeAttached();
    await expect(mark(page, 'Agreement', 2)).toBeAttached();
    // "Services" in its own definition sits in quotes, so only the title's use is marked on page 1.
    await expect(page.locator('.pdfViewer > .page[data-page-number="1"] .term-mark[data-term="Services"]')).toHaveCount(1);
  });

  await test.step('Pointing at a term shows the sentence that defines it', async () => {
    await hover(page, 'Services', 2);
    await expect(definition(page)).toHaveAccessibleName('Definition of Services');
    await expect(definition(page)).toContainText('“Services” means the reef survey and the analysis work described in Schedule A.');
    await expect(definition(page)).toContainText('Defined on p. 1');
    for (const scheme of ['light', 'dark'] as const) {
      await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
      await page.waitForTimeout(300);
      await shot(page, `terms-${scheme}`);
    }
    await page.evaluate(() => delete document.documentElement.dataset.theme);

    await hover(page, 'Effective Date', 2);
    await expect(definition(page)).toHaveAccessibleName('Definition of Effective Date');
    await expect(definition(page)).toContainText('"Effective Date" shall mean the first day of March 2026.');
    await hover(page, 'Contractor', 2);
    await expect(definition(page)).toContainText('(hereinafter referred to as the "Contractor")');
  });

  await test.step('Go to the definition', async () => {
    const box = (await definition(page).boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 3 });
    await definition(page).getByRole('button', { name: 'Go to the definition' }).click();
    await expect(definition(page)).toHaveCount(0);
    await expect(page.locator('.page-no')).toHaveText('Page 1 / 2');
    await expect(page.locator('.pdfViewer > .page[data-page-number="1"] .textLayer .highlight').first()).toBeInViewport();
  });

  await test.step('Turned off, terms are not marked and nothing shows; it stays off after a reload', async () => {
    await panel.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('.term-mark')).toHaveCount(0);
    const span = page.locator('.pdfViewer > .page[data-page-number="2"] .textLayer span', { hasText: 'perform the Services' }).first();
    await span.scrollIntoViewIfNeeded();
    await span.hover();
    await page.waitForTimeout(600);
    await expect(definition(page)).toHaveCount(0);
    await page.reload();
    await panel.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await page.keyboard.press('Escape');
    await page.locator('.pdfViewer > .page[data-page-number="2"]').scrollIntoViewIfNeeded();
    await expect(mark(page, 'Services', 2)).toBeAttached();
  });
});

test('on a phone, tapping a defined term shows its definition on the screen', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openWith(page, [{ name: 'Services agreement.pdf', buffer: await contract() }]);
  await page.locator('.pdfViewer > .page[data-page-number="2"]').scrollIntoViewIfNeeded();
  await expect(mark(page, 'Services', 2)).toBeAttached();
  await reveal(page, 'Services', 2);
  const box = (await mark(page, 'Services', 2).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 - 2);
  await expect(definition(page)).toContainText('means the reef survey');
  const card = (await definition(page).boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(390);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await page.waitForTimeout(300);
    await shot(page, `terms-phone-${scheme}`);
  }
  await context.close();
});
