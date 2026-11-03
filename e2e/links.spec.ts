import { copyFileSync, readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ARTIFACTS, card, openProject, readPdf, select, shot } from './helpers';

/** A note's text is in a field, which a text match does not see; the field's sizer carries it. */
const note = (page: Page, text: string) => page.locator('.react-flow__node').filter({ has: page.locator(`.grow[data-value^="${text}"]`) });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const noteMarks = (root: Page | Locator) => root.locator('.page:not([data-copy]) .note-mark');
const linkMarks = (root: Page | Locator) => root.locator('.page:not([data-copy]) .link-mark');
const banner = (page: Page) => page.getByRole('region', { name: 'Linking' });
const pane = (page: Page, n: 0 | 1) => page.locator('.doc-pane').nth(n);

/** Clicks the middle of the first highlight drawn over a line of text. */
async function clickHighlight(page: Page, text: string, root: Page | Locator = page) {
  const line = root.locator('.page:not([data-copy]) .textLayer span', { hasText: text }).first();
  await line.scrollIntoViewIfNeeded();
  const box = (await line.boundingBox())!;
  await page.mouse.click(box.x + Math.min(30, box.width / 2), box.y + box.height / 2);
}

async function highlight(page: Page, from: string, to = from, color = 'yellow') {
  await select(page, from, to);
  await page
    .getByRole('toolbar', { name: 'Selection' })
    .getByRole('button', { name: `Highlight ${color}` })
    .click();
}

async function exportMarkdown(page: Page, name: string) {
  await page.getByRole('button', { name: 'Export notes' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('group', { name: 'Download' }).getByRole('menuitem', { name: 'Markdown (.md)' }).click()]);
  copyFileSync(await download.path(), `${ARTIFACTS}/${name}`);
  return readFileSync(`${ARTIFACTS}/${name}`, 'utf8');
}

async function exportPdf(page: Page, name: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.doc-pane').first().getByRole('button', { name: 'Export PDF with highlights' }).click()]);
  const file = `${ARTIFACTS}/${name}`;
  copyFileSync(await download.path(), file);
  return file;
}

