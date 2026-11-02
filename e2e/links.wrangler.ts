// Run with playwright.links.config.ts. Share links from cloud storage, added through the real Worker, which
// fetches the providers' addresses from the server below: it answers at each provider's paths as the
// provider does, with direct downloads, redirects, Drive's confirm page, sign in pages and refusals.
import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { picture, shot } from './helpers';
import { ESSAY, makePdf } from './pdfs';

const port = Number(process.env.PORT ?? 4398);
const providers = `http://localhost:${port + 1}`;
const guarded = `http://localhost:${port + 2}`;

type Reply = { status?: number; type?: string; name?: string; body?: Buffer | string; location?: string };
let server: Server;
/** What the Worker asked the providers for, as host, path and query. */
const asked: string[] = [];

const html = (body: string) => ({ type: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${body}</body></html>` });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  const photo = await picture(page, 400, 300, '#2a7bd0', 'image/png');
  await page.close();
  const docx = await Packer.toBuffer(
    new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('Field guide: rock pools are cut off from the sea at low tide.')] })] }] }),
  );
  const replies: Record<string, (q: URLSearchParams) => Reply> = {
    'drive.google.com/uc': (q) =>
      q.get('export') !== 'download'
        ? html('A viewer page')
        : q.get('id') === 'secret'
          ? { status: 302, location: 'https://accounts.google.com/ServiceLogin?continue=https://drive.google.com/uc' }
          : { status: 303, location: `https://drive.usercontent.google.com/download?id=${q.get('id')}&export=download` },
    'drive.usercontent.google.com/download': (q) => {
      if (q.get('id') === 'reef') return { type: 'application/pdf', name: 'Reef survey.pdf', body: pdfs.reef };
      if (q.get('id') !== 'guide') return { status: 404, ...html('Not found') };
      // Too large to scan for viruses: Drive asks first, with a form that downloads it anyway.
      if (q.get('confirm') !== 't' || q.get('uuid') !== 'u-123')
        return html(
          '<p>Google Drive can’t scan this file for viruses.</p><form id="download-form" action="https://drive.usercontent.google.com/download" method="get"><input type="submit" value="Download anyway"/><input type="hidden" name="id" value="guide"><input type="hidden" name="export" value="download"><input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="u-123"></form>',
        );
      return { type: 'application/octet-stream', name: 'Field guide.docx', body: docx };
    },
    'docs.google.com/document/d/minutes/export': (q) =>
      q.get('format') === 'pdf' ? { type: 'application/pdf', name: 'Meeting minutes.pdf', body: pdfs.minutes } : html('An editor'),
    'www.dropbox.com/scl/fi/abc123/Field log.md': (q) =>
      q.get('dl') === '1' && q.get('rlkey') === 'k1' ? { status: 302, location: 'https://uc5f.dl.dropboxusercontent.com/cd/0/get/Xyz/file' } : html('A preview page'),
    'uc5f.dl.dropboxusercontent.com/cd/0/get/Xyz/file': () => ({
      type: 'application/octet-stream',
      name: 'Field log.md',
      body: '# Field log\n\nVisibility was **twelve metres** on the outer reef.',
    }),
    [`api.onedrive.com/v1.0/shares/u!${Buffer.from('https://1drv.ms/i/s!Tide').toString('base64url')}/root/content`]: () => ({
      status: 302,
      location: 'https://public.am.files.1drv.com/y4mTide/Tide%20pool.png?download',
    }),
    'public.am.files.1drv.com/y4mTide/Tide pool.png': () => ({ type: 'image/png', body: photo }),
    [`api.onedrive.com/v1.0/shares/u!${Buffer.from('https://1drv.ms/b/s!Private').toString('base64url')}/root/content`]: () => ({
      status: 403,
      type: 'application/json',
      body: '{"error":{"code":"accessDenied"}}',
    }),
    'contoso-my.sharepoint.com/:b:/g/personal/ada/EReport': (q) =>
      q.get('download') === '1' ? { type: 'application/pdf', name: 'Lagoon report.pdf', body: pdfs.lagoon } : html('A viewer page'),
    'app.box.com/shared/static/divenotes': () => ({
      type: 'text/plain; charset=utf-8',
      name: 'Dive notes.txt',
      body: 'Dive notes: a turtle rested under the ledge for the whole dive.',
    }),
    'app.box.com/shared/static/locked': () => ({ status: 302, location: 'https://account.box.com/login?redirect_url=%2Fs%2Flocked' }),
    // Not a provider: a link straight to a file, without a file name to say so.
    'direct/reef-paper': () => ({ type: 'application/pdf', body: pdfs.reef }),
    'direct/movie': () => ({ type: 'video/mp4', body: 'not a film' }),
    'direct/huge.pdf': () => ({ type: 'application/pdf', body: Buffer.alloc(51 * 1024 * 1024, 32) }),
    'direct/to-metadata.pdf': () => ({ status: 302, location: 'http://169.254.169.254/latest/meta-data/' }),
  };
  const pdfs = {
    reef: await makePdf(ESSAY),
    minutes: await makePdf([['Meeting minutes: the survey team agreed to repeat the transects in March.']]),
    lagoon: await makePdf([['Lagoon report: seagrass covered most of the sandy floor.']]),
  };
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const key = decodeURIComponent(url.pathname.slice(1));
    asked.push(`${key}${url.search}`);
    const reply = replies[key]?.(url.searchParams) ?? { status: 404, ...html('Not found') };
    res.writeHead(reply.status ?? 200, {
      ...(reply.type ? { 'content-type': reply.type } : {}),
      ...(reply.location ? { location: reply.location } : {}),
      ...(reply.name ? { 'content-disposition': `attachment; filename="${reply.name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(reply.name)}` } : {}),
    });
    res.end(reply.body);
  });
  await new Promise<void>((done) => server.listen(port + 1, done));
});

