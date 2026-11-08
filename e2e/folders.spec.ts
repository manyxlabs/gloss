import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ARTIFACTS, card, exportNotes, fromToolbar, openProject, pdf, PHONE, picture, select, shot } from './helpers';
import { ESSAY, makePdf, NOTES } from './pdfs';

/**
 * A folder as a reader keeps one: a PDF at the top, two chapters with a PDF, a picture in a
 * folder inside the first and notes in the second, a spreadsheet Gloss cannot open, and hidden
 * files the system leaves behind.
 */
async function researchFolder(page: Page) {
  const root = join(mkdtempSync(join(tmpdir(), 'gloss-folder-')), 'Research');
  const put = (path: string, data: string | Buffer) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  put('Overview.pdf', await makePdf([['An overview of the reef survey, written before the first dive.']]));
  put('Chapter 1/Reef essay.pdf', await makePdf([['Coral reefs occupy less than one percent of the ocean floor.']]));
  put('Chapter 1/Figures/Transect.png', await picture(page, 320, 200, '#2a7ab8', 'image/png'));
  put('Chapter 2/Field notes.md', '# Field notes\n\nThe kelp forest was dense on the northern transect.\n');
  put('Chapter 2/readings.csv', 'depth,temperature\n4,27.1\n');
  put('.DS_Store', 'junk');
  put('Chapter 2/.cache/old.pdf', await makePdf([['A hidden copy.']]));
  return root;
}

/** Drops files or folders from disk on an element, as the system does when they are dragged in from a file manager. */
async function drop(page: Page, target: Locator, paths: string[]) {
  const box = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  // The middle of the part on screen: a drop past the window's edge reaches nothing.
  const { height } = page.viewportSize()!;
  const top = Math.max(box.y, 0);
  const at = { x: box.x + box.width / 2, y: (top + Math.min(box.y + box.height, height)) / 2 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const)
    await cdp.send('Input.dispatchDragEvent', { type, ...at, data: { items: [], files: paths, dragOperationsMask: 1 } });
}

async function chooseFolder(page: Page, button: Locator, folder: string) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
  await chooser.setFiles(folder);
}

const choice = (page: Page) => page.getByRole('dialog', { name: 'Open “Research”' });
const docTabs = (page: Page) => page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab');
const projectName = (page: Page) => page.getByRole('textbox', { name: 'Project name' });
const SKIPPED = 'Not added, as Gloss cannot open it: Research/Chapter 2/readings.csv.';

/** Each folder of the open project's list of documents, in order, with the documents in it. */
async function docFolders(page: Page) {
  await page.getByRole('button', { name: 'All documents' }).click();
  const list = page.getByRole('dialog', { name: 'All documents' });
  await expect(list).toBeVisible();
  return list
    .locator('.doc-group')
    .evaluateAll((all) =>
      all.map((g) => [g.querySelector('.folder-toggle .title, .doc-group-name')?.textContent ?? '', ...[...g.querySelectorAll('.doc-row .title')].map((t) => t.textContent)]),
    );
}

test('a folder dropped on the start page becomes one project, its folders becoming folders of documents', async ({ page }) => {
  await page.goto('/');
  const folder = await researchFolder(page);
  await drop(page, page.locator('.library'), [folder]);
  await expect(choice(page)).toContainText('3 projects');
  // Colours ease over 150 ms.
  await page.waitForTimeout(300);
  await shot(page, 'folder-choice-desktop-light');
  await choice(page)
    .getByRole('button', { name: /One project/ })
    .click();

  await expect(projectName(page)).toHaveValue('Research', { timeout: 20_000 });
  // The spreadsheet is named as left out; the hidden files are neither added nor mentioned.
  await expect(page.getByRole('alert')).toContainText(SKIPPED);
  await expect(docTabs(page)).toHaveText(['Overview', 'Reef essay', 'Transect', 'Field notes']);
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  expect(await docFolders(page)).toEqual([
    ['Chapter 1', 'Reef essay'],
    ['Chapter 1 / Figures', 'Transect'],
    ['Chapter 2', 'Field notes'],
    ['Not in a folder', 'Overview'],
  ]);
  await shot(page, 'folder-one-project');
});