test('passages link within a document and across two side by side, and the links are kept, undone and exported', async ({ page }) => {
  await openProject(page);

  // From a highlight's popup: linking mode says what to do until a passage is picked.
  await highlight(page, 'Coral reefs occupy', 'of all marine species.');
  await clickHighlight(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(banner(page)).toContainText('Select text or click a highlight to link to');
  await expect(page.locator('.hl.linking')).toHaveCount(2);
  await shot(page, 'links-linking-mode');

  // Picking the passage it starts from is refused, and linking carries on.
  await clickHighlight(page, 'Coral reefs occupy');
  await expect(banner(page)).toContainText('That is the passage the link starts from');

  // Selecting text elsewhere in the document makes its highlight and the link.
  await page.locator('.page[data-page-number="3"]').scrollIntoViewIfNeeded();
  await select(page, 'Kelp forests grow');
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator('.hl.linking')).toHaveCount(0);
  await expect(page.locator('.page[data-page-number="3"] .link-mark')).toHaveCount(1);
  await expect(page.locator('.page[data-page-number="3"] .hl')).toHaveCount(1);
  await shot(page, 'links-marker');

  // The marker sits in the left margin, level with the passage's first line, clear of the text.
  const kelp = (await page.locator('.textLayer span', { hasText: 'Kelp forests grow' }).first().boundingBox())!;
  const mark = (await page.locator('.page[data-page-number="3"] .link-mark').boundingBox())!;
  expect(Math.abs(mark.y + mark.height / 2 - (kelp.y + kelp.height / 2))).toBeLessThan(6);
  expect(mark.x + mark.width).toBeLessThan(kelp.x);

  // Its marker shows the other end, and goes there.
  await page.locator('.page[data-page-number="3"] .link-mark').click();
  const popover = page.getByRole('dialog', { name: 'Linked passages' });
  await expect(popover).toContainText('Coral reefs occupy');
  await expect(popover).toContainText('Reef essay · p. 1');
  await shot(page, 'links-popover');
  await popover.getByRole('button', { name: /Coral reefs occupy/ }).click();
  await expect(page.locator('.page[data-page-number="1"] .hl.flash').first()).toBeInViewport();

  // Escape leaves linking mode without a link.
  await clickHighlight(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(banner(page)).toHaveCount(0);
  await clickHighlight(page, 'Rising sea temperatures');
  await expect(page.getByRole('toolbar', { name: 'Highlight' })).toHaveCount(0);
  await expect(page.locator('.page[data-page-number="1"] .link-mark')).toHaveCount(1);

  // Across documents, side by side: a selection's popup starts the link and the other pane ends it.
  await page.getByRole('button', { name: 'Open side by side' }).click();
  await expect(pane(page, 1).locator('.textLayer span', { hasText: 'Field notes' })).toBeVisible();
  await select(page, 'Rising sea temperatures', 'known as bleaching.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await select(page, 'Parrotfish numbers');
  await expect(banner(page)).toHaveCount(0);
  await expect(linkMarks(pane(page, 1))).toHaveCount(1);

  // The second pane wanders off; the marker in the first brings the other end back beside it.
  await pane(page, 1).getByRole('button', { name: 'Zoom out' }).click();
  await pane(page, 1)
    .locator('.doc-scroll')
    .evaluate((e) => (e.scrollTop = 0));
  const rising = pane(page, 0).locator('.page[data-page-number="1"] .link-mark').last();
  await rising.click();
  await expect(page.getByRole('dialog', { name: 'Linked passages' })).toContainText('Survey notes · p. 2');
  await expect(pane(page, 1).locator('.hl.flash').first()).toBeInViewport();
  await expect(pane(page, 0).locator('.textLayer span', { hasText: 'Rising sea temperatures' }).first()).toBeInViewport();
  await shot(page, 'links-side-by-side');

  // The sidebar lists each passage's links.
  await pane(page, 0).getByRole('button', { name: 'Contents, pages and highlights' }).click();
  const sidebar = pane(page, 0).getByRole('complementary');
  await sidebar.getByRole('tab', { name: 'Highlights' }).click();
  await expect(sidebar.locator('.end')).toHaveText([/Kelp forests grow.*p\. 3/, /Parrotfish numbers.*Survey notes, p\. 2/, /Coral reefs occupy.*p\. 1/]);
  await shot(page, 'links-sidebar');
  await pane(page, 0).getByRole('button', { name: 'Contents, pages and highlights' }).click();

  // Undo takes the last link away, and its new highlight with it; redo brings both back.
  await page.keyboard.press('Control+z');
  await expect(linkMarks(pane(page, 1))).toHaveCount(0);
  await expect(pane(page, 1).locator('.hl')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(linkMarks(pane(page, 1))).toHaveCount(1);

  const md = await exportMarkdown(page, 'links-notes.md');
  expect(md).toMatch(/- p\. 1: Coral reefs occupy[^\n]*\n {2}Linked passage: “Kelp forests grow[^”]*” \(Reef essay, p\. 3\)/);
  expect(md).toMatch(/- p\. 1: Rising sea temperatures[^\n]*\n {2}Linked passage: “Parrotfish numbers[^”]*” \(Survey notes, p\. 2\)/);
  expect(md).toMatch(/- p\. 2: Parrotfish numbers[^\n]*\n {2}Linked passage: “Rising sea temperatures[^”]*” \(Reef essay, p\. 1\)/);

  // In the exported PDF, a link within the document goes to the other passage's page; one to another document is in the note.
  const task = readPdf(await exportPdf(page, 'Reef essay (links).pdf'));
  const doc = await task.promise;
  const pageOf = async (dest: unknown[]) => (await doc.getPageIndex(dest[0] as never)) + 1;
  const links = async (n: number) => (await (await doc.getPage(n)).getAnnotations()).filter((a) => a.subtype === 'Link');
  const [fromCoral] = await links(1);
  const [fromKelp] = await links(3);
  expect(await pageOf(fromCoral!.dest)).toBe(3);
  expect(await pageOf(fromKelp!.dest)).toBe(1);
  expect(await links(1)).toHaveLength(1);
  const notes = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Highlight').map((a) => a.contentsObj?.str);
  expect(notes).toContainEqual(expect.stringMatching(/^Linked passage: “Parrotfish numbers[^”]*” \(Survey notes, p\. 2\)$/));
  await task.destroy();

  // Kept with the project.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.page[data-page-number="1"] .link-mark')).toHaveCount(2);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await page.locator('.page[data-page-number="1"] .link-mark').first().click();
    await page.waitForTimeout(300);
    await shot(page, `links-marker-popover-${scheme}`);
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 300);
  }
});

test('one comment on several passages: edited from any, detached by removing a passage, gone with the last', async ({ page }) => {
  await openProject(page);
  const editor = page.getByRole('dialog', { name: 'Comment' });

  await select(page, 'Coral reefs occupy', 'of all marine species.');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Reefs and mangroves shelter the same fish.');
  // Attaching saves the comment first, then waits for the other passage.
  await editor.getByRole('button', { name: 'Attach to another passage' }).click();
  await expect(editor).toHaveCount(0);
  await expect(banner(page)).toContainText('attach this comment to');
  await expect(noteMarks(page)).toHaveCount(1);
  await select(page, 'Mangrove forests protect');
  await expect(banner(page)).toHaveCount(0);
  await expect(noteMarks(page)).toHaveCount(2);
  for (const mark of [noteMarks(page).first(), noteMarks(page).last()]) await expect(mark).toHaveAttribute('title', 'Reefs and mangroves shelter the same fish.');

  // A third passage from an existing highlight's comment editor.
  await highlight(page, 'Marine protected areas', 'Marine protected areas', 'green');
  await clickHighlight(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Edit comment' }).click();
  await expect(editor).toContainText('On 2 passages');
  await editor.getByRole('button', { name: 'Attach to another passage' }).click();
  await clickHighlight(page, 'Marine protected areas');
  await expect(noteMarks(page)).toHaveCount(3);
  await shot(page, 'links-shared-comment');

  // A passage that has a comment of its own is not taken.
  await select(page, 'Overfishing removes predators');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Grazers matter.');
  await editor.getByRole('button', { name: 'Save' }).click();
  await noteMarks(page).first().click();
  await editor.getByRole('button', { name: 'Attach to another passage' }).click();
  await clickHighlight(page, 'Overfishing removes predators');
  await expect(banner(page)).toContainText('That passage has a comment of its own');
  await page.keyboard.press('Escape');

  // Edited beside one passage, it reads the same beside the others.
  const mangrove = page.locator('.page[data-page-number="2"] .note-mark').first();
  await mangrove.click();
  await expect(editor.getByRole('textbox')).toHaveValue('Reefs and mangroves shelter the same fish.');
  await expect(editor).toContainText('On 3 passages');
  await shot(page, 'links-shared-comment-editor');
  await editor.getByRole('textbox').fill('Reefs, mangroves and reserves shelter the same fish.');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.page[data-page-number="1"] .note-mark')).toHaveAttribute('title', 'Reefs, mangroves and reserves shelter the same fish.');

  // Detaching takes it off one passage only.
  await page.locator('.page[data-page-number="2"] .note-mark[title^="Reefs"]').last().click();
  await expect(editor.getByRole('textbox')).toHaveValue('Reefs, mangroves and reserves shelter the same fish.');
  await editor.getByRole('button', { name: 'Detach from this passage' }).click();
  await expect(noteMarks(page)).toHaveCount(3);
  await page.keyboard.press('Control+z');
  await expect(noteMarks(page)).toHaveCount(4);

  // The sidebar, search and both exports show it beside each of its passages.
  await page.locator('.doc-pane').getByRole('button', { name: 'Contents, pages and highlights' }).click();
  const sidebar = page.getByRole('complementary');
  await sidebar.getByRole('tab', { name: 'Highlights' }).click();
  await expect(sidebar.locator('.note')).toHaveText([
    ...Array(2).fill('Reefs, mangroves and reserves shelter the same fish.'),
    'Grazers matter.',
    'Reefs, mangroves and reserves shelter the same fish.',
  ]);
  await page.locator('.doc-pane').getByRole('button', { name: 'Contents, pages and highlights' }).click();
  await page.getByRole('searchbox', { name: 'Search documents and cards' }).fill('reserves shelter');
  await expect(page.getByRole('listbox').getByRole('option', { name: /Reef essay: Reefs, mangroves and reserves/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  const md = await exportMarkdown(page, 'links-shared-comment.md');
  expect(md.match(/ {2}Comment: Reefs, mangroves and reserves shelter the same fish\./g)).toHaveLength(3);
  const task = readPdf(await exportPdf(page, 'Reef essay (shared comment).pdf'));
  const doc = await task.promise;
  const contents = [];
  for (const n of [1, 2]) contents.push(...(await (await doc.getPage(n)).getAnnotations()).filter((a) => a.subtype === 'Highlight').map((a) => a.contentsObj?.str));
  expect(contents.filter((c) => c === 'Reefs, mangroves and reserves shelter the same fish.')).toHaveLength(3);
  await task.destroy();

  // Kept with the project.
  await page.waitForTimeout(500);
  await page.reload();
  await page.locator('.page[data-page-number="1"]').scrollIntoViewIfNeeded();
  await expect(noteMarks(page)).toHaveCount(4);

  // Removing a passage leaves the comment on the others; removing the last removes the comment.
  const remove = async (text: string) => {
    await clickHighlight(page, text);
    await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Delete' }).click();
  };
  await remove('Coral reefs occupy');
  await expect(noteMarks(page)).toHaveCount(3);
  await page.keyboard.press('Control+z');
  await expect(noteMarks(page)).toHaveCount(4);
  await page.keyboard.press('Control+Shift+z');
  await expect(noteMarks(page)).toHaveCount(3);
  await remove('Mangrove forests protect');
  await expect(page.locator('.page[data-page-number="2"] .note-mark').first()).toHaveAttribute('title', 'Reefs, mangroves and reserves shelter the same fish.');
  await remove('Marine protected areas');
  await expect(noteMarks(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search documents and cards' }).fill('reserves shelter');
  await expect(page.getByRole('listbox')).toContainText('Nothing matches');
});

test('a pen stroke from a passage to a card links them, across the panes, with the mouse and with a stylus', async ({ page }) => {
  await openProject(page);
  const canvas = (await page.locator('.canvas').boundingBox())!;
  for (const [y, text] of [
    [200, 'Why do reefs matter?'],
    [420, 'What warms the sea?'],
  ] as const) {
    await page.mouse.dblclick(canvas.x + 120, canvas.y + y);
    await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
    await page.keyboard.type(text);
  }
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 600 } });
  await highlight(page, 'Coral reefs occupy', 'of all marine species.');
  await highlight(page, 'Rising sea temperatures', 'known as bleaching.', 'pink');
  const docTools = page.getByRole('toolbar', { name: 'Document tools' });
  await docTools.getByRole('button', { name: 'Pen' }).click();
  const strokes = page.locator('.page:not([data-copy]) .ink-layer path');

  const centre = async (l: Locator) => {
    const b = (await l.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const from = await centre(page.locator('.textLayer span', { hasText: 'Coral reefs occupy' }).first());
  const to = await centre(note(page, 'Why do reefs matter?'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 24, from.y + ((to.y - from.y) * i) / 24 - Math.sin((i / 24) * Math.PI) * 60);
  await expect(page.locator('.react-flow__node.ink-target')).toHaveCount(1);
  await shot(page, 'links-ink-stroke');
  await page.mouse.up();
  const chip = note(page, 'Why do reefs matter?').getByRole('button', { name: 'Linked to Reef essay p. 1' });
  await expect(chip).toBeVisible();
  await expect(page.locator('.react-flow__node.ink-target')).toHaveCount(0);
  await expect(strokes).toHaveCount(0);
  await expect(linkMarks(page)).toHaveCount(1);

  // A stroke that does not end on a card, or does not start on a passage, is handwriting.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect(strokes).toHaveCount(1);
  const blank = await centre(page.locator('.textLayer span', { hasText: 'The ocean covers' }).first());
  await page.mouse.move(blank.x, blank.y - 30);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  await expect(strokes).toHaveCount(2);
  await expect(page.locator('.card-links button')).toHaveCount(1);

  // A stylus does the same.
  const rising = await centre(page.locator('.textLayer span', { hasText: 'Rising sea temperatures' }).first());
  const warms = await centre(note(page, 'What warms the sea?'));
  const cdp = await page.context().newCDPSession(page);
  const pen = { pointerType: 'pen', button: 'left', force: 0.6 } as const;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rising.x, y: rising.y, clickCount: 1, buttons: 1, ...pen });
  for (let i = 1; i <= 16; i++)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: rising.x + ((warms.x - rising.x) * i) / 16,
      y: rising.y + ((warms.y - rising.y) * i) / 16,
      buttons: 1,
      ...pen,
    });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: warms.x, y: warms.y, clickCount: 1, buttons: 0, ...pen });
  await expect(note(page, 'What warms the sea?').getByRole('button', { name: 'Linked to Reef essay p. 1' })).toBeVisible();
  await expect(linkMarks(page)).toHaveCount(2);
  await expect(strokes).toHaveCount(2);
  await docTools.getByRole('button', { name: 'Select' }).click();
  await shot(page, 'links-ink-linked');

  // A card written by hand takes a link too, shown under it.
  const canvasTools = page.getByRole('toolbar', { name: 'Canvas tools' });
  await canvasTools.getByRole('button', { name: 'Pen' }).click();
  await page.mouse.move(canvas.x + 480, canvas.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(canvas.x + 480 + i * 8, canvas.y + 300 + (i % 2) * 24);
  await page.mouse.up();
  await canvasTools.getByRole('button', { name: 'Select' }).click();
  await docTools.getByRole('button', { name: 'Pen' }).click();
  const scribble = await centre(page.locator('[data-ink-card]'));
  await page.mouse.move(rising.x, rising.y);
  await page.mouse.down();
  await page.mouse.move(scribble.x, scribble.y, { steps: 20 });
  await page.mouse.up();
  await docTools.getByRole('button', { name: 'Select' }).click();
  const scribbleChip = page
    .locator('.react-flow__node')
    .filter({ has: page.locator('[data-ink-card]') })
    .getByRole('button', { name: 'Linked to Reef essay p. 1' });
  await expect(scribbleChip).toBeVisible();
  const ink = (await page.locator('[data-ink-card]').boundingBox())!;
  expect((await scribbleChip.boundingBox())!.y).toBeGreaterThan(ink.y + ink.height);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await page.waitForTimeout(300);
    await shot(page, `links-ink-cards-${scheme}`);
  }
  await page.evaluate(() => delete document.documentElement.dataset.theme);
  // The link, then the card, are taken back.
  await page.keyboard.press('Control+z');
  await expect(scribbleChip).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-ink-card]')).toHaveCount(0);

  // Undo and redo.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.card-links button')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.card-links button')).toHaveCount(2);

  // The chip opens the passage; the passage's marker shows the card.
  await page
    .locator('.doc-scroll')
    .first()
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await chip.click();
  await expect(page.locator('.hl.flash').first()).toBeInViewport();
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 600 } });
  await linkMarks(page).first().click();
  const popover = page.getByRole('dialog', { name: 'Linked passages' });
  await expect(popover).toContainText('Why do reefs matter?');
  await expect(note(page, 'Why do reefs matter?')).not.toHaveClass(/selected/);
  await popover.getByRole('button', { name: /Why do reefs matter\?/ }).click();
  await expect(note(page, 'Why do reefs matter?')).toHaveClass(/selected/);

  // Kept with the project; a card removed takes its link with it.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.card-links button')).toHaveCount(2);
  await expect(linkMarks(page)).toHaveCount(2);
  await note(page, 'What warms the sea?').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Delete');
  await expect(linkMarks(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(linkMarks(page)).toHaveCount(2);

  const md = await exportMarkdown(page, 'links-ink.md');
  expect(md).toContain('Why do reefs matter?\n\nLinked passage: “Coral reefs occupy');
});

