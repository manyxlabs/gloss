import { writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ARTIFACTS, card, openProject, select, shot } from './helpers';
import { encryptedPdf, ESSAY } from './pdfs';

// Everything the server saw from or sent to one device.
type Wire = { sent: Buffer[]; received: Buffer[]; uploads: Buffer[] };

async function device(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await context.newPage();
  const wire: Wire = { sent: [], received: [], uploads: [] };
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => wire.sent.push(Buffer.from(f.payload)));
    ws.on('framereceived', (f) => wire.received.push(Buffer.from(f.payload)));
  });
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/files/')) wire.uploads.push(r.postDataBuffer() ?? Buffer.alloc(0));
  });
  return { context, page, wire };
}

async function giveName(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: 'What should others call you?' });
  await dialog.getByRole('textbox', { name: 'Your name' }).fill(name);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

async function addNote(page: Page, text: string, x: number, y: number) {
  const canvas = (await page.locator('.canvas').boundingBox())!;
  await page.mouse.dblclick(canvas.x + x, canvas.y + y);
  await expect(page.getByRole('textbox', { name: 'Note' }).last()).toBeFocused();
  await page.keyboard.type(text);
}

const note = (page: Page, text: string) => page.locator(`.card .grow[data-value="${text}"]`);
const synced = (page: Page) => expect(page.getByRole('status')).toHaveText('Synced', { timeout: 15_000 });

