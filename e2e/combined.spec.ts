import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ARTIFACTS, openProject, readPdf, select, shot } from './helpers';

const selection = (page: Page) => page.getByRole('toolbar', { name: 'Selection' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export documents as one PDF' });

async function exportCombined(page: Page, file: string, prepare: () => Promise<void>) {
  await page.getByRole('button', { name: 'Export notes' }).click();
  await page.getByRole('menuitem', { name: 'Documents as one PDF…' }).click();
  await prepare();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog(page).getByRole('button', { name: 'Export PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('Reef essay (combined).pdf');
  await download.saveAs(`${ARTIFACTS}/${file}`);
  await expect(dialog(page)).toHaveCount(0);
  return readPdf(`${ARTIFACTS}/${file}`).promise;
}

const pageOf = async (pdf: PDFDocumentProxy, dest: unknown) => (await pdf.getPageIndex((dest as [{ num: number; gen: number }])[0])) + 1;
const textOf = async (pdf: PDFDocumentProxy, n: number) => (await (await pdf.getPage(n)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');

test('documents exported as one PDF, in the order chosen, with their annotations, an outline and the canvas as the last page', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProject(page);

  // The essay: an excerpt, and a passage on the first page linked to one on the third.
  await select(page, 'Coral reefs occupy');
  await selection(page).getByRole('button', { name: 'Excerpt' }).click();
  await select(page, 'The ocean covers');
  await selection(page).getByRole('button', { name: 'Link', exact: true }).click();
  await page.locator('.page[data-page-number="3"]').scrollIntoViewIfNeeded();
  await select(page, 'Kelp forests grow');
  await expect(page.locator('.page:not([data-copy]) .link-mark')).toHaveCount(2);
  // The notes: a bookmark on their second page.
  await page.getByRole('tab', { name: 'Survey notes' }).click();
  await expect(page.locator('.textLayer span', { hasText: 'Field notes' }).first()).toBeVisible();
  await page.locator('.page[data-page-number="2"]').scrollIntoViewIfNeeded();
  await page
    .locator('.doc-scroll')
    .first()
    .evaluate((el) => (el.scrollTop = (el.querySelector('.page[data-page-number="2"]') as HTMLElement).offsetTop + 20));
  await page.getByRole('button', { name: 'Bookmark this place' }).click();
  await select(page, 'Parrotfish numbers');
  await selection(page).getByRole('button', { name: 'Highlight green' }).click();

  const pdf = await exportCombined(page, 'combined.pdf', async () => {
    await expect(dialog(page).getByRole('checkbox')).toHaveCount(3);
    await dialog(page).getByRole('button', { name: 'Move Survey notes up' }).click();
    await expect(dialog(page).getByRole('list', { name: 'Documents to export' }).getByRole('listitem')).toHaveText(['Survey notes', 'Reef essay']);
    await dialog(page)
      .getByRole('checkbox', { name: /Add the canvas/ })
      .check();
    await shot(page, 'combined-dialog');
  });

  await test.step('Pages: the notes, then the essay, then the canvas', async () => {
    expect(pdf.numPages).toBe(2 + 3 + 1);
    expect(await textOf(pdf, 1)).toContain('Field notes from the reef survey');
    expect(await textOf(pdf, 3)).toContain('The ocean covers');
    // The canvas is the picture the Export menu makes of it.
    const canvas = await (await pdf.getPage(6)).getOperatorList();
    expect(canvas.fnArray).toContain(OPS.paintImageXObject);
  });

  await test.step('An outline entry for each document, holding its bookmarks', async () => {
    const outline = (await pdf.getOutline())!;
    expect(outline.map((o) => o.title)).toEqual(['Survey notes', 'Reef essay', 'Canvas 1']);
    expect(await Promise.all(outline.map((o) => pageOf(pdf, o.dest)))).toEqual([1, 3, 6]);
    expect(outline[0]!.items.map((o) => o.title)).toEqual([expect.stringMatching(/^Parrotfish numbers/)]);
    expect(await pageOf(pdf, outline[0]!.items[0]!.dest)).toBe(2);
    writeFileSync(`${ARTIFACTS}/combined-outline.json`, JSON.stringify(outline, null, 2));
  });

  await test.step('Annotations on the right pages, with links going within the combined file', async () => {
    const annots = async (n: number) => (await pdf.getPage(n)).getAnnotations();
    expect((await annots(2)).filter((a) => a.subtype === 'Highlight')).toHaveLength(1);
    const first = await annots(3);
    expect(first.filter((a) => a.subtype === 'Highlight')).toHaveLength(2);
    const [link] = first.filter((a) => a.subtype === 'Link');
    expect(await pageOf(pdf, link!.dest)).toBe(5);
    const [back] = (await annots(5)).filter((a) => a.subtype === 'Link');
    expect(await pageOf(pdf, back!.dest)).toBe(3);
  });

  await test.step('Only the documents chosen', async () => {
    const one = await exportCombined(page, 'combined-one.pdf', async () => {
      await dialog(page).getByRole('checkbox', { name: 'Survey notes' }).uncheck();
    });
    expect(one.numPages).toBe(3);
    expect((await one.getOutline())!.map((o) => o.title)).toEqual(['Reef essay']);
  });
});