test('links and shared comments survive a backup, and comments saved before sharing existed are kept', async ({ page }) => {
  await openProject(page);
  await highlight(page, 'Coral reefs occupy');
  await clickHighlight(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Link', exact: true }).click();
  await select(page, 'Rising sea temperatures');
  await clickHighlight(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Comment' }).click();
  await page.keyboard.type('Both about warming.');
  await page.getByRole('dialog', { name: 'Comment' }).getByRole('button', { name: 'Attach to another passage' }).click();
  await clickHighlight(page, 'Coral reefs occupy');
  await expect(noteMarks(page)).toHaveCount(2);
  await clickHighlight(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Excerpt' }).click();
  // And a pen stroke from the other passage to that card.
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Pen' }).click();
  const from = (await page.locator('.textLayer span', { hasText: 'Rising sea temperatures' }).first().boundingBox())!;
  const to = (await card(page, 'Coral reefs occupy').boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + 20, { steps: 20 });
  await page.mouse.up();
  await page.getByRole('toolbar', { name: 'Document tools' }).getByRole('button', { name: 'Select' }).click();
  await expect(card(page, 'Coral reefs occupy').getByRole('button', { name: 'Linked to Reef essay p. 1' })).toBeVisible();
  await expect(linkMarks(page)).toHaveCount(2);
  await page.waitForTimeout(500);

  await page.goto('/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up Reef essay' }).click()]);
  const file = `${ARTIFACTS}/Reef essay with links.gloss`;
  copyFileSync(await download.path(), file);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore a backup' }).click()]);
  // Restored beside the project it came from, which Gloss checks is meant.
  page.once('dialog', (d) => d.accept());
  await chooser.setFiles({ name: 'Reef essay.gloss', mimeType: 'application/octet-stream', buffer: readFileSync(file) });
  await expect(page.getByRole('tab', { name: 'Survey notes' })).toBeVisible();
  await expect(linkMarks(page)).toHaveCount(2);
  await expect(noteMarks(page)).toHaveCount(2);
  await expect(card(page, 'Coral reefs occupy').getByRole('button', { name: 'Linked to Reef essay p. 1' })).toBeVisible();
  await linkMarks(page).first().click();
  await expect(page.getByRole('dialog', { name: 'Linked passages' })).toContainText('Rising sea temperatures');
  await page.locator('.textLayer span', { hasText: 'The ocean covers' }).first().click();
  await page.getByRole('button', { name: 'Linked to 2 places' }).click();
  await expect(page.getByRole('dialog', { name: 'Linked passages' })).toContainText('Card on the canvas');

  // A project saved when each highlight held its own comment opens with each as a comment of its own.
  const id = page.url().split('/').at(-1)!;
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((ok) => (indexedDB.open('gloss').onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)));
    const store = () => db.transaction('projects', 'readwrite').objectStore('projects');
    const p = await new Promise<Record<string, unknown> & { highlights: Record<string, unknown>[] }>(
      (ok) => (store().get(id).onsuccess = (e) => ok((e.target as IDBRequest).result)),
    );
    const old = { ...p, highlights: p.highlights.map(({ commentId: _, ...h }, i) => ({ ...h, ...(i === 0 ? { note: 'Written before.' } : {}) })) };
    delete (old as Record<string, unknown>).comments;
    delete (old as Record<string, unknown>).passageLinks;
    delete (old as Record<string, unknown>).cardLinks;
    await new Promise((ok) => (store().put(old).onsuccess = ok));
  }, id);
  await page.goto('/');
  await page
    .getByRole('link', { name: /Reef essay/ })
    .first()
    .click();
  await expect(noteMarks(page)).toHaveCount(1);
  await expect(noteMarks(page)).toHaveAttribute('title', 'Written before.');
  await expect(linkMarks(page)).toHaveCount(0);
  // The comment is kept as it is now, and works as any other.
  await page.reload();
  await noteMarks(page).click();
  await expect(page.getByRole('dialog', { name: 'Comment' }).getByRole('textbox')).toHaveValue('Written before.');
});