test('share a project, edit it together and offline, and keep the server blind', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await device(browser);
  const b = await device(browser);
  const texts = ['Ada writes about kelp forests', 'Ben answers about parrotfish', 'Ada again, while Ben is offline', 'Ben, written offline', 'Ada Lovelace', 'Ben Okafor'];

  const link = await test.step('A shares the project', async () => {
    await openProject(a.page);
    await a.page.getByRole('button', { name: 'Share' }).click();
    const dialog = a.page.getByRole('dialog', { name: 'Share this project' });
    await expect(dialog).toContainText('never reaches the server');
    await shot(a.page, 'sync-share-dialog');
    await dialog.getByRole('button', { name: 'Create link' }).click();
    await giveName(a.page, 'Ada Lovelace');
    const shared = a.page.getByRole('dialog', { name: 'This project is shared' });
    const link = await shared.getByRole('textbox', { name: 'Share link' }).inputValue();
    expect(link).toMatch(/\/#\/join\/[\w-]{22}\.[\w-]{43}$/);
    await shot(a.page, 'sync-share-link');
    await shared.getByRole('button', { name: 'Done' }).click();
    await synced(a.page);
    return link;
  });

  await test.step('B opens the link: the PDFs arrive and render', async () => {
    await b.page.goto(link);
    await expect(b.page).toHaveURL(/#\/p\/[\w-]+$/);
    await giveName(b.page, 'Ben Okafor');
    await expect(b.page.getByRole('tab', { name: 'Reef essay' })).toBeVisible();
    await expect(b.page.getByRole('tab', { name: 'Survey notes' })).toBeVisible();
    await expect(b.page.locator('.textLayer span', { hasText: 'The ocean covers' })).toBeVisible();
    await expect(b.page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Reef essay');
    await synced(b.page);
  });

  await test.step('An excerpt and a note from A appear in B, and a note from B in A', async () => {
    await select(a.page, 'Coral reefs occupy', 'of all marine species.');
    await a.page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Excerpt' }).click();
    await addNote(a.page, texts[0]!, 60, 180);
    await expect(card(b.page, 'Coral reefs occupy').locator('blockquote')).toHaveText(ESSAY[0]![1]!);
    await expect(b.page.locator('.hl.linked')).toHaveCount(2);
    await expect(note(b.page, texts[0]!)).toBeVisible();

    await addNote(b.page, texts[1]!, 380, 620);
    await expect(note(a.page, texts[1]!)).toBeVisible();
    // Selection stays with each device.
    await expect(a.page.locator('.react-flow__node.selected')).not.toContainText(texts[1]!);
  });

  await test.step('Each sees the other: avatars, where they read, and pointers on the canvas', async () => {
    await expect(a.page.getByLabel(/^Ben Okafor: Reading “Reef essay”, page 1$/)).toBeVisible();
    const ada = b.page.getByLabel(/^Ada Lovelace: Reading “Reef essay”, page 1$/);
    await ada.hover();
    await expect(ada.getByRole('tooltip')).toBeVisible();
    const canvas = (await a.page.locator('.canvas').boundingBox())!;
    await a.page.mouse.move(canvas.x + 300, canvas.y + 300, { steps: 5 });
    await expect(b.page.locator('.cursor', { hasText: 'Ada Lovelace' })).toBeVisible();
    await shot(b.page, 'sync-presence');
  });

  await test.step('B goes offline, both edit, and they converge when B is back', async () => {
    await b.context.setOffline(true);
    await expect(b.page.getByRole('status')).toHaveText('Offline');
    await expect(a.page.getByLabel(/^Ben Okafor:/)).toHaveCount(0);
    await addNote(a.page, texts[2]!, 60, 620);
    await addNote(b.page, texts[3]!, 380, 180);
    await shot(b.page, 'sync-offline');
    await expect(note(b.page, texts[2]!)).toHaveCount(0);

    await b.context.setOffline(false);
    for (const page of [a.page, b.page]) {
      for (const t of texts.slice(0, 4)) await expect(note(page, t)).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(5);
      await synced(page);
    }
    await shot(a.page, 'sync-converged-a');
    await shot(b.page, 'sync-converged-b');

    // Reopened, the project reconnects by itself and still has everything.
    await b.page.reload();
    await synced(b.page);
    for (const t of texts.slice(0, 4)) await expect(note(b.page, t)).toBeVisible();
  });

  await test.step('After the log is compacted, a third device gets the whole project', async () => {
    // Each pause lets one change go out on its own, so the room's log grows past the compaction point.
    await addNote(a.page, '', 60, 520);
    await a.page.keyboard.type('Many small edits make a long log that a snapshot replaces.', { delay: 80 });
    await expect.poll(() => a.wire.received.some((f) => f[0] === 8), { timeout: 20_000 }).toBe(true);
    await synced(a.page);

    const c = await device(browser);
    await c.page.goto(link);
    await giveName(c.page, 'Cy Third');
    await expect(c.page.locator('.textLayer span', { hasText: 'The ocean covers' })).toBeVisible();
    for (const t of [...texts.slice(0, 4), 'Many small edits make a long log that a snapshot replaces.']) await expect(note(c.page, t)).toBeVisible();
    await expect(card(c.page, 'Coral reefs occupy')).toBeVisible();
    // The room starts the log it sends with the snapshot.
    expect(c.wire.received[0]?.[0]).toBe(6);
    await expect(c.page.getByLabel(/^Ada Lovelace:/)).toBeVisible();
    await shot(c.page, 'sync-third-device');

    // Stopping on one device leaves the others syncing.
    await c.page.getByRole('button', { name: 'Share' }).click();
    await c.page.getByRole('button', { name: 'Stop syncing on this device' }).click();
    await expect(c.page.getByRole('status')).toHaveCount(0);
    await expect(a.page.getByLabel(/^Cy Third:/)).toHaveCount(0);
    await expect(note(c.page, texts[0]!)).toBeVisible();
    await c.context.close();
  });

  await test.step('On a phone, in the dark theme', async () => {
    await b.page.setViewportSize({ width: 390, height: 844 });
    await b.page.getByRole('button', { name: 'Use dark theme' }).click();
    await b.page
      .getByRole('tablist', { name: 'Show' })
      .getByRole('tab', { name: /^Canvas/ })
      .click();
    await expect(b.page.getByRole('status')).toHaveText('Synced');
    await shot(b.page, 'sync-phone-dark');
    await b.page.getByRole('button', { name: 'Share' }).click();
    await shot(b.page, 'sync-phone-dark-dialog');
    await b.page.getByRole('button', { name: 'Done' }).click();
  });

  await test.step('Nothing the server saw was readable', async () => {
    const frames = [a, b].flatMap((d) => [...d.wire.sent, ...d.wire.received]);
    const uploads = [...a.wire.uploads, ...b.wire.uploads];
    expect(frames.length).toBeGreaterThan(50);
    expect(uploads).toHaveLength(2);
    for (const data of [...frames, ...uploads]) {
      for (const t of [...texts, '%PDF', 'Reef essay', 'Coral reefs occupy', 'highlights']) expect(data.includes(t)).toBe(false);
    }
    writeFileSync(
      `${ARTIFACTS}/sync-wire.json`,
      JSON.stringify(
        {
          frames: frames.length,
          bytes: frames.reduce((n, f) => n + f.length, 0),
          uploads: uploads.map((u) => u.length),
          firstFrame: frames[0]?.subarray(0, 48).toString('hex'),
          plaintextFound: false,
        },
        null,
        2,
      ),
    );
  });
});

test('a second canvas, a margin comment and a password protected PDF all reach the other device', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await device(browser);
  const b = await device(browser);
  await openProject(a.page);

  const [chooser] = await Promise.all([a.page.waitForEvent('filechooser'), a.page.getByRole('button', { name: 'Add file' }).click()]);
  await chooser.setFiles({ name: 'Locked survey.pdf', mimeType: 'application/pdf', buffer: await encryptedPdf('coral') });
  const ask = a.page.getByRole('dialog', { name: 'Password needed' });
  await ask.getByLabel('Password').fill('coral');
  await ask.getByRole('button', { name: 'Open' }).click();
  await expect(a.page.getByRole('tab', { name: 'Locked survey' })).toHaveAttribute('aria-selected', 'true');

  await a.page.getByRole('tab', { name: 'Reef essay' }).click();
  await select(a.page, 'Coral reefs occupy');
  await a.page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
  await a.page.keyboard.type('Check the survey');
  await a.page.getByRole('dialog', { name: 'Comment' }).getByRole('button', { name: 'Save' }).click();

  const tabs = (page: Page) => page.getByRole('tablist', { name: 'Canvases' });
  await tabs(a.page).getByRole('button', { name: 'New canvas' }).click();
  await addNote(a.page, 'Only on the second canvas', 200, 200);

  await a.page.getByRole('button', { name: 'Share' }).click();
  await a.page.getByRole('dialog', { name: 'Share this project' }).getByRole('button', { name: 'Create link' }).click();
  await giveName(a.page, 'Ada');
  const shared = a.page.getByRole('dialog', { name: 'This project is shared' });
  const link = await shared.getByRole('textbox', { name: 'Share link' }).inputValue();
  await shared.getByRole('button', { name: 'Done' }).click();
  await synced(a.page);

  await b.page.goto(link);
  await giveName(b.page, 'Ben');
  await synced(b.page);
  // The comment's marker sits beside its passage.
  await b.page.getByRole('tab', { name: 'Reef essay' }).click();
  await expect(b.page.locator('.page:not([data-copy]) .note-mark')).toHaveCount(1);
  // The second canvas and its note.
  await expect(tabs(b.page).getByRole('tab')).toHaveCount(2);
  await tabs(b.page).getByRole('tab', { name: 'Canvas 2' }).click();
  await expect(note(b.page, 'Only on the second canvas')).toBeVisible();
  // The protected PDF opens without asking: its password came with the project, encrypted.
  await b.page.getByRole('tab', { name: 'Locked survey' }).click();
  await expect(b.page.locator('.textLayer span', { hasText: 'Confidential findings' }).first()).toBeVisible();
  await expect(b.page.getByRole('dialog')).toHaveCount(0);
  await shot(b.page, 'sync-new-features');

  for (const frame of [...a.wire.sent, ...a.wire.uploads]) {
    expect(frame.includes('Check the survey')).toBe(false);
    expect(frame.includes('coral')).toBe(false);
  }
  await a.context.close();
  await b.context.close();
});
