import { writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { noteCard } from './cards';
import { ARTIFACTS, openProject, select, shot } from './helpers';

type Device = Awaited<ReturnType<typeof device>>;

/** A browser context as one device, recording what it sent: WebSocket frames, and files put to or deleted from the room. */
async function device(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const wire = { sent: [] as Buffer[], puts: [] as string[], deletes: [] as string[] };
  page.on('websocket', (ws) => ws.on('framesent', (f) => wire.sent.push(Buffer.from(f.payload))));
  page.on('request', (r) => {
    if (r.url().includes('/files/') && r.method() === 'PUT') wire.puts.push(r.url());
    if (r.url().includes('/files/') && r.method() === 'DELETE') wire.deletes.push(r.url());
  });
  return { context, page, wire };
}

/** Turns Only on this device on or off for the document on show, from its menu. */
async function keepHere(page: Page) {
  await page.getByRole('button', { name: 'More for this document' }).click();
  await page.getByRole('menu', { name: 'More for this document' }).getByRole('menuitemcheckbox', { name: 'Only on this device' }).click();
}

const synced = (page: Page) => expect(page.getByRole('status').filter({ hasNotText: 'Gloss' })).toHaveText('Synced', { timeout: 15_000 });

async function share(a: Device, name: string) {
  await a.page.getByRole('button', { name: 'Share' }).click();
  const sharing = a.page.getByRole('dialog', { name: 'Share this project' });
  await sharing.getByRole('textbox', { name: 'Your name' }).fill(name);
  await sharing.getByRole('button', { name: 'Create link' }).click();
  const shared = a.page.getByRole('dialog', { name: 'This project is shared' });
  const link = await shared.getByRole('textbox', { name: 'Share link' }).inputValue();
  await expect(shared).toContainText('Only on this device');
  await shared.getByRole('button', { name: 'Done' }).click();
  await synced(a.page);
  return link;
}

async function join(b: Device, link: string, name: string) {
  await b.page.goto(link);
  const dialog = b.page.getByRole('dialog', { name: 'What should others call you?' });
  await dialog.getByRole('textbox', { name: 'Your name' }).fill(name);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await synced(b.page);
}

async function writeNote(page: Page, text: string, x: number, y: number) {
  const flow = (await page.locator('.canvas .flow').boundingBox())!;
  await page.mouse.dblclick(flow.x + x, flow.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.type(text);
  await page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height - 24);
}

/** This device's saved copy of the shared document, which holds everything it has sent or received, readable. */
const savedState = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((done) => {
        const open = indexedDB.open('gloss-sync');
        open.onsuccess = () => {
          const all = open.result.transaction('states').objectStore('states').getAll();
          all.onsuccess = () => done(all.result.map((s: { state: Uint8Array }) => new TextDecoder().decode(s.state)).join('\n'));
        };
      }),
  );