test('a folder chosen on the start page becomes a project for each folder in it, or nothing when the choice is cancelled', async ({ page }) => {
  await page.goto('/');
  const folder = await researchFolder(page);
  const open = page.getByRole('button', { name: 'Open a folder' });
  await chooseFolder(page, open, folder);
  await choice(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(choice(page)).toHaveCount(0);
  await expect(open).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Your projects' })).toHaveCount(0);

  await chooseFolder(page, open, folder);
  await choice(page)
    .getByRole('button', { name: /A project for each folder/ })
    .click();
  const projects = page.getByRole('region', { name: 'Your projects' });
  // The files at the top of the folder make a project named after it.
  await expect(projects.locator('li strong')).toHaveText(['Chapter 2', 'Chapter 1', 'Research'], { timeout: 20_000 });
  await expect(page.getByRole('alert')).toHaveText(SKIPPED);
  await shot(page, 'folder-many-projects');

  await projects.getByRole('link', { name: /Chapter 1/ }).click();
  await expect(projectName(page)).toHaveValue('Chapter 1');
  expect(await docFolders(page)).toEqual([
    ['Figures', 'Transect'],
    ['Not in a folder', 'Reef essay'],
  ]);
});

test('a folder dropped into a project shows its progress, lands in folders of documents, and comes out again in one undo', async ({ page }) => {
  await openProject(page);
  const folder = await researchFolder(page);
  // Typesetting the notes waits on its fonts, held here to see the progress part way.
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/fonts/**', async (route) => (await held, route.continue()));

  await drop(page, page.locator('.doc-pane'), [folder]);
  const progress = page.getByRole('status').filter({ hasText: 'Adding files' });
  await expect(progress).toHaveText(/^Adding files: [1-3] of 4$/);
  await expect(progress.getByRole('progressbar', { name: 'Adding files' })).toBeVisible();
  await shot(page, 'folder-progress-desktop');
  release();
  await expect(progress).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole('alert')).toContainText(SKIPPED);
  await expect(docTabs(page)).toHaveCount(6);
  expect(await docFolders(page)).toEqual([
    ['Research', 'Overview'],
    ['Research / Chapter 1', 'Reef essay'],
    ['Research / Chapter 1 / Figures', 'Transect'],
    ['Research / Chapter 2', 'Field notes'],
    ['Not in a folder', 'Reef essay', 'Survey notes'],
  ]);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(docTabs(page)).toHaveText(['Reef essay', 'Survey notes']);
  expect(await docFolders(page)).toEqual([['', 'Reef essay', 'Survey notes']]);

  // Chosen from the list of documents instead, it lands the same.
  await chooseFolder(page, page.getByRole('button', { name: 'Add a folder of files' }), folder);
  await expect(docTabs(page)).toHaveCount(6, { timeout: 20_000 });
});

/** Stands in for the system's share sheet, keeping what it is given; `refuse` refuses the first share, as a browser does once a tap is too long ago. */
async function shareSheet(page: Page, refuse = false) {
  await page.addInitScript((refuse) => {
    const shared: { name: string; type: string; head: string }[] = [];
    Object.assign(window, { shared });
    navigator.canShare = (data) => !!data?.files?.length;
    navigator.share = async (data) => {
      if (refuse) {
        refuse = false;
        throw new DOMException('The request is not allowed.', 'NotAllowedError');
      }
      for (const f of data?.files ?? []) shared.push({ name: f.name, type: f.type, head: await f.slice(0, 16).text() });
    };
  }, refuse);
}
const shared = (page: Page) => page.evaluate(() => (window as unknown as { shared: { name: string; type: string; head: string }[] }).shared);

async function excerptSomething(page: Page) {
  await select(page, 'Coral reefs occupy');
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await expect(card(page, 'Coral reefs')).toBeVisible();
}

test('a document, its annotated PDF, the notes and documents combined are sent to another app through the share sheet', async ({ page }) => {
  await shareSheet(page);
  await openProject(page);
  await excerptSomething(page);

  await page.getByRole('button', { name: 'More for this document' }).click();
  await shot(page, 'send-doc-menu');
  await page.getByRole('menuitem', { name: 'Send document…' }).click();
  await expect.poll(() => shared(page)).toEqual([{ name: 'Reef essay.pdf', type: 'application/pdf', head: expect.stringMatching(/^%PDF-/) }]);

  await page.getByRole('button', { name: 'More for this document' }).click();
  await page.getByRole('menuitem', { name: 'Send with annotations…' }).click();
  await expect.poll(async () => (await shared(page)).at(-1)?.name).toBe('Reef essay (annotated).pdf');

  await page.getByRole('button', { name: 'Export notes' }).click();
  await page.waitForTimeout(300);
  await shot(page, 'send-notes-menu-desktop');
  await page.getByRole('group', { name: 'Send' }).getByRole('menuitem', { name: 'Markdown (.md)' }).click();
  await expect.poll(async () => (await shared(page)).at(-1)).toEqual({ name: 'Reef essay.md', type: 'text/markdown', head: expect.stringMatching(/^# Reef essay\n/) });

  await page.getByRole('button', { name: 'Export notes' }).click();
  await page.getByRole('menuitem', { name: 'Documents as one PDF…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export documents as one PDF' });
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect.poll(async () => (await shared(page)).at(-1)?.name).toBe('Reef essay (combined).pdf');
  await expect(dialog).toHaveCount(0);
  expect((await shared(page)).length).toBe(4);
});

test('a file that took too long to make is sent from a tap on its notice, and where files cannot be shared it is saved', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await shareSheet(page, true);
  await openProject(page);
  await page.getByRole('button', { name: 'More for this document' }).click();
  await page.getByRole('menuitem', { name: 'Send with annotations…' }).click();
  const notice = page.getByRole('status').filter({ hasText: 'is ready' });
  await expect(notice).toHaveText('“Reef essay (annotated).pdf” is ready. Send');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
    await page.waitForTimeout(300);
    await shot(page, `send-ready-phone-${theme}`);
  }
  await notice.getByRole('button', { name: 'Send' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(async () => (await shared(page)).map((s) => s.name)).toEqual(['Reef essay (annotated).pdf']);
  await context.close();

  // A browser with no share sheet for files, as on most desktops, saves it instead.
  const desk = await browser.newPage();
  await desk.addInitScript(() => {
    delete (Navigator.prototype as Partial<Navigator>).share;
    delete (Navigator.prototype as Partial<Navigator>).canShare;
  });
  await openProject(desk);
  await desk.getByRole('button', { name: 'More for this document' }).click();
  const [download] = await Promise.all([desk.waitForEvent('download'), desk.getByRole('menuitem', { name: 'Send document…' }).click()]);
  expect(download.suggestedFilename()).toBe('Reef essay.pdf');
  await download.saveAs(`${ARTIFACTS}/sent-fallback.pdf`);
  expect(readFileSync(`${ARTIFACTS}/sent-fallback.pdf`).subarray(0, 5).toString()).toBe('%PDF-');
  await desk.close();
});

// The share arrives through the service worker, which the other tests leave out.
test.describe(() => {
  test.use({ serviceWorkers: 'allow' });

  test('files shared to the installed app from another app open as a project', async ({ page, request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.share_target).toEqual({
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { files: [{ name: 'files', accept: expect.arrayContaining(['application/pdf', '.pdf', '.docx', '.pptx', '.md', 'image/*']) }] },
    });
    writeFileSync(`${ARTIFACTS}/manifest.webmanifest`, JSON.stringify(manifest, null, 2));

    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
    // A share sheet hands the files over as this form does.
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<form method="post" action="/share" enctype="multipart/form-data"><input type="file" name="files" multiple></form>'),
    );
    await page.locator('form[action="/share"] input').setInputFiles([await pdf('Reef essay.pdf', ESSAY), await pdf('Survey notes.pdf', NOTES)]);
    await page.locator('form[action="/share"]').evaluate((f: HTMLFormElement) => f.submit());

    await expect(projectName(page)).toHaveValue('Reef essay', { timeout: 20_000 });
    await expect(docTabs(page)).toHaveText(['Reef essay', 'Survey notes']);
    expect(new URL(page.url()).search).toBe('');
    // Taken once: the start page does not open them again.
    expect(await page.evaluate(async () => (await (await caches.open('gloss-shared')).keys()).length)).toBe(0);
  });
});

test('folder import and sending look right on a desktop, a tablet and a phone, in both themes', async ({ browser }) => {
  // Three devices, each importing a folder and exporting, take a while on a machine busy with other tests.
  test.setTimeout(120_000);
  for (const [label, options] of [
    ['desktop', { viewport: { width: 1280, height: 800 } }],
    ['tablet', { viewport: { width: 820, height: 1180 }, hasTouch: true }],
    ['phone', PHONE],
  ] as const) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto('/');
    const folder = await researchFolder(page);
    await chooseFolder(page, page.getByRole('button', { name: 'Open a folder' }), folder);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      // Nothing is wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(options.viewport.width);
      await page.waitForTimeout(300);
      await shot(page, `folder-choice-${label}-${theme}`);
    }
    await choice(page)
      .getByRole('button', { name: /A project for each folder/ })
      .click();
    await expect(page.getByRole('region', { name: 'Your projects' }).locator('li strong')).toHaveCount(3, { timeout: 20_000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(options.viewport.width);
      await page.waitForTimeout(300);
      await shot(page, `folder-library-${label}-${theme}`);
    }

    await page.getByRole('link', { name: /Chapter 1/ }).click();
    await expect(page.locator('.doc-status')).toBeVisible({ timeout: 20_000 });
    await excerptSomething(page);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      await exportNotes(page);
      await page.waitForTimeout(300);
      await shot(page, `send-notes-menu-${label}-${theme}`);
      await page.getByRole('menuitem', { name: 'Documents as one PDF…' }).click();
      await page.waitForTimeout(300);
      await shot(page, `send-combined-${label}-${theme}`);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('button', { name: 'More for this document' }).click();
      await page.waitForTimeout(300);
      await shot(page, `send-doc-menu-${label}-${theme}`);
      await page.keyboard.press('Escape');
    }
    await context.close();
  }
});

/** What the notices on show cover of the controls around them: nothing, when they are placed right. */
const covered = (page: Page) =>
  page.evaluate(() => {
    const boxes = (selector: string) => [...document.querySelectorAll(selector)].map((e) => [selector, e.getBoundingClientRect()] as const).filter(([, b]) => b.width && b.height);
    const toasts = boxes('.toast');
    const controls = ['.react-flow__minimap', '.react-flow__controls', '.doc-status', '.canvas-tools', '.problems', '.switch', '.bar'].flatMap(boxes);
    return toasts.flatMap(([, t]) =>
      controls.flatMap(([name, c]) => (Math.min(t.right, c.right) > Math.max(t.left, c.left) && Math.min(t.bottom, c.bottom) > Math.max(t.top, c.top) ? [name] : [])),
    );
  });

/** What the notices on show lie over of what is open beneath them: nothing, as they sit under menus, panels and banners. */
const over = (page: Page, selectors: string[]) =>
  page.evaluate((selectors) => {
    const toasts = [...document.querySelectorAll('.toast')];
    // Notices let the pointer through, so for this they are made to stop it, to find what is on top.
    const stack = document.querySelector<HTMLElement>('.toasts')!;
    stack.style.pointerEvents = 'auto';
    const found = selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)].flatMap((c) => {
        const a = c.getBoundingClientRect();
        return toasts.flatMap((t) => {
          const b = t.getBoundingClientRect();
          const [left, right, top, bottom] = [Math.max(a.left, b.left), Math.min(a.right, b.right), Math.max(a.top, b.top), Math.min(a.bottom, b.bottom)];
          return right > left && bottom > top && t.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)) ? [selector] : [];
        });
      }),
    );
    stack.style.pointerEvents = '';
    return found;
  }, selectors);