test('on a phone, link and comment markers share a line without touching each other or the text', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  const span = (text: string) => page.locator('.textLayer span', { hasText: text }).first();
  const selectSpan = async (text: string) => {
    await span(text).tap();
    // A long press is not something Playwright can do; the selection it makes is set directly.
    await span(text).evaluate((el) => getSelection()!.selectAllChildren(el));
  };
  await selectSpan('Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Link', exact: true }).tap();
  await expect(banner(page)).toBeVisible();
  await shot(page, 'links-phone-linking');
  // On a touch screen the selection is adjusted with handles, so it is taken from its toolbar.
  await selectSpan('Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Link here' }).tap();
  await expect(banner(page)).toHaveCount(0);
  await expect(linkMarks(page)).toHaveCount(2);

  await span('Coral reefs occupy').tap();
  await page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Comment' }).tap();
  await page.keyboard.type('Compare.');
  await page.getByRole('dialog', { name: 'Comment' }).getByRole('button', { name: 'Save' }).tap();
  await expect(noteMarks(page)).toHaveCount(1);

  const pageBox = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  const line = (await span('Coral reefs occupy').boundingBox())!;
  const marks = [...(await linkMarks(page).all()), noteMarks(page)];
  const boxes = await Promise.all(marks.map(async (m) => (await m.boundingBox())!));
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(pageBox.x);
    expect(b.x + b.width).toBeLessThanOrEqual(pageBox.x + pageBox.width);
  }
  const [link, , comment] = boxes as [typeof line, typeof line, typeof line];
  expect(link.x + link.width).toBeLessThanOrEqual(line.x);
  expect(comment.x).toBeGreaterThan(link.x + link.width);
  // The two link markers, on lines close together, are kept apart.
  expect(boxes[1]!.y).toBeGreaterThanOrEqual(link.y + link.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await linkMarks(page).first().tap();
    await expect(page.getByRole('dialog', { name: 'Linked passages' })).toBeInViewport({ ratio: 1 });
    await page.waitForTimeout(300);
    await shot(page, `links-phone-${scheme}`);
  }
  await context.close();
});