test('a document and a canvas kept on this device are never sent, and leave the other device when made private', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await device(browser);
  const b = await device(browser);
  await openProject(a.page);

  // Survey notes, an excerpt from it on the shared canvas, and a second canvas, all kept here.
  await a.page.getByRole('tab', { name: 'Survey notes' }).click();
  await select(a.page, 'Field notes from the reef survey');
  await a.page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
  await keepHere(a.page);
  await a.page.getByRole('button', { name: 'More for this document' }).click();
  await expect(a.page.getByRole('menuitemcheckbox', { name: 'Only on this device' })).toHaveAttribute('aria-checked', 'true');
  await shot(a.page, 'privacy-document-menu');
  await a.page.keyboard.press('Escape');
  await expect(a.page.getByRole('tab', { name: 'Survey notes' }).getByLabel('Only on this device')).toBeVisible();
  await a.page.getByRole('button', { name: 'New canvas' }).click();
  await writeNote(a.page, 'Secret plan', 200, 200);
  await a.page.getByRole('button', { name: 'Canvas style' }).click();
  await a.page.getByRole('dialog', { name: 'Canvas style' }).getByRole('switch', { name: 'Only on this device' }).click();
  await a.page.keyboard.press('Escape');
  await a.page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 1' }).click();
  await writeNote(a.page, 'Shared thought', 200, 420);
  await shot(a.page, 'privacy-marked');

  const link = await share(a, 'Ada');
  await join(b, link, 'Ben');
  await expect(b.page.getByRole('tab', { name: 'Reef essay' })).toBeVisible();
  await expect(noteCard(b.page, 'Shared thought')).toBeVisible();
  await expect(b.page.getByRole('tab', { name: 'Survey notes' })).toHaveCount(0);
  await expect(b.page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab')).toHaveCount(1);
  await expect(b.page.locator('.react-flow__node')).toHaveCount(1);
  await shot(b.page, 'privacy-other-device');

  // Nothing of them reached the room: one file went up, and the other device's whole copy of the shared document lacks them.
  expect(a.wire.puts).toHaveLength(1);
  const state = await savedState(b.page);
  for (const secret of ['Survey notes', 'Field notes from the reef survey', 'Secret plan', 'Canvas 2']) expect(state).not.toContain(secret);
  expect(state).toContain('Shared thought');

  // Made private while shared: asked first, then gone from the other device, file and all, and still here.
  a.page.once('dialog', (d) => (expect(d.message()).toContain('removed from everyone else’s copy'), d.accept()));
  await a.page.getByRole('tab', { name: 'Reef essay' }).click();
  await keepHere(a.page);
  await expect(b.page.getByRole('tab', { name: 'Reef essay' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => a.wire.deletes.length).toBe(1);
  await expect(a.page.getByRole('tab', { name: 'Reef essay' })).toBeVisible();
  await synced(a.page);

  // Shared again, it comes back, and so does the canvas.
  await keepHere(a.page);
  await expect(b.page.locator('.textLayer span', { hasText: 'The ocean covers' })).toBeVisible({ timeout: 15_000 });
  await a.page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 2' }).click();
  await a.page.getByRole('button', { name: 'Canvas style' }).click();
  await a.page.getByRole('dialog', { name: 'Canvas style' }).getByRole('switch', { name: 'Only on this device' }).click();
  await a.page.keyboard.press('Escape');
  await b.page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 2' }).click({ timeout: 15_000 });
  await expect(noteCard(b.page, 'Secret plan')).toBeVisible();
  await expect(b.page.getByRole('tab', { name: 'Survey notes' })).toHaveCount(0);

  // And it is undone like any change: the canvas goes from the other device again.
  await a.page.keyboard.press('Control+z');
  await expect(b.page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab')).toHaveCount(1, { timeout: 15_000 });
  await a.page.reload();
  await expect(a.page.getByRole('tablist', { name: 'Canvases' }).getByRole('tab', { name: 'Canvas 2' }).getByLabel('Only on this device')).toBeVisible();
  writeFileSync(`${ARTIFACTS}/privacy-wire.json`, JSON.stringify({ uploads: a.wire.puts.length, deletes: a.wire.deletes.length, frames: a.wire.sent.length }, null, 2));
  await a.context.close();
  await b.context.close();
});

test('a copied link works on the other device, and nested canvases, styles and ink boxes sync', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await device(browser);
  const b = await device(browser);
  await openProject(a.page);
  await select(a.page, 'Rising sea temperatures');
  await a.page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'More colours' }).click();
  await a.page.getByRole('dialog', { name: 'All colours' }).getByRole('button', { name: 'Highlight deep indigo' }).click();
  const link = await share(a, 'Ada');
  await join(b, link, 'Ben');

  const mark = a.page.locator('.page:not([data-copy]) .hl').first();
  const box = (await mark.boundingBox())!;
  await a.page.mouse.click(box.x + 20, box.y + box.height / 2);
  await a.page.getByRole('toolbar', { name: 'Highlight' }).getByRole('button', { name: 'Copy link to this passage' }).click();
  const passage = await a.page.evaluate(() => navigator.clipboard.readText());
  // The shared form, by room, which the other device can follow to its own copy.
  expect(passage).toMatch(/#\/s\/[\w-]{22}\/h\/[\w-]+$/);
  await b.page
    .locator('.doc-scroll')
    .first()
    .evaluate((el) => el.scrollTo(0, 3000));
  await b.page.goto(passage);
  await expect(b.page).toHaveURL(/#\/p\/[\w-]+$/);
  await expect(b.page.locator('.page:not([data-copy]) .hl.hl-deep-indigo.flash')).toBeVisible();

  // A nested canvas with a style and an ink box written in, made on one device, on the other.
  await a.page.getByRole('button', { name: 'Nested canvas' }).click();
  const name = a.page.getByRole('textbox', { name: 'Nested canvas name' });
  await name.fill('Ideas');
  await name.press('Enter');
  await a.page.getByRole('button', { name: 'Open', exact: true }).click();
  await a.page.getByRole('button', { name: 'Canvas style' }).click();
  await a.page.getByRole('dialog', { name: 'Canvas style' }).getByRole('button', { name: 'Grid' }).click();
  await a.page.keyboard.press('Escape');
  await a.page.getByRole('button', { name: 'Ink box' }).click();
  await a.page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'Pen' }).click();
  const sketch = (await a.page.locator('.card.sketch').boundingBox())!;
  await a.page.mouse.move(sketch.x + 40, sketch.y + 60);
  await a.page.mouse.down();
  await a.page.mouse.move(sketch.x + 200, sketch.y + 100, { steps: 12 });
  await a.page.mouse.up();
  await synced(a.page);

  await b.page.getByRole('tablist', { name: 'Canvases' }).getByRole('button', { name: 'Canvases in Canvas 1' }).click();
  await b.page.getByRole('menu', { name: 'Canvases in Canvas 1' }).getByRole('menuitemradio', { name: 'Ideas' }).click();
  await expect(b.page.getByRole('navigation', { name: 'Canvas path' })).toContainText('Ideas');
  await expect(b.page.locator('.card.sketch .card-ink path')).toHaveCount(1);
  await expect(b.page.locator('.react-flow__background pattern path')).toHaveCount(1);
  await shot(b.page, 'sync-nested-canvas');
  await a.context.close();
  await b.context.close();
});

