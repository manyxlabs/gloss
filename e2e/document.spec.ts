import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, PDFHexString, PDFName, PDFNull, rgb, StandardFonts, type PDFRef } from 'pdf-lib';
import { ARTIFACTS, card, openProject, readPdf, select, shot } from './helpers';
import { encryptedPdf, makePdf } from './pdfs';

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

/** Starts a project from these PDFs, as a reader opening them from the start page would. */
async function openWith(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open PDFs' }).click()]);
  await chooser.setFiles(files.map((f) => ({ ...f, mimeType: 'application/pdf' })));
  await expect(page.locator('.textLayer span').first()).toBeVisible();
}

type Entry = { title: string; page: number; children?: Entry[] };

/** A report whose pages each open with a heading, with a table of contents (an /Outlines tree) pointing at them. */
async function reportWithContents(pageCount: number, contents: Entry[]) {
  const doc = await PDFDocument.load(
    await makePdf(Array.from({ length: pageCount }, (_, i) => [`Section ${i + 1} heading`, `The body of section ${i + 1} describes the reef in some detail.`])),
  );
  const ctx = doc.context;
  const level = (entries: Entry[], parent: PDFRef) => {
    const refs = entries.map(() => ctx.nextRef());
    entries.forEach((e, i) => {
      const kids = e.children?.length ? level(e.children, refs[i]!) : null;
      ctx.assign(
        refs[i]!,
        ctx.obj({
          Title: PDFHexString.fromText(e.title),
          Parent: parent,
          Dest: [doc.getPage(e.page - 1).ref, PDFName.of('XYZ'), PDFNull, 792, PDFNull],
          ...(i > 0 ? { Prev: refs[i - 1] } : {}),
          ...(i < entries.length - 1 ? { Next: refs[i + 1] } : {}),
          ...(kids ? { First: kids[0], Last: kids.at(-1), Count: kids.length } : {}),
        }),
      );
    });
    return refs;
  };
  const root = ctx.nextRef();
  const top = level(contents, root);
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: top[0], Last: top.at(-1), Count: top.length }));
  doc.catalog.set(PDFName.of('Outlines'), root);
  return Buffer.from(await doc.save());
}

const pageNo = (page: Page, pane = 0) => page.locator('.doc-pane').nth(pane).locator('.page-no');
const sidebarToggle = (page: Page, pane = 0) => page.locator('.doc-pane').nth(pane).getByRole('button', { name: 'Contents, pages and highlights' });

test('the sidebar lists the contents, page thumbnails and highlights, and each jumps to its place', async ({ page }) => {
  const report = await reportWithContents(12, [
    { title: 'Introduction', page: 1 },
    { title: 'Methods', page: 4, children: [{ title: 'Sampling', page: 5 }] },
    { title: 'Results', page: 9 },
  ]);
  await openWith(page, [{ name: 'Reef report.pdf', buffer: report }]);
  await select(page, 'The body of section 1');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight green' }).click();

  await sidebarToggle(page).click();
  const sidebar = page.getByRole('complementary', { name: 'Contents, pages and highlights' });
  const contents = sidebar.getByRole('navigation', { name: 'Table of contents' });
  await expect(contents.getByRole('button')).toHaveText(['Introduction', 'Methods', 'Sampling', 'Results']);
  // Nested under its parent.
  await expect(contents.locator('li li')).toHaveText('Sampling');
  await expect(page.locator('.doc-pane')).toHaveClass(/sidebar-beside/);

  // Thumbnails are drawn only once they come near view, with the current page marked.
  await sidebar.getByRole('tab', { name: 'Pages' }).click();
  await expect(sidebar.locator('[aria-current="page"]')).toHaveAccessibleName('Page 1');
  await expect.poll(() => sidebar.locator('.thumb img').count()).toBeGreaterThan(2);
  // Given time to draw them all, it still has not drawn the pages far out of view.
  await page.waitForTimeout(800);
  expect(await sidebar.locator('.thumb img').count()).toBeLessThan(12);
  await expect(sidebar.getByRole('button', { name: 'Page 12' }).locator('img')).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Page 12' }).scrollIntoViewIfNeeded();
  await expect(sidebar.getByRole('button', { name: 'Page 12' }).locator('img')).toHaveCount(1);

  await sidebar.getByRole('tab', { name: 'Contents' }).click();
  await contents.getByRole('button', { name: 'Sampling' }).click();
  await expect(pageNo(page)).toHaveText('Page 5 / 12');
  await expect(page.locator('.textLayer span', { hasText: 'Section 5 heading' })).toBeInViewport();
  await contents.getByRole('button', { name: 'Results' }).click();
  await expect(pageNo(page)).toHaveText('Page 9 / 12');
  await shot(page, 'sidebar-contents');

  // The current page's thumbnail is kept in view.
  await sidebar.getByRole('tab', { name: 'Pages' }).click();
  const current = sidebar.locator('[aria-current="page"]');
  await expect(current).toHaveAccessibleName('Page 9');
  await expect(current).toBeInViewport();
  await expect(current.locator('img')).toHaveJSProperty('complete', true);
  expect(await current.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
  await shot(page, 'sidebar-pages');
  await sidebar.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(pageNo(page)).toHaveText('Page 2 / 12');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveAccessibleName('Page 2');

  await sidebar.getByRole('tab', { name: 'Highlights' }).click();
  const mark = sidebar.getByRole('button', { name: /The body of section 1/ });
  await expect(mark).toContainText('p. 1');
  await mark.click();
  await expect(page.locator('.hl.flash').first()).toBeInViewport();
  await expect(pageNo(page)).toHaveText('Page 1 / 12');
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await page.waitForTimeout(300);
    await shot(page, `sidebar-highlights-${scheme}`);
  }

  // A second pane has its own sidebar, which moves only that pane.
  await page.getByRole('button', { name: 'Open side by side' }).click();
  await expect(page.locator('.doc-pane')).toHaveCount(2);
  await expect(page.locator('.doc-pane').nth(1).locator('.textLayer span').first()).toBeVisible();
  // Each half is too narrow to give a sidebar room beside the page, so it covers the page instead.
  await sidebarToggle(page, 1).click();
  await expect(page.locator('.doc-pane').nth(1)).toHaveClass(/sidebar-over/);
  const second = page.locator('.doc-pane').nth(1).getByRole('complementary');
  await second.getByRole('navigation').getByRole('button', { name: 'Methods' }).click();
  await expect(pageNo(page, 1)).toHaveText('Page 4 / 12');
  await expect(second).toHaveCount(0);
  await expect(pageNo(page, 0)).toHaveText('Page 1 / 12');
  await shot(page, 'sidebar-two-panes');
});

