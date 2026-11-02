import { expect, test, type Page } from '@playwright/test';
import { pdf, shot } from './helpers';

/** Starts a project from one PDF and comes back to the start page. */
async function addProject(page: Page, name: string) {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open files' }).click()]);
  await chooser.setFiles(await pdf(`${name}.pdf`, [[`${name}: notes from the reef.`]]));
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(name);
  await page.goto('/');
}

const projects = (page: Page) => page.getByRole('region', { name: 'Your projects' });
const folder = (page: Page, name: string) => projects(page).getByRole('region', { name, exact: true });
/** A folder's heading, which opens and closes it and is named with its count. */
const toggle = (page: Page, name: string) => folder(page, name).getByRole('button', { name: new RegExp(`^${name} \\d+ projects?$`) });
const top = (page: Page) => projects(page).getByRole('list', { name: 'Not in a folder' });
/** Checks the projects listed in a place, in order. */
const listed = (where: ReturnType<typeof projects>, expected: string[]) => expect(where.locator('li strong')).toHaveText(expected);

test('folders hold projects, moved by menu and by dragging, kept across reloads, and deleting one keeps its projects', async ({ page }) => {
  for (const name of ['Kelp study', 'Reef survey', 'Tide notes']) await addProject(page, name);
  // Most recently opened first; opening one brings it to the front.
  await listed(projects(page), ['Tide notes', 'Reef survey', 'Kelp study']);
  await page.getByRole('link', { name: /Kelp study/ }).click();
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.goto('/');
  await listed(projects(page), ['Kelp study', 'Tide notes', 'Reef survey']);

  // A new folder starts with its name ready to type.
  await projects(page).getByRole('button', { name: 'New folder', exact: true }).click();
  const naming = page.getByRole('textbox', { name: 'Folder name' });
  await expect(naming).toBeFocused();
  await naming.fill('Thesis');
  await naming.press('Enter');
  await expect(folder(page, 'Thesis')).toContainText('Drag a project here');
  await expect(toggle(page, 'Thesis')).toHaveAccessibleName('Thesis 0 projects');

  await page.getByRole('button', { name: 'Move Reef survey to a folder' }).click();
  await page.getByRole('menu', { name: 'Move Reef survey' }).getByRole('menuitemradio', { name: 'Thesis' }).click();
  await listed(folder(page, 'Thesis'), ['Reef survey']);

  await page.locator('.projects li', { hasText: 'Tide notes' }).dragTo(toggle(page, 'Thesis'));
  await listed(folder(page, 'Thesis'), ['Tide notes', 'Reef survey']);
  await expect(toggle(page, 'Thesis')).toHaveAccessibleName('Thesis 2 projects');
  await listed(top(page), ['Kelp study']);
  await shot(page, 'library-folders');

  // A second folder, made from a project's own menu, which files the project in it.
  await page.getByRole('button', { name: 'Move Kelp study to a folder' }).click();
  await page.getByRole('menu', { name: 'Move Kelp study' }).getByRole('menuitem', { name: 'New folder…' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Reading');
  await page.getByRole('textbox', { name: 'Folder name' }).press('Enter');
  await listed(folder(page, 'Reading'), ['Kelp study']);
  await expect(top(page)).toHaveCount(0);

  // Dragged out of its folder, onto the top level that appears while dragging.
  const kelp = page.locator('.projects li', { hasText: 'Kelp study' });
  await kelp.hover();
  await page.mouse.down();
  await page.mouse.move(400, 200, { steps: 5 });
  await expect(top(page)).toBeVisible();
  const zone = (await top(page).boundingBox())!;
  await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 5 });
  await page.mouse.up();
  await listed(top(page), ['Kelp study']);
  await expect(folder(page, 'Reading')).toContainText('Drag a project here');

  // Collapsed, renamed, and still so after a reload.
  await toggle(page, 'Thesis').click();
  await expect(folder(page, 'Thesis').locator('.projects')).toHaveCount(0);
  await folder(page, 'Thesis').getByRole('button', { name: 'Actions for Thesis' }).click();
  await page.getByRole('menu', { name: 'Thesis' }).getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Thesis chapters');
  await page.getByRole('textbox', { name: 'Folder name' }).press('Enter');
  await expect(toggle(page, 'Thesis chapters')).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await expect(toggle(page, 'Thesis chapters')).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page, 'Thesis chapters')).toHaveAccessibleName('Thesis chapters 2 projects');
  await toggle(page, 'Thesis chapters').click();
  await listed(folder(page, 'Thesis chapters'), ['Tide notes', 'Reef survey']);

  // Deleting a folder keeps its projects, at the top level.
  let asked = '';
  page.once('dialog', (d) => ((asked = d.message()), d.accept()));
  await folder(page, 'Thesis chapters').getByRole('button', { name: 'Actions for Thesis chapters' }).click();
  await page.getByRole('menu', { name: 'Thesis chapters' }).getByRole('menuitem', { name: 'Delete folder' }).click();
  expect(asked).toBe('Delete the folder “Thesis chapters”? Its 2 projects move out of it and are kept.');
  await expect(folder(page, 'Thesis chapters')).toHaveCount(0);
  await listed(top(page), ['Kelp study', 'Tide notes', 'Reef survey']);
  // An empty folder goes without asking.
  await folder(page, 'Reading').getByRole('button', { name: 'Actions for Reading' }).click();
  await page.getByRole('menu', { name: 'Reading' }).getByRole('menuitem', { name: 'Delete folder' }).click();
  await expect(projects(page).locator('.folder')).toHaveCount(0);
  await page.reload();
  await listed(projects(page), ['Kelp study', 'Tide notes', 'Reef survey']);
});

