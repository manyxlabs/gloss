import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { openProject, select, shot } from './helpers';
import { makePdf } from './pdfs';

const USER = '4242';
const KEYS: Record<string, { write: boolean }> = { 'read-write-key': { write: true }, 'read-only-key': { write: false } };
const ITEMS = [
  {
    key: 'CARSON62',
    data: {
      key: 'CARSON62',
      itemType: 'book',
      title: 'The Sea Around Us',
      creators: [{ firstName: 'Rachel', lastName: 'Carson', creatorType: 'author' }],
      date: '1951',
      extra: 'Citation Key: carson1951sea',
    },
    meta: { parsedDate: '1951', numChildren: 2 },
  },
  {
    key: 'HUGHES17',
    data: { key: 'HUGHES17', itemType: 'journalArticle', title: 'Coral reefs in the Anthropocene', creators: [{ name: 'Hughes Lab' }], date: 'May 2017' },
    meta: { parsedDate: '2017-05-31', numChildren: 0 },
  },
];
const CHILDREN = [
  { key: 'PDF1', data: { key: 'PDF1', itemType: 'attachment', contentType: 'application/pdf', linkMode: 'imported_file', parentItem: 'CARSON62' } },
  { key: 'NOTE1', data: { key: 'NOTE1', itemType: 'note', parentItem: 'CARSON62' } },
];

