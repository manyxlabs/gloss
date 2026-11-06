import { expect, test, type Page } from '@playwright/test';
import { noteCard } from './cards';
import { openProject, pdf, select, shot } from './helpers';
import { NOTES } from './pdfs';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const projectId = (page: Page) => /#\/p\/([\w-]+)/.exec(page.url())![1]!;

/** Copies with a button and returns what was copied, checked to be a link into this project. */
async function copied(page: Page, button: ReturnType<Page['getByRole']>, kind: string) {
  await button.click();
  const link = await clipboard(page);
  const url = new URL(link);
  expect(url.origin + url.pathname).toBe(new URL('/', page.url()).href);
  expect(url.hash).toMatch(new RegExp(`^#/p/${projectId(page)}/${kind}/[\\w-]+$`));
  return link;
}

async function openHighlight(page: Page, text: string) {
  const span = page.locator('.page:not([data-copy]) .textLayer span', { hasText: text }).first();
  await span.scrollIntoViewIfNeeded();
  const box = (await span.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  return page.getByRole('toolbar', { name: 'Highlight' });
}

async function writeNote(page: Page, text: string, x = 160, y = 200) {
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + x, flow.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.insertText(text);
  // Clear of the zoom buttons at the bottom left and the map at the bottom right.
  await page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height - 24);
}

test('copy a link to a passage, card, comment, canvas or document; it opens there, and pasted into a note it is a chip', async ({ page }) => {
  test.setTimeout(120_000);
  await openProject(page);
  await select(page, 'Rising sea temperatures');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Highlight yellow' }).click();
  const passage = await copied(page, (await openHighlight(page, 'Rising sea temperatures')).getByRole('button', { name: 'Copy link to this passage' }), 'h');
  await expect(page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Link copied' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Pasted into a note: a chip with the passage's words, which goes to it.
  await writeNote(page, `See ${passage} for the cause.`);
  const note = noteCard(page, `See ${passage} for the cause.`);
  const chip = note.getByRole('link', { name: /Rising sea temperatures cause corals/ });
  await expect(chip).toBeVisible();
  await shot(page, 'link-chip-note');
  await page
    .locator('.doc-scroll')
    .first()
    .evaluate((el) => el.scrollTo(0, 2000));
  await chip.click();
  await expect(page.locator('.page:not([data-copy]) .hl.flash')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/p/${projectId(page)}$`));

  // A card, and following its link chooses it.
  await note.click({ position: { x: 6, y: 6 } });
  const cardLink = await copied(page, page.getByRole('toolbar', { name: 'Chosen on the canvas' }).getByRole('button', { name: 'Copy link to this card' }), 'c');
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 400 } });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
  await page.goto(cardLink);
  await expect(note).toHaveClass(/selected/);

  // A comment, which opens at its passage.
  await (await openHighlight(page, 'Rising sea temperatures')).getByRole('button', { name: 'Comment' }).click();
  await page.getByRole('dialog', { name: 'Comment' }).getByRole('textbox').fill('Bleaching threshold?');
  await page.keyboard.press('Control+Enter');
  await page.locator('.page:not([data-copy]) .note-mark').click();
  const comment = await copied(page, page.getByRole('dialog', { name: 'Comment' }).getByRole('button', { name: 'Copy link to this comment' }), 'm');
  await page.keyboard.press('Escape');

  // A canvas.
  await page.getByRole('button', { name: 'New canvas' }).click();
  await page.getByRole('button', { name: 'Canvas style' }).click();
  const canvas = await copied(page, page.getByRole('dialog', { name: 'Canvas style' }).getByRole('button', { name: 'Copy link to this canvas' }), 'v');
  await page.keyboard.press('Escape');
  await page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 1' }).click();

  // A document.
  await page.getByRole('tab', { name: 'Survey notes' }).click();
  await page.getByRole('button', { name: 'More for this document' }).click();
  const doc = await copied(page, page.getByRole('menu', { name: 'More for this document' }).getByRole('menuitem', { name: 'Copy link to this document' }), 'd');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Reef essay' }).click();

  // Each opens where it leads, after a reload too.
  await page.goto(canvas);
  await expect(page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 2' })).toHaveAttribute('aria-selected', 'true');
  await page.goto(doc);
  await expect(page.getByRole('tab', { name: 'Survey notes' })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await page.goto(comment);
  await expect(page.getByRole('tab', { name: 'Reef essay' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.page:not([data-copy]) .hl.flash')).toBeVisible();

  // A link to something deleted says so, as a chip and when followed.
  await page.locator('.page:not([data-copy]) .note-mark').click();
  await page.getByRole('dialog', { name: 'Comment' }).getByRole('button', { name: 'Remove comment' }).click();
  await writeNote(page, comment, 160, 420);
  await expect(page.locator('.link-chips a.gone')).toHaveText('A comment no longer here');
  await page.goto(comment);
  await expect(page.getByRole('alert')).toContainText('The linked comment is no longer in this project.');
  // Undone back to before the comment went, the link leads to it again.
  for (let i = 0; i < 4 && !(await page.locator('.page:not([data-copy]) .note-mark').count()); i++) await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.page:not([data-copy]) .note-mark')).toHaveCount(1);
  await page.goto(comment);
  await expect(page.locator('.page:not([data-copy]) .hl.flash')).toBeVisible();
});

test('a link to another project on this device opens that project there, and its chip names the project', async ({ page }) => {
  await openProject(page);
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  const first = projectId(page);
  await page
    .locator('.react-flow__node')
    .first()
    .click({ position: { x: 8, y: 8 } });
  await page.getByRole('toolbar', { name: 'Chosen on the canvas' }).getByRole('button', { name: 'Copy link to this card' }).click();
  const link = await clipboard(page);

  await page.getByRole('link', { name: 'All projects' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles([await pdf('Survey notes.pdf', NOTES)]);
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  expect(projectId(page)).not.toBe(first);
  await writeNote(page, `Compare ${link}`);
  const chip = page.locator('.link-chips a', { hasText: 'Coral reefs occupy' });
  await expect(chip.locator('.where')).toHaveText('Reef essay');
  await shot(page, 'link-chip-other-project');
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`#/p/${first}$`));
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Reef essay');
  await expect(page.locator('.react-flow__node.selected')).toContainText('Coral reefs occupy');
});