test('the library looks right in both themes on a desktop and a phone', async ({ browser }) => {
  for (const [label, options] of [
    ['desktop', { viewport: { width: 1280, height: 900 } }],
    ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ] as const) {
    // One set of projects per device, shown in both themes: making them is the slow part.
    const context = await browser.newContext(options);
    const page = await context.newPage();
    for (const name of ['Coral bleaching in the shallow reef', 'Kelp study']) await addProject(page, name);
    await page.getByRole('button', { name: 'Move Kelp study to a folder' }).click();
    await page.getByRole('menuitem', { name: 'New folder…' }).click();
    await page.getByRole('textbox', { name: 'Folder name' }).fill('Field seasons 2025 and 2026');
    await page.getByRole('textbox', { name: 'Folder name' }).press('Enter');
    await projects(page).getByRole('button', { name: 'New folder', exact: true }).click();
    await page.getByRole('textbox', { name: 'Folder name' }).press('Enter');
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      // Nothing is wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(options.viewport.width);
      await projects(page).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Move Coral bleaching in the shallow reef to a folder' }).click();
      // Colours ease over 150 ms.
      await page.waitForTimeout(300);
      await shot(page, `library-${label}-${theme}`);
      await page.keyboard.press('Escape');
    }
    await context.close();
  }
});

test('projects saved before folders existed are listed, sorted by their last edit, and can be filed', async ({ page }) => {
  // The first version of the database, as an older Gloss left it.
  await page.route('**/seed', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  await page.goto('/seed');
  await page.evaluate(
    () =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open('gloss', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('projects', { keyPath: 'id' });
          open.result.createObjectStore('files');
        };
        open.onsuccess = () => {
          const tx = open.result.transaction('projects', 'readwrite');
          const project = (id: string, name: string, at: number) => ({ id, name, createdAt: at, updatedAt: at, docs: [], highlights: [], cards: [], links: [] });
          tx.objectStore('projects').put(project('a', 'Older project', Date.now() - 86_400_000 * 3));
          tx.objectStore('projects').put(project('b', 'Newer project', Date.now() - 3_600_000));
          tx.oncomplete = () => (open.result.close(), done());
          tx.onerror = () => fail(tx.error);
        };
      }),
  );
  await page.goto('/');
  await listed(projects(page), ['Newer project', 'Older project']);
  await expect(projects(page).locator('li', { hasText: 'Older project' })).toContainText('3 days ago');
  await page.getByRole('button', { name: 'Move Older project to a folder' }).click();
  await page.getByRole('menuitem', { name: 'New folder…' }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).press('Enter');
  await listed(folder(page, 'New folder'), ['Older project']);
});