test('mentions and replies reach the person named, with what the others did since they last looked', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await device(browser);
  const b = await device(browser);
  await openProject(a.page);
  const link = await share(a, 'Ada Lovelace');
  await join(b, link, 'Ben Okafor');
  const bell = (page: Page) => page.getByRole('button', { name: /^Notifications/ });
  await expect(bell(a.page)).toHaveAccessibleName('Notifications');

  // Ben names Ada in a note, picking her name from those who have been here.
  const flow = (await b.page.locator('.canvas .flow').boundingBox())!;
  await b.page.mouse.dblclick(flow.x + 200, flow.y + 200);
  await expect(b.page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await b.page.keyboard.type('Ask @Ad');
  const people = b.page.getByRole('listbox', { name: 'People to mention' });
  await expect(people.getByRole('option')).toHaveText(['@Ada Lovelace']);
  await shot(b.page, 'mention-suggest');
  await b.page.keyboard.press('Enter');
  await b.page.keyboard.type('about the bleaching data');
  await expect(b.page.getByRole('textbox', { name: 'Note' })).toHaveValue('Ask @Ada Lovelace about the bleaching data');
  await b.page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height - 24);
  await synced(b.page);

  // Ada's bell counts it; opening it shows it, and following it shows the note.
  await expect(bell(a.page)).toHaveAccessibleName('Notifications, 1 unread', { timeout: 15_000 });
  await bell(a.page).click();
  const panel = a.page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByRole('menuitem').first()).toContainText('Ben Okafor mentioned you in a card');
  await expect(panel.getByRole('menuitem').first()).toContainText('Ask @Ada Lovelace about the bleaching data');
  await expect(panel).toContainText('Since you last looked');
  await shot(a.page, 'notifications-open');
  await panel.getByRole('menuitem').first().click();
  await expect(a.page.locator('.react-flow__node.selected')).toHaveCount(1);
  await expect(bell(a.page)).toHaveAccessibleName('Notifications');
  // Read is kept on this device.
  await a.page.reload();
  await synced(a.page);
  await expect(bell(a.page)).toHaveAccessibleName('Notifications');

  // Ada comments on a passage she marked; Ben's change to her comment is a reply, and Ben's new canvas is news.
  await select(a.page, 'Coral reefs occupy');
  await a.page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  await a.page.keyboard.type('Is this still true?');
  await a.page.keyboard.press('Control+Enter');
  await synced(a.page);
  await b.page.locator('.page:not([data-copy]) .note-mark').click({ timeout: 15_000 });
  const editor = b.page.getByRole('dialog', { name: 'Comment' }).getByRole('textbox');
  await editor.press('End');
  await editor.pressSequentially(' Yes, per the 2024 survey.');
  await b.page.keyboard.press('Control+Enter');
  await b.page.getByRole('button', { name: 'New canvas' }).click();
  await synced(b.page);
  await expect(bell(a.page)).toHaveAccessibleName('Notifications, 1 unread', { timeout: 15_000 });
  await bell(a.page).click();
  await expect(panel.getByRole('menuitem').first()).toContainText('Ben Okafor replied in a comment');
  await expect(panel).toContainText('Ben Okafor added a canvas');
  await expect(panel).toContainText('Canvas 2');
  await shot(a.page, 'notifications-reply');
  await a.page.keyboard.press('Escape');

  // Ben's own bell has nothing for him: unread counts are each person's and each device's.
  await expect(bell(b.page)).toHaveAccessibleName('Notifications');

  // On a phone, in the dark, Ben sees what Ada did.
  await b.page.setViewportSize({ width: 390, height: 844 });
  await b.page.getByRole('button', { name: 'Use dark theme' }).click();
  await bell(b.page).click();
  const his = b.page.getByRole('dialog', { name: 'Notifications' });
  await expect(his).toContainText('Ada Lovelace added a comment');
  const box = (await his.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(b.page, 'notifications-phone-dark');
  await a.context.close();
  await b.context.close();
});