test('notices never cover the canvas minimap or any controls, and a slow export shows it is being made', async ({ browser }) => {
  // Three devices, each making exports, take a while on a machine busy with other tests.
  test.setTimeout(120_000);
  for (const [label, options] of [
    ['desktop', { viewport: { width: 1280, height: 800 } }],
    ['tablet', { viewport: { width: 820, height: 1180 }, hasTouch: true }],
    ['phone', PHONE],
  ] as const) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await shareSheet(page, true);
    await openProject(page);
    await excerptSomething(page);
    await page.getByRole('button', { name: 'More for this document' }).click();
    await page.getByRole('menuitem', { name: 'Send with annotations…' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'is ready' })).toBeVisible();

    // The notes PDF waits on its fonts, held here to see it being made.
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/fonts/**', async (route) => (await held, route.continue()));
    await exportNotes(page);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('group', { name: 'Download' }).getByRole('menuitem', { name: 'PDF (.pdf)' }).click();
    const making = page.getByRole('status').filter({ hasText: 'Making the notes…' });
    await expect(making.getByRole('progressbar', { name: 'Making the notes…' })).toBeVisible();

    const views = label === 'desktop' ? [''] : ['Document', 'Canvas'];
    for (const view of views) {
      if (view)
        await page
          .getByRole('tablist', { name: 'Show' })
          .getByRole('tab', { name: new RegExp(`^${view}`) })
          .click();
      if (label === 'desktop') await expect(page.getByRole('img', { name: 'Map of the canvas' })).toBeVisible();
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
        await page.waitForTimeout(300);
        expect(await covered(page)).toEqual([]);
        await shot(page, `notices-${label}${view ? `-${view.toLowerCase()}` : ''}-${theme}`);
      }
      if (view === 'Canvas') continue;
      // What opens from the document's toolbar stays above the notices.
      await expect(await fromToolbar(page, 'Page colours', 'More document tools')).toBeVisible();
      expect(await over(page, ['.menu', '.doc-banners > *'])).toEqual([]);
      await page.keyboard.press('Escape');
      const squeeze = page.getByRole('button', { name: 'Squeeze around highlights or words' });
      if (await squeeze.isVisible()) await squeeze.click();
      else {
        await page.getByRole('button', { name: 'More for this document' }).click();
        await page.getByRole('menuitem', { name: 'Squeeze and defined terms…' }).click();
      }
      await expect(page.getByRole('dialog', { name: 'Squeeze the document' })).toBeVisible();
      expect(await over(page, ['.collapse-panel'])).toEqual([]);
      await shot(page, `notices-${label}-squeeze`);
      await page.keyboard.press('Escape');
    }
    release();
    expect((await downloaded).suggestedFilename()).toBe('Reef essay.pdf');
    await expect(making).toHaveCount(0);

    // On the start page, the notice still on show keeps clear of the links under the start buttons and the footer.
    await page.getByRole('link', { name: 'All projects' }).click();
    await expect(page.getByRole('button', { name: 'Restore a backup' })).toBeVisible();
    // The page grows as its projects load and as it makes room for the notice, so it is scrolled to its foot until it settles.
    await expect
      .poll(async () => {
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        return over(page, ['.more', '.foot']);
      })
      .toEqual([]);
    await shot(page, `notices-${label}-start-page`);
    await context.close();
  }
});