/** What a browser kept from an older Gloss: the database at `version` with these stores and records. */
type Old = { version: number; stores: string[]; projects: object[]; folders?: object[]; files?: Record<string, string>; trash?: Record<string, string> };

/** Sets up an older database before the app first opens it, from a page of the same site that does not run the app. */
async function olderDatabase(page: Page, old: Old) {
  await page.goto('/manifest.webmanifest');
  await page.evaluate(
    (old) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open('gloss', old.version);
        open.onupgradeneeded = () => {
          const d = open.result;
          for (const name of old.stores) d.createObjectStore(name, name === 'projects' || name === 'folders' ? { keyPath: 'id' } : undefined);
        };
        open.onsuccess = () => {
          const d = open.result;
          const tx = d.transaction(old.stores, 'readwrite');
          for (const p of old.projects) tx.objectStore('projects').put(p);
          for (const f of old.folders ?? []) tx.objectStore('folders').put(f);
          for (const [k, v] of Object.entries(old.files ?? {})) tx.objectStore('files').put(new Blob([v]), k);
          for (const [k, v] of Object.entries(old.trash ?? {})) tx.objectStore('trash').put(v, k);
          tx.oncomplete = () => (d.close(), done());
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    old,
  );
}

const stores = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ version: number; names: string[]; openedAt: unknown[]; files: string[] }>((done) => {
        const open = indexedDB.open('gloss');
        open.onsuccess = () => {
          const d = open.result;
          const names = [...d.objectStoreNames];
          const tx = d.transaction(['projects', 'files']);
          const projects = tx.objectStore('projects').getAll();
          const files = tx.objectStore('files').getAllKeys();
          tx.oncomplete = () => (done({ version: d.version, names, openedAt: projects.result.map((p) => p.openedAt), files: files.result as string[] }), d.close());
        };
      }),
  );

const record = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  createdAt: 1,
  updatedAt: 1000,
  docs: [],
  highlights: [],
  cards: [],
  links: [],
  inks: [],
  folds: [],
  canvases: [{ id: 'main', name: 'Canvas' }],
  comments: [],
  passageLinks: [],
  cardLinks: [],
  ...extra,
});

test('a database from either earlier version 2, or from version 1, is brought up to date with its projects, folders and trash', async ({ browser }) => {
  const all = ['files', 'folders', 'projects', 'trash'];
  const cases: [string, Old][] = [
    ['version 1', { version: 1, stores: ['projects', 'files'], projects: [record('p1', 'From version 1')] }],
    [
      'version 2 with folders',
      {
        version: 2,
        stores: ['projects', 'files', 'folders'],
        projects: [record('p2', 'Filed away', { folder: 'f1', openedAt: 5000 })],
        folders: [{ id: 'f1', name: 'Old folder', createdAt: 1 }],
      },
    ],
    [
      'version 2 with the trash',
      {
        version: 2,
        stores: ['projects', 'files', 'trash'],
        projects: [record('p3', 'With a removed document')],
        files: { gone: 'a removed document' },
        trash: { gone: 'p3' },
      },
    ],
  ];
  for (const [label, old] of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await olderDatabase(page, old);
    await page.goto('/');
    const name = (old.projects[0] as { name: string }).name;
    await expect(page.getByRole('link', { name: new RegExp(name) }), label).toBeVisible();
    const now = await stores(page);
    expect(now.version, label).toBe(3);
    expect(now.names.sort(), label).toEqual(all);
    // Projects from before the library kept when they were opened are sorted by their last edit.
    expect(now.openedAt, label).toEqual([(old.projects[0] as { openedAt?: number }).openedAt ?? 1000]);
    if (old.folders) await expect(projects(page).getByRole('region', { name: 'Old folder', exact: true }), label).toContainText(name);
    if (old.trash) {
      // The file put aside is still there until the project opens with no history to bring it back.
      expect(now.files, label).toEqual(['gone']);
      await page.getByRole('link', { name: new RegExp(name) }).click();
      await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(name);
      await expect.poll(async () => (await stores(page)).files, label).toEqual([]);
    }
    await context.close();
  }
});
