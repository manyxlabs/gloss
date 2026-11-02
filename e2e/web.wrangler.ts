// Run with playwright.import.config.ts, which serves the app from the Worker and a local site to fetch.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { card, select, shot, STANDARD_FONTS } from './helpers';

const port = Number(process.env.PORT ?? 4340);
const site = `http://localhost:${port + 1}`;
const guarded = `http://localhost:${port + 2}`;

const span = (page: Page, text: string) => page.locator('.textLayer span', { hasText: text }).first();

async function addFromWeb(page: Page, url: string) {
  await page.getByRole('button', { name: 'Add from the web' }).click();
  await page.getByRole('textbox', { name: 'Web page address' }).fill(url);
  await page.getByRole('button', { name: 'Add page' }).click();
}

test('a web page becomes a document with its title, source and article', async ({ page }) => {
  await page.goto('/');
  // Through a redirect, which the Worker checks again before following.
  await addFromWeb(page, `${site}/moved`);
  await expect(page.locator('.doc-status')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Tide pools at dawn');
  await expect(page.getByRole('tab', { name: 'Tide pools at dawn' })).toHaveAttribute('title', `Tide pools at dawn\nConverted from ${site}/article`);

  const text = (await page.locator('.textLayer').allTextContents()).join(' ');
  for (const words of ['Tide pools at dawn', 'Ada Marsh', `${site}/article`, 'Saved on', 'What lives there', 'Sea stars that pry open mussels', 'A pool on the north shore.'])
    expect(text).toContain(words);
  // Navigation, scripts and the footer are not part of the article.
  for (const words of ['Home', 'About', 'Copyright', 'tracking']) expect(text).not.toContain(words);
  expect((await span(page, 'Tide pools at dawn').boundingBox())!.height).toBeGreaterThan((await span(page, 'Anemones close up').boundingBox())!.height * 1.6);

  await select(page, 'Anemones close up', 'busy place at low tide.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Anemones close up').locator('blockquote')).toHaveText(
    'Anemones close up to hold water in, while hermit crabs trade shells as they grow, which makes the pools a busy place at low tide.',
  );
  await shot(page, 'import-web');

  // The article's picture is in the PDF.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(await download.path())), standardFontDataUrl: STANDARD_FONTS }).promise;
  expect((await (await pdf.getPage(1)).getOperatorList()).fnArray).toContain(OPS.paintImageXObject);

  // What is not a web page, and a redirect to a cloud metadata address, are refused with a reason.
  await addFromWeb(page, `${site}/data.json`);
  await expect(page.getByRole('alert')).toContainText(`${site}/data.json could not be added. That address is not a web page.`);
  await addFromWeb(page, `${site}/to-metadata`);
  await expect(page.getByRole('alert')).toContainText('Addresses given as IP numbers are not fetched.');
  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab')).toHaveCount(1);
});

test('the Worker refuses private, local and oversized addresses', async ({ page, request }) => {
  const refused = async (base: string, url: string, status: number, error: RegExp) => {
    const res = await request.get(`${base}/api/page?url=${encodeURIComponent(url)}`);
    expect(res.status(), url).toBe(status);
    expect((await res.json()).error, url).toMatch(error);
  };
  for (const url of ['http://localhost:8080/', 'http://printer.local/', 'http://intranet/']) await refused(guarded, url, 400, /private network/);
  for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/'])
    await refused(guarded, url, 400, /IP numbers/);
  await refused(guarded, 'file:///etc/passwd', 400, /Only http and https/);
  await refused(guarded, 'http://user:secret@example.com/', 400, /user name or password/);
  await refused(guarded, 'not a url', 400, /not a web address/);
  await refused('', `${site}/huge`, 413, /too large/);

  // And the app shows the reason.
  await page.goto(guarded);
  await addFromWeb(page, `${site}/article`);
  await expect(page.getByRole('alert')).toContainText('Addresses on a private network are not fetched.');
});