test('on a phone the sidebar covers the page and closes after a jump', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openWith(page, [{ name: 'Reef report.pdf', buffer: await reportWithContents(6, [{ title: 'Introduction', page: 1 }]) }]);
  await sidebarToggle(page).tap();
  const sidebar = page.getByRole('complementary', { name: 'Contents, pages and highlights' });
  await expect(page.locator('.doc-pane')).toHaveClass(/sidebar-over/);
  await sidebar.getByRole('tab', { name: 'Pages' }).tap();
  await expect(sidebar.locator('.thumb img').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await shot(page, 'phone-sidebar');
  await sidebar.getByRole('button', { name: 'Page 4' }).tap();
  await expect(sidebar).toHaveCount(0);
  await expect(page.locator('.page-no')).toHaveText('Page 4 / 6');
  await context.close();
});

test('a password protected PDF asks for its password, refuses a wrong one and opens with the right one', async ({ page }) => {
  await openProject(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add PDF' }).click()]);
  await chooser.setFiles({ name: 'Locked survey.pdf', mimeType: 'application/pdf', buffer: await encryptedPdf('coral') });

  const dialog = page.getByRole('dialog', { name: 'Password needed' });
  await expect(dialog).toContainText('“Locked survey.pdf” is protected.');
  await dialog.getByLabel('Password').fill('kelp');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toContainText('That password is not right.');
  await expect(dialog.getByLabel('Password')).toBeFocused();
  await shot(page, 'password-wrong');
  await dialog.getByLabel('Password').fill('coral');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Locked survey' })).toHaveAttribute('aria-selected', 'true');

  await select(page, 'Confidential findings');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Confidential findings')).toBeVisible();

  // The password is kept with the project in this browser, so it opens again without asking.
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('tab', { name: 'Locked survey' }).click();
  await expect(page.locator('.textLayer span', { hasText: 'Confidential findings' }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // pdf-lib cannot write into an encrypted file, and says so rather than producing a broken one.
  await page.getByRole('button', { name: 'Export PDF with highlights' }).click();
  await expect(page.getByRole('alert')).toContainText('password protected');

  // Cancelling leaves the project as it was.
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add PDF' }).click()]);
  await again.setFiles({ name: 'Other.pdf', mimeType: 'application/pdf', buffer: await encryptedPdf('reef') });
  await page.getByRole('dialog', { name: 'Password needed' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab')).toHaveCount(3);
});

/** A page with lines of text, a green chart drawn as a filled box, and its caption, at known places in PDF points. */
const FIGURE = { x: 180, y: 330, width: 240, height: 150 };
/** The box a reader draws around the figure and its caption, in PDF points from the bottom left. */
const SNIP = { left: 170, bottom: 290, right: 430, top: 490 };
async function reportWithFigure() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const page = pdf.addPage([612, 792]);
  const line = (text: string, y: number, x = 66) => page.drawText(text, { x, y, size: 13, font });
  line('Reef monitoring summary for the northern transects.', 720);
  line('Squeeze start: these lines can be folded out of view.', 690);
  line('A middle line that is not needed while comparing.', 670);
  line('Squeeze end: the last line before the figure.', 650);
  page.drawRectangle({ ...FIGURE, color: rgb(0.1, 0.6, 0.3) });
  line('Figure 1: coral cover by depth', 300, 200);
  line('Text below the figure that is not part of it.', 240);
  return Buffer.from(await pdf.save());
}

/** The colour of a point of an image on the page, as fractions of its width and height. */
const pixel = (img: ReturnType<Page['locator']>, fx: number, fy: number) =>
  img.evaluate(
    (el: HTMLImageElement, [fx, fy]) => {
      const c = document.createElement('canvas');
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(el, 0, 0);
      return [...g.getImageData(Math.floor(fx! * c.width), Math.floor(fy! * c.height), 1, 1).data.slice(0, 3)];
    },
    [fx, fy],
  );

test('a box snipped around a figure becomes a card showing that region, kept, searchable and exported', async ({ page }) => {
  await openWith(page, [{ name: 'Figure report.pdf', buffer: await reportWithFigure() }]);

  // Squeezed lines above put the figure in the copy that shows the rest of the page; the box is drawn there.
  await select(page, 'Squeeze start', 'Squeeze end');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Squeeze' }).click();
  const copy = page.locator('.fold-tail .page[data-page-number="1"]');
  await expect(copy).toHaveCount(1);
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Snip' }).click();
  const box = (await copy.boundingBox())!;
  const at = (x: number, y: number) => [box.x + (x / 612) * box.width, box.y + (1 - y / 792) * box.height] as const;
  const [x0, y0] = at(SNIP.left, SNIP.top);
  const [x1, y1] = at(SNIP.right, SNIP.bottom);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 });
  await shot(page, 'snip-drawing');
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();

  const popup = page.getByRole('toolbar', { name: 'Highlight' });
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'Make it blue' }).click();
  await expect(page.locator('.page:not([data-copy]) .hl.area.hl-blue')).toHaveCount(1);
  await popup.getByRole('button', { name: 'Excerpt' }).click();

  const figure = page.locator('.react-flow__node').filter({ has: page.locator('img.snip') });
  const img = figure.locator('img.snip');
  await expect(img).toHaveAttribute('alt', 'Figure 1: coral cover by depth');
  await expect(figure.getByRole('button', { name: 'Figure report · p. 1' })).toBeVisible();
  const checkImage = async () => {
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    // About twice the screen's resolution: the box is 260 points wide.
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(480);
    // The middle of the box is the green chart, and its corner the white page around it.
    const [r, g, b] = await pixel(img, 0.5, 0.4);
    expect(g).toBeGreaterThan(120);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(110);
    expect((await pixel(img, 0.01, 0.01)).every((v) => v > 240)).toBe(true);
  };
  await checkImage();
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Select' }).click();
  await shot(page, 'snip-card');

  // Kept with the project, and drawn again from the PDF after a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await checkImage();

  // Unsqueezed, the box sits around the figure on the page itself.
  await page.locator('.fold-bar').click();
  const pageBox = (await page.locator('.page:not([data-copy])[data-page-number="1"]').boundingBox())!;
  const mark = (await page.locator('.page:not([data-copy]) .hl.area').boundingBox())!;
  expect(Math.abs((mark.x - pageBox.x) / pageBox.width - SNIP.left / 612)).toBeLessThan(0.01);
  expect(Math.abs((mark.y - pageBox.y) / pageBox.height - (1 - SNIP.top / 792))).toBeLessThan(0.01);
  expect(Math.abs(mark.width / pageBox.width - (SNIP.right - SNIP.left) / 612)).toBeLessThan(0.01);
  await shot(page, 'snip-on-page');

  // Found by the text inside it.
  await page.getByRole('searchbox').fill('coral cover');
  await expect(page.getByRole('listbox').getByRole('option', { name: 'Figure 1: coral cover by depth', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export notes' }).click();
  const [notes] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Markdown (.md)' }).click()]);
  copyFileSync(await notes.path(), `${ARTIFACTS}/snip-notes.md`);
  expect(readFileSync(`${ARTIFACTS}/snip-notes.md`, 'utf8')).toContain('> [Figure: Figure 1: coral cover by depth]\n> (Figure report, p. 1)');

  // The exported PDF has a Square annotation where the box was drawn.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/Figure report (annotated).pdf`;
  copyFileSync(await download.path(), file);
  const task = readPdf(file);
  const squares = (await (await (await task.promise).getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Square');
  expect(squares).toHaveLength(1);
  const [left, bottom, right, top] = squares[0].rect as number[];
  for (const [got, want] of [
    [left, SNIP.left],
    [bottom, SNIP.bottom],
    [right, SNIP.right],
    [top, SNIP.top],
  ])
    expect(Math.abs(got! - want!)).toBeLessThan(3);
  await task.destroy();
});

test('comments sit in the margin, are edited in place, and reach the sidebar, search and both exports', async ({ page }) => {
  await openProject(page);
  const marker = page.locator('.page:not([data-copy]) .note-mark');

  // From a selection: the highlight is made with its comment.
  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  const editor = page.getByRole('dialog', { name: 'Comment' });
  await expect(editor.getByRole('textbox', { name: 'Comment' })).toBeFocused();
  await page.keyboard.type('Compare with the survey.');
  await shot(page, 'comment-writing');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(marker).toHaveCount(1);
  await expect(page.locator('.page:not([data-copy]) .hl')).toHaveCount(2);

  // The marker is level with the first line of the passage, in the right margin.
  const line = (await page.locator('.textLayer span', { hasText: 'Coral reefs occupy' }).first().boundingBox())!;
  const m = (await marker.boundingBox())!;
  const pageBox = (await page.locator('.page:not([data-copy])[data-page-number="1"]').boundingBox())!;
  expect(Math.abs(m.y + m.height / 2 - (line.y + line.height / 2))).toBeLessThan(6);
  expect(m.x).toBeGreaterThan(pageBox.x + pageBox.width * 0.9);

  // Clicking the marker opens the comment to edit in place.
  await marker.click();
  await expect(editor.getByRole('textbox')).toHaveValue('Compare with the survey.');
  await editor.getByRole('textbox').fill('Compare with the eastern slope survey.');
  await page.keyboard.press('Control+Enter');
  await expect(editor).toHaveCount(0);
  await expect(marker).toHaveAttribute('title', 'Compare with the eastern slope survey.');

  // From an existing highlight's popup.
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight pink' }).click();
  const pink = (await page.locator('.page:not([data-copy]) .hl.hl-pink').first().boundingBox())!;
  await page.mouse.click(pink.x + 30, pink.y + pink.height / 2);
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Bleaching threshold?');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(marker).toHaveCount(2);
  await shot(page, 'comment-markers');

  // An excerpt's own comment joins the margin comment in the exported PDF.
  const first = (await page.locator('.page:not([data-copy]) .hl').first().boundingBox())!;
  await page.mouse.click(first.x + 30, first.y + first.height / 2);
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Excerpt' }).click();
  await card(page, 'Coral reefs').getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Tiny area, huge share.');

  await page.locator('.doc-pane').getByRole('button', { name: 'Contents, pages and highlights' }).click();
  const sidebar = page.getByRole('complementary');
  await sidebar.getByRole('tab', { name: 'Highlights' }).click();
  await expect(sidebar.locator('.note')).toHaveText(['Compare with the eastern slope survey.', 'Bleaching threshold?']);
  // Colours ease over 150 ms.
  await page.waitForTimeout(300);
  await shot(page, 'comment-sidebar');

  await page.getByRole('searchbox').fill('eastern slope');
  const hit = page.getByRole('listbox').getByRole('option', { name: /Reef essay: Compare with the eastern slope survey\./ });
  await expect(hit).toBeVisible();
  await page
    .locator('.doc-scroll')
    .first()
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await hit.click();
  await expect(page.locator('.hl.flash').first()).toBeInViewport();

  await page.getByRole('button', { name: 'Export notes' }).click();
  const [notes] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Markdown (.md)' }).click()]);
  copyFileSync(await notes.path(), `${ARTIFACTS}/comment-notes.md`);
  const md = readFileSync(`${ARTIFACTS}/comment-notes.md`, 'utf8');
  expect(md).toContain('> (Reef essay, p. 1)\n\nComment: Compare with the eastern slope survey.\n\nTiny area, huge share.');
  expect(md).toMatch(/- p\. 1: Rising sea temperatures[^\n]*\n {2}Comment: Bleaching threshold\?/);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/Reef essay with comments (annotated).pdf`;
  copyFileSync(await download.path(), file);
  const task = readPdf(file);
  const contents = (await (await (await task.promise).getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Highlight').map((a) => a.contentsObj?.str);
  expect(contents).toContain('Compare with the eastern slope survey.\n\nTiny area, huge share.');
  expect(contents).toContain('Bleaching threshold?');
  await task.destroy();

  // Removed from its popup, the marker goes too.
  await page.locator('.page:not([data-copy]) .note-mark').last().click();
  await editor.getByRole('button', { name: 'Remove comment' }).click();
  await expect(marker).toHaveCount(1);
});
