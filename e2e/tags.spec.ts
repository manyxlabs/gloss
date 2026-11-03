import { copyFileSync, readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { ARTIFACTS, card, openProject, PHONE, readPdf, select, shot } from './helpers';

const selection = (page: Page) => page.getByRole('toolbar', { name: 'Selection' });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Highlight' });
const picker = (page: Page) => page.getByRole('group', { name: 'Tags' }).filter({ has: page.getByRole('textbox', { name: 'Find or make a tag' }) });
const note = (page: Page, text: string) => page.locator('.react-flow__node').filter({ has: page.locator(`.grow[data-value="${text}"]`) });
/** How many highlights the document shows: each has a mark per line, all with its id. */
const highlights = (page: Page) => page.locator('.hl-layer .hl').evaluateAll((els) => new Set(els.map((e) => (e as HTMLElement).dataset.id)).size);
const chips = (scope: ReturnType<Page['locator']>) => scope.getByRole('list', { name: 'Tags' }).getByRole('listitem');

/** Makes a tag in the open picker, or takes an existing one, by typing its name and Enter. */
async function tagWith(page: Page, name: string) {
  await picker(page).getByRole('textbox', { name: 'Find or make a tag' }).fill(name);
  await page.keyboard.press('Enter');
  await expect(picker(page).getByRole('menuitemcheckbox', { name })).toHaveAttribute('aria-checked', 'true');
}

/** Clicks the middle of the first highlight showing a passage, which opens its toolbar. */
async function openHighlight(page: Page, text: string) {
  const span = page.locator('.textLayer span', { hasText: text }).first();
  const box = (await span.boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height / 2);
  await expect(toolbar(page)).toBeVisible();
}

async function exportText(page: Page, label: string, ext: string) {
  await page.getByRole('button', { name: 'Export notes' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('group', { name: 'Download' }).getByRole('menuitem', { name: label }).click()]);
  const out = `${ARTIFACTS}/tag-notes.${ext}`;
  copyFileSync(await download.path(), out);
  if (ext === 'md') return readFileSync(out, 'utf8');
  if (ext === 'docx') return strFromU8(unzipSync(readFileSync(out))['word/document.xml']!);
  const doc = await readPdf(out).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((t) => ('str' in t ? t.str : '')).join(' ');
  return text;
}

test('passages and cards are tagged, filtered and searched by tag, and tags are managed, undone, kept and exported', async ({ page }) => {
  await openProject(page);

  await test.step('A selection is highlighted with a new tag, and a highlight takes another', async () => {
    await select(page, 'Coral reefs occupy', 'of all marine species.');
    await selection(page).getByRole('button', { name: 'Highlight with tag' }).click();
    await expect.poll(() => highlights(page)).toBe(1);
    await tagWith(page, 'Reefs');
    await shot(page, 'tags-picker-light');
    await picker(page).getByRole('button', { name: 'Done' }).click();

    await openHighlight(page, 'Coral reefs occupy');
    await toolbar(page).getByRole('button', { name: 'Tag' }).click();
    await expect(picker(page).getByRole('menuitemcheckbox', { name: 'Reefs' })).toHaveAttribute('aria-checked', 'true');
    await tagWith(page, 'Climate');
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
  });

  await test.step('Its excerpt shows the passage’s tags', async () => {
    await openHighlight(page, 'Coral reefs occupy');
    await toolbar(page).getByRole('button', { name: 'Excerpt' }).click();
    await expect(chips(card(page, 'Coral reefs occupy'))).toHaveText(['Reefs', 'Climate']);
  });

  await test.step('A comment is written with a tag', async () => {
    await select(page, 'Rising sea temperatures', 'known as bleaching.');
    await selection(page).getByRole('button', { name: 'Comment' }).click();
    const editor = page.getByRole('dialog', { name: 'Comment' });
    await editor.getByRole('textbox', { name: 'Comment' }).fill('Threshold?');
    await editor.getByRole('button', { name: 'Add tags' }).click();
    await picker(page).getByRole('menuitemcheckbox', { name: 'Climate' }).click();
    await expect(chips(editor)).toHaveText(['Climate']);
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => highlights(page)).toBe(2);
    // The highlight, its comment and its tag are one step.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => highlights(page)).toBe(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => highlights(page)).toBe(2);
  });

  await test.step('A note on the canvas is tagged from the selection bar', async () => {
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.keyboard.type('Kelp forests are the next survey');
    await page.locator('.react-flow__pane').click({ position: { x: 20, y: 300 } });
    await note(page, 'Kelp forests are the next survey').click({ position: { x: 4, y: 4 } });
    await page.getByRole('toolbar', { name: 'Chosen on the canvas' }).getByRole('button', { name: 'Tag' }).click();
    await tagWith(page, 'Kelp');
    await expect(chips(note(page, 'Kelp forests are the next survey'))).toHaveText(['Kelp']);
    await picker(page).getByRole('button', { name: 'Done' }).click();
  });

  await test.step('The canvas dims what lacks the tags chosen, and the sidebar lists only what has them', async () => {
    await page.getByRole('button', { name: 'Filter by tag' }).first().click();
    await page.getByRole('menu', { name: 'Filter by tag' }).getByRole('menuitemcheckbox', { name: 'Kelp' }).click();
    await page.keyboard.press('Escape');
    await expect(card(page, 'Coral reefs occupy').locator('.card')).toHaveClass(/dim/);
    await expect(note(page, 'Kelp forests are the next survey').locator('.card')).not.toHaveClass(/dim/);
    await shot(page, 'tags-canvas-filter');

    await page.getByRole('button', { name: 'Contents, pages and highlights' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Contents, pages and highlights' });
    await sidebar.getByRole('tab', { name: 'Highlights' }).click();
    await expect(sidebar.getByText('No highlight here has the tags chosen.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear the tag filter' }).first().click();
    await sidebar.getByRole('button', { name: 'Filter by tag' }).click();
    await page.getByRole('menu', { name: 'Filter by tag' }).getByRole('menuitemcheckbox', { name: 'Reefs' }).click();
    await page.keyboard.press('Escape');
    await expect(sidebar.locator('.marks > li')).toHaveCount(1);
    await expect(chips(sidebar)).toHaveText(['Reefs', 'Climate']);
    await expect(note(page, 'Kelp forests are the next survey').locator('.card')).toHaveClass(/dim/);
    for (const scheme of ['light', 'dark'] as const) {
      await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
      await page.waitForTimeout(300);
      await shot(page, `tags-sidebar-${scheme}`);
    }
    await page.evaluate(() => delete document.documentElement.dataset.theme);
    await page.getByRole('button', { name: 'Clear the tag filter' }).first().click();
    await expect(sidebar.locator('.marks > li')).toHaveCount(2);
  });

  await test.step('Search finds what carries a tag, by #name or by the tag chips', async () => {
    const box = page.getByRole('searchbox', { name: 'Search documents and cards' });
    await box.fill('#clim');
    const results = page.getByRole('listbox', { name: 'Search results' });
    const tagged = results.getByRole('group', { name: 'Tagged passages' }).getByRole('option');
    await expect(tagged).toHaveCount(2);
    await box.fill('#climate bleaching');
    await expect(tagged).toHaveCount(1);
    await box.fill('');
    await results.getByRole('group', { name: 'Search by tag' }).getByRole('button', { name: 'Kelp' }).click();
    await expect(box).toHaveValue('#Kelp ');
    await expect(results.getByRole('group', { name: 'On the canvas' }).getByRole('option')).toHaveText(['Kelp forests are the next survey']);
    await shot(page, 'tags-search');
    await results.getByRole('group', { name: 'On the canvas' }).getByRole('option').click();
  });

  await test.step('Tags are renamed, recoloured, filed in categories, merged and deleted, and undo brings them back', async () => {
    await page.getByRole('button', { name: 'Filter by tag' }).first().click();
    await page.getByRole('menuitem', { name: 'Manage tags…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tags' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name of Climate' }).fill('Climate change');
    await dialog.getByRole('textbox', { name: 'Name of Climate' }).press('Enter');
    await expect(chips(card(page, 'Coral reefs occupy'))).toHaveText(['Reefs', 'Climate change']);
    await dialog.getByRole('group', { name: 'Colour of Reefs' }).getByRole('button', { name: 'blue', exact: true }).click();
    await expect(chips(card(page, 'Coral reefs occupy')).first()).toHaveAttribute('style', /--tag: var\(--hl-blue\)/);
    await dialog.getByRole('combobox', { name: 'Category of Reefs' }).fill('Topics');
    await dialog.getByRole('combobox', { name: 'Category of Reefs' }).press('Enter');
    await expect(dialog.getByRole('region', { name: 'Topics' })).toContainText('1');
    await dialog.getByRole('textbox', { name: 'New tag' }).fill('Mangroves');
    await dialog.getByRole('button', { name: 'Add' }).click();
    await dialog.getByRole('textbox', { name: 'New tag' }).fill('reefs');
    await dialog.getByRole('button', { name: 'Add' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('There is a tag named “reefs” already.');
    await shot(page, 'tags-manager');
    await dialog.getByRole('combobox', { name: 'Merge Kelp into' }).selectOption({ label: 'Reefs' });
    await expect(chips(note(page, 'Kelp forests are the next survey'))).toHaveText(['Reefs']);
    await expect(dialog.getByRole('textbox', { name: 'Name of Kelp' })).toHaveCount(0);
    page.once('dialog', (d) => void d.accept());
    await dialog.getByRole('button', { name: 'Delete tag Climate change' }).click();
    await expect(chips(card(page, 'Coral reefs occupy'))).toHaveText(['Reefs']);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(chips(card(page, 'Coral reefs occupy'))).toHaveText(['Reefs', 'Climate change']);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(chips(note(page, 'Kelp forests are the next survey'))).toHaveText(['Kelp']);
  });

  await test.step('Tags are kept through a reload', async () => {
    await page.waitForTimeout(500);
    await page.reload();
    await expect(chips(card(page, 'Coral reefs occupy'))).toHaveText(['Reefs', 'Climate change']);
    await expect(chips(note(page, 'Kelp forests are the next survey'))).toHaveText(['Kelp']);
  });

  await test.step('Every notes export lists the tags, as they are searched for', async () => {
    const md = await exportText(page, 'Markdown (.md)', 'md');
    expect(md).toMatch(/> \(Reef essay, p\. 1\)\n\nTags: #Reefs #Climate-change\n/);
    expect(md).toContain('Kelp forests are the next survey\n\nTags: #Kelp');
    expect(md).toMatch(/- p\. 1: Rising sea temperatures[^\n]*\n {2}Comment: Threshold\?\n {2}Tags: #Climate-change/);
    for (const [label, ext] of [
      ['PDF (.pdf)', 'pdf'],
      ['Word (.docx)', 'docx'],
    ] as const) {
      const text = await exportText(page, label, ext);
      expect(text, ext).toContain('Tags: #Reefs #Climate-change');
      expect(text, ext).toContain('Tags: #Kelp');
    }
  });
});

test('a project from before tags opens, takes tags, and a backup keeps them', async ({ page }) => {
  await openProject(page);
  await page.waitForTimeout(500);
  // Saved as an older Gloss would have saved it, with no list of tags.
  await page.evaluate(
    () =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open('gloss');
        open.onsuccess = () => {
          const store = open.result.transaction('projects', 'readwrite').objectStore('projects');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const p of all.result) {
              delete p.tags;
              store.put(p);
            }
            store.transaction.oncomplete = () => done();
          };
        };
        open.onerror = () => fail(open.error);
      }),
  );
  await page.reload();
  await select(page, 'The ocean covers');
  await selection(page).getByRole('button', { name: 'Highlight with tag' }).click();
  await tagWith(page, 'Oceans');
  await picker(page).getByRole('button', { name: 'Done' }).click();
  await openHighlight(page, 'The ocean covers');
  await toolbar(page).getByRole('button', { name: 'Excerpt' }).click();
  await expect(chips(card(page, 'The ocean covers'))).toHaveText(['Oceans']);
  await page.waitForTimeout(500);

  await page.goto('/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up Reef essay' }).click()]);
  const file = `${ARTIFACTS}/Tagged reef essay.gloss`;
  copyFileSync(await download.path(), file);
  page.once('dialog', (d) => void d.accept());
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore a backup' }).click()]);
  await chooser.setFiles({ name: 'Reef essay.gloss', mimeType: 'application/octet-stream', buffer: readFileSync(file) });
  await expect(chips(card(page, 'The ocean covers'))).toHaveText(['Oceans']);
});

test('on a phone, a highlight is tagged from its toolbar, with the picker on the screen', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await openProject(page);
  const span = page.locator('.textLayer span', { hasText: 'Coral reefs occupy' }).first();
  await span.scrollIntoViewIfNeeded();
  const box = (await span.boundingBox())!;
  // A tap tells the pane a finger is in use; the selection a long press would make is then made directly.
  await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
  await page.evaluate(() => {
    const span = [...document.querySelectorAll('.textLayer span')].find((s) => s.textContent?.includes('Coral reefs occupy'))!;
    const range = document.createRange();
    range.selectNodeContents(span);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await expect(selection(page)).toBeVisible();
  await selection(page).getByRole('button', { name: 'Highlight with tag' }).tap();
  await tagWith(page, 'Reefs');
  const r = (await picker(page).boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(390);
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => (document.documentElement.dataset.theme = s), scheme);
    await page.waitForTimeout(300);
    await shot(page, `tags-phone-${scheme}`);
  }
  await context.close();
});