/** A stand-in for api.zotero.org, answering as its Web API does, with what was posted to it. */
async function zotero() {
  const posted: unknown[] = [];
  const pdf = await makePdf([['The sea around us is the oldest of all things, and the tides keep time for the shore.']]);
  const body = (req: IncomingMessage) =>
    new Promise<string>((done) => {
      let s = '';
      req.on('data', (c) => (s += c));
      req.on('end', () => done(s));
    });
  const server: Server = createServer(async (req, res) => {
    // The real API allows pages from other sites to call it, as Gloss does from the browser.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Zotero-API-Key, Zotero-API-Version, Content-Type');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const key = KEYS[String(req.headers['zotero-api-key'])];
    const url = new URL(req.url!, 'http://x');
    const json = (status: number, data: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    if (!key) return json(403, 'Forbidden');
    if (url.pathname === '/keys/current')
      return json(200, { userID: Number(USER), username: 'rcarson', access: { user: { library: true, files: true, notes: true, write: key.write } } });
    const base = `/users/${USER}/items`;
    if (url.pathname === `${base}/top`) {
      const q = url.searchParams.get('q')?.toLowerCase();
      return json(
        200,
        ITEMS.filter((i) => !q || `${i.data.title} ${i.data.creators.map((c) => ('lastName' in c ? c.lastName : c.name)).join(' ')} ${i.data.date}`.toLowerCase().includes(q)),
      );
    }
    if (url.pathname === `${base}/CARSON62/children`) return json(200, CHILDREN);
    if (url.pathname === `${base}/HUGHES17/children`) return json(200, []);
    const item = ITEMS.find((i) => url.pathname === `${base}/${i.key}`);
    if (item) return json(200, item);
    if (url.pathname === `${base}/PDF1/file`) return void res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(pdf);
    if (url.pathname === base && req.method === 'POST') {
      if (!key.write) return json(403, 'Write access denied');
      posted.push(JSON.parse(await body(req)));
      return json(200, { successful: { 0: { key: 'NEWNOTE' } }, failed: {} });
    }
    json(404, 'Not found');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, posted, close: () => new Promise((done) => server.close(done)) };
}

const dialog = (page: Page, name = 'Add from Zotero') => page.getByRole('dialog', { name });

async function openZotero(page: Page) {
  await page.getByRole('button', { name: 'All documents' }).first().click();
  await page.getByRole('dialog', { name: 'All documents' }).getByRole('button', { name: 'Add from Zotero' }).click();
}

async function connect(page: Page, user: string, key: string) {
  await dialog(page).getByRole('textbox', { name: 'User ID' }).fill(user);
  await dialog(page).getByLabel('API key').fill(key);
  await dialog(page).getByRole('button', { name: 'Connect' }).click();
}

test('a Zotero library is connected with the reader’s own key, searched, imported from with its metadata, and sent notes back', async ({ page }) => {
  const server = await zotero();
  await page.addInitScript((url) => localStorage.setItem('gloss:zotero-api', url), server.url);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProject(page);
  await openZotero(page);

  await test.step('Connecting explains the key, and checks it', async () => {
    await expect(dialog(page).getByRole('link', { name: 'zotero.org/settings/keys' })).toHaveAttribute('href', 'https://www.zotero.org/settings/keys');
    await expect(dialog(page)).toContainText('kept only in this browser');
    await shot(page, 'zotero-connect');
    await connect(page, '99', 'read-write-key');
    await expect(dialog(page).getByRole('alert')).toHaveText('This key belongs to user ID 4242, not 99.');
    await connect(page, USER, 'wrong-key');
    await expect(dialog(page).getByRole('alert')).toContainText('does not recognise this key');
    await connect(page, USER, 'read-write-key');
    await expect(dialog(page)).toContainText('rcarson · read and write');
  });

  await test.step('The library is listed and searched', async () => {
    const results = dialog(page).getByRole('list', { name: 'Zotero items' }).getByRole('listitem');
    await expect(results).toHaveCount(2);
    await expect(results.first()).toContainText('Rachel Carson · 1951');
    await expect(results.nth(1).getByRole('button', { name: 'Add Coral reefs in the Anthropocene' })).toBeDisabled();
    await dialog(page).getByRole('searchbox', { name: 'Search your Zotero library' }).fill('carson');
    await expect(results).toHaveCount(1);
    await shot(page, 'zotero-library');
  });

  await test.step('An item’s PDF comes in as a document with its title, authors, year and citation key', async () => {
    await dialog(page).getByRole('button', { name: 'Add The Sea Around Us' }).click();
    await expect(dialog(page)).toHaveCount(0);
    const tab = page.getByRole('tab', { name: 'The Sea Around Us' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toHaveAttribute('title', /The Sea Around Us \(@carson1951sea\)/);
    await expect(page.locator('.textLayer span', { hasText: 'The sea around us is the oldest' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Contents, pages and highlights' }).first().click();
    const cite = page.getByLabel('From Zotero');
    await expect(cite).toContainText('Rachel Carson · 1951');
    await expect(cite).toContainText('@carson1951sea');
    // Listed as added, so it is not imported twice.
    await openZotero(page);
    await expect(dialog(page).getByRole('list', { name: 'Zotero items' }).getByRole('listitem').first()).toContainText('Added');
    await page.keyboard.press('Escape');
  });

  await test.step('Notes go back to the item as a child note', async () => {
    await select(page, 'The sea around us is the oldest');
    await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Comment' }).click();
    await page.keyboard.type('Compare with the survey <tides>');
    await page.keyboard.press('Control+Enter');
    await page.getByRole('button', { name: 'All documents' }).first().click();
    await page.getByRole('dialog', { name: 'All documents' }).getByRole('button', { name: 'Actions for The Sea Around Us' }).click();
    await page.getByRole('menuitem', { name: 'Send notes to Zotero…' }).click();
    const send = dialog(page, 'Send notes to Zotero');
    await send.getByRole('button', { name: 'Send notes' }).click();
    await expect(send.getByRole('status')).toHaveText('Sent 1 highlight to Zotero.');
    await shot(page, 'zotero-sent');
    await page.keyboard.press('Escape');
    expect(server.posted).toHaveLength(1);
    const [note] = server.posted[0] as { itemType: string; parentItem: string; note: string }[];
    expect(note!.itemType).toBe('note');
    expect(note!.parentItem).toBe('CARSON62');
    expect(note!.note).toContain('“The sea around us is the oldest');
    expect(note!.note).toContain('(p. 1)');
    expect(note!.note).toContain('Compare with the survey &lt;tides&gt;');
  });

  await test.step('A key that may only read says so instead of sending', async () => {
    await page.evaluate(() => localStorage.removeItem('gloss:zotero'));
    await page.getByRole('button', { name: 'All documents' }).first().click();
    await page.getByRole('dialog', { name: 'All documents' }).getByRole('button', { name: 'Actions for The Sea Around Us' }).click();
    await page.getByRole('menuitem', { name: 'Send notes to Zotero…' }).click();
    const send = dialog(page, 'Send notes to Zotero');
    await send.getByRole('textbox', { name: 'User ID' }).fill(USER);
    await send.getByLabel('API key').fill('read-only-key');
    await send.getByRole('button', { name: 'Connect' }).click();
    await send.getByRole('button', { name: 'Send notes' }).click();
    await expect(send.getByRole('alert')).toContainText('This key can only read your library.');
    expect(server.posted).toHaveLength(1);
  });
  await server.close();
});
