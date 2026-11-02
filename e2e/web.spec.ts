// The web page fetch is the Worker's (see web.wrangler.ts); here its answers are stood in for, to follow what the app does with them.
import { copyFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { ARTIFACTS, readPdf, shot } from './helpers';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const answer = (route: Route, html: string) => route.fulfill({ json: { url: new URL(route.request().url()).searchParams.get('url'), title: 'Tide pools', html } });

async function addFromWeb(page: Page, address: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add from the web' }).click();
  await page.getByRole('textbox', { name: 'Web page address' }).fill(address);
  await page.getByRole('button', { name: 'Add page' }).click();
}

test('an address without https:// is taken as one, and a gallery keeps its pictures without bullets', async ({ page }) => {
  let asked = '';
  await page.route('**/api/page?*', (route) => {
    asked = new URL(route.request().url()).searchParams.get('url')!;
    return answer(
      route,
      `<p>Pools at low tide.</p><ul><li><img src="${PIXEL}"></li><li><figure><img src="${PIXEL}"><figcaption>The north pool</figcaption></figure></li><li> </li></ul><ul><li>Sea stars</li><li></li></ul>`,
    );
  });
  await addFromWeb(page, 'example.org/pools');
  await expect(page.getByRole('tab', { name: 'Tide pools' })).toBeVisible();
  expect(asked).toBe('https://example.org/pools');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/web-gallery.pdf`;
  copyFileSync(await download.path(), file);
  const doc = await readPdf(file).promise;
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
  expect(text).toContain('The north pool');
  // One bullet, for the one real item; none for the pictures or the empty items.
  expect(text.match(/•/g)).toHaveLength(1);
});

test('adding a long web page shows how far it has got, and Cancel stops it', async ({ page }) => {
  const article = Array.from({ length: 900 }, (_, i) => `<p>Paragraph ${i + 1} about the shore, long enough to wrap onto a second line of the page as articles do.</p>`).join('');
  let release = () => {};
  await page.route('**/api/page?*', async (route) => {
    await new Promise<void>((done) => (release = done));
    await answer(route, article);
  });
  await addFromWeb(page, 'https://example.org/long');
  const status = page.getByRole('dialog', { name: 'Add a web page' }).getByRole('status');
  await expect(status).toHaveText('Fetching the page…');
  await expect(page.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  release();
  await expect(status).toHaveText(/^Converting page \d+…$/);
  await shot(page, 'web-converting');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a web page' })).toBeHidden();
  // Nothing was added, and the start page is ready for another try.
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/#?\/?$/);
  await expect(page.getByRole('button', { name: 'Add from the web' })).toBeEnabled();

  // Cancelled while still fetching, likewise.
  await page.getByRole('button', { name: 'Add from the web' }).click();
  await page.getByRole('textbox', { name: 'Web page address' }).fill('https://example.org/long');
  await page.getByRole('button', { name: 'Add page' }).click();
  await expect(status).toHaveText('Fetching the page…');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Add a web page' })).toBeHidden();
  release();
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/#?\/?$/);
});