test.afterAll(() => new Promise<void>((done) => server.close(() => done())));

async function addLink(page: Page, url: string, screenshot?: string) {
  await page.getByRole('button', { name: 'Add from a link' }).click();
  await page.getByRole('textbox', { name: 'Link' }).fill(url);
  if (screenshot) await shot(page, screenshot);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add from a link' })).toBeHidden({ timeout: 15_000 });
}

const tab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { name, exact: true });
const text = (page: Page, words: string) => expect(page.locator('.textLayer span', { hasText: words }).first()).toBeVisible();

test('share links from Google Drive, Dropbox, OneDrive and Box add the file itself, converted like any file', async ({ page }) => {
  await page.goto('/');
  await addLink(page, 'https://drive.google.com/file/d/reef/view?usp=sharing', 'links-dialog');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Reef survey');
  await expect(tab(page, 'Reef survey')).toHaveAttribute('title', 'Reef survey\nFrom https://drive.google.com/file/d/reef/view?usp=sharing');
  await text(page, 'The ocean covers');
  await shot(page, 'links-drive');

  const links: [string, string, string][] = [
    // Too large for Drive to scan: its confirm page is followed.
    ['https://drive.google.com/open?id=guide', 'Field guide', 'rock pools are cut off'],
    ['https://docs.google.com/document/d/minutes/edit?usp=sharing', 'Meeting minutes', 'repeat the transects'],
    ['https://www.dropbox.com/scl/fi/abc123/Field%20log.md?rlkey=k1&dl=0', 'Field log', 'twelve metres'],
    ['https://contoso-my.sharepoint.com/:b:/g/personal/ada/EReport?e=a1b2', 'Lagoon report', 'seagrass covered'],
    ['https://app.box.com/s/divenotes', 'Dive notes', 'a turtle rested'],
    // Neither a provider nor a file name: read as a web page first, then fetched as the file it is.
    [`${providers}/direct/reef-paper`, 'reef-paper', 'The ocean covers'],
  ];
  for (const [url, name, words] of links) {
    await addLink(page, url);
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    await text(page, words);
  }
  await expect(tab(page, 'Field guide')).toHaveAttribute('title', 'Field guide\nConverted from https://drive.google.com/open?id=guide');

  await addLink(page, 'https://1drv.ms/i/s!Tide');
  await expect(tab(page, 'Tide pool')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pdfViewer .page canvas').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // The Worker asked for downloads, not the pages that show them.
  for (const want of [
    'drive.google.com/uc?export=download&id=reef',
    'drive.usercontent.google.com/download?id=guide&export=download&confirm=t&uuid=u-123',
    'docs.google.com/document/d/minutes/export?format=pdf',
    'www.dropbox.com/scl/fi/abc123/Field log.md?rlkey=k1&dl=1',
    'contoso-my.sharepoint.com/:b:/g/personal/ada/EReport?e=a1b2&download=1',
    'app.box.com/shared/static/divenotes',
  ])
    expect(asked).toContain(want);
  await shot(page, 'links-all');
});

test('private links and folders are explained, and the Worker refuses what it must not fetch', async ({ page, request }) => {
  await page.goto('/');
  await addLink(page, `${providers}/direct/reef-paper`);
  for (const [url, why] of [
    [
      'https://drive.google.com/file/d/secret/view',
      'Google Drive did not hand over the file, which usually means it is private. Share it so that anyone with the link can view it',
    ],
    ['https://1drv.ms/b/s!Private', 'OneDrive did not hand over the file, which usually means it is private.'],
    ['https://app.box.com/s/locked', 'Box did not hand over the file, which usually means it is private.'],
    ['https://www.dropbox.com/scl/fo/xyz/AAB?rlkey=r&dl=0', 'That Dropbox link is to a folder. Share a single file and add its link.'],
    [`${providers}/direct/movie`, 'That address is not a web page or a file Gloss can open.'],
  ] as const) {
    await addLink(page, url);
    await expect(page.getByRole('alert')).toContainText(`${url} could not be added. ${why}`);
    await page.getByRole('alert').getByRole('button', { name: 'Dismiss' }).click();
  }
  await addLink(page, 'https://drive.google.com/file/d/secret/view');
  await shot(page, 'links-private');
  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab')).toHaveCount(1);

  const refused = async (base: string, url: string, status: number, error: RegExp) => {
    const res = await request.get(`${base}/api/file?url=${encodeURIComponent(url)}`);
    expect(res.status(), url).toBe(status);
    expect((await res.json()).error, url).toMatch(error);
  };
  // The default guard: private hosts, IP numbers and other schemes, before anything is fetched.
  for (const url of [`${providers}/direct/reef-paper`, 'http://printer.local/scan.pdf', 'http://intranet/report.pdf']) await refused(guarded, url, 400, /private network/);
  for (const url of ['http://127.0.0.1/a.pdf', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/a.pdf', 'http://2130706433/a.pdf'])
    await refused(guarded, url, 400, /IP numbers/);
  await refused(guarded, 'file:///etc/passwd', 400, /Only http and https/);
  await refused(guarded, 'http://user:secret@example.com/a.pdf', 400, /user name or password/);
  // A redirect is checked again, and a download stops at the size limit.
  await refused('', `${providers}/direct/to-metadata.pdf`, 400, /IP numbers/);
  await refused('', `${providers}/direct/huge.pdf`, 413, /larger than 50 MB/);
});
