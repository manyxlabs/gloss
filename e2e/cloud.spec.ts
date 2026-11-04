import { expect, test, type Page } from '@playwright/test';
import { shot } from './helpers';
import { makePdf } from './pdfs';

// Google's and Dropbox's pickers cannot be driven headlessly, so their scripts and file endpoints are
// stood in for at the network: each fake answers as the real one does to the calls Gloss makes.
const TOKEN = 'fake-drive-token';
const PICKED = [
  { id: 'tides', name: 'Tide tables.pdf', mimeType: 'application/pdf' },
  { id: 'notes', name: 'Field notes', mimeType: 'application/vnd.google-apps.document' },
  { id: 'gone', name: 'Missing.pdf', mimeType: 'application/pdf' },
  { id: 'sheet', name: 'Budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
];

// `window.signIn` picks how the sign in answers: 'ok', or 'blocked' as when a pop-up blocker stops it.
const GSI = `window.google = window.google || {};
google.accounts = { oauth2: {
  initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => {
    window.requested = (window.requested || 0) + 1;
    if (window.signIn === 'blocked') c.error_callback({ type: 'popup_failed_to_open' });
    else c.callback({ access_token: '${TOKEN}', expires_in: 3599, scope: c.scope });
  }) }),
  hasGrantedAllScopes: (t, scope) => t.scope === scope,
} };`;

const API = `window.gapi = { load: (lib, then) => {
  const built = {};
  const builder = {
    addView: (v) => ((built.view = v), builder),
    enableFeature: (f) => ((built.features = [...(built.features || []), f]), builder),
    setOAuthToken: (t) => ((built.token = t), builder),
    setDeveloperKey: (k) => ((built.key = k), builder),
    setAppId: (id) => ((built.appId = id), builder),
    setCallback: (f) => ((built.callback = f), builder),
    build: () => ({ setVisible: () => { window.picker = built; setTimeout(() => built.callback({ action: 'picked', docs: ${JSON.stringify(PICKED)} })); } }),
  };
  class DocsView { constructor(id) { this.id = id; } setIncludeFolders() { return this; } setMimeTypes(t) { this.types = t; return this; } }
  google.picker = { PickerBuilder: function () { return builder; }, DocsView, ViewId: { DOCS: 'all' },
    Feature: { MULTISELECT_ENABLED: 'multi', SUPPORT_DRIVES: 'drives' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } };
  then.callback();
} };`;

const DROPINS = `window.Dropbox = { isBrowserSupported: () => true, choose: (o) => {
  window.chooser = { ...o, appKey: document.getElementById('dropboxjs').dataset.appKey };
  setTimeout(() => o.success([
    { name: 'Reef survey.pdf', link: 'https://dl.dropboxusercontent.com/fake/reef.pdf' },
    { name: 'Broken.pdf', link: 'https://dl.dropboxusercontent.com/fake/broken.pdf' },
  ]));
} };`;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' };

async function fakeClouds(page: Page) {
  const pdfs = {
    tides: await makePdf([['High water at the reef comes an hour after the harbour.']]),
    notes: await makePdf([['Field notes, exported from Google Docs: the spur and groove zone.']]),
    reef: await makePdf([['The reef survey counted forty species of hard coral.']]),
  };
  const script = (body: string) => ({ status: 200, contentType: 'text/javascript', body });
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill(script(GSI)));
  await page.route('https://apis.google.com/js/api.js', (r) => r.fulfill(script(API)));
  await page.route('https://www.dropbox.com/static/api/2/dropins.js', (r) => r.fulfill(script(DROPINS)));
  const drive: string[] = [];
  await page.route('https://www.googleapis.com/drive/v3/files/**', (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    drive.push(url.pathname + url.search);
    if (req.headers().authorization !== `Bearer ${TOKEN}`) return r.fulfill({ status: 401, headers: CORS });
    const body = url.pathname === '/drive/v3/files/tides' ? pdfs.tides : url.pathname === '/drive/v3/files/notes/export' ? pdfs.notes : null;
    return r.fulfill(body ? { status: 200, headers: CORS, contentType: 'application/pdf', body } : { status: 404, headers: CORS });
  });
  // Held until released, so the progress notice can be seen part way.
  let release!: () => void;
  const held = new Promise<void>((done) => (release = done));
  await page.route('https://dl.dropboxusercontent.com/**', async (r) => {
    if (r.request().url().endsWith('/broken.pdf')) return r.abort('connectionfailed');
    await held;
    await r.fulfill({ status: 200, headers: CORS, contentType: 'application/octet-stream', body: pdfs.reef });
  });
  return { drive, release };
}

test('files picked in Google Drive and Dropbox are downloaded in the browser and added as files opened from the computer are', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { drive, release } = await fakeClouds(page);
  await page.goto('/');
  // Not loaded until asked for.
  await expect(page.locator('script[src*="google"], script[src*="dropbox"]')).toHaveCount(0);

  await test.step('A blocked sign in window is explained, and trying again works', async () => {
    await page.evaluate(() => ((window as unknown as { signIn: string }).signIn = 'blocked'));
    await page.getByRole('button', { name: 'Add from Google Drive' }).click();
    await expect(page.getByRole('alert')).toHaveText("The browser blocked Google Drive's window. Allow pop-ups for Gloss, or try again.");
    await page.evaluate(() => ((window as unknown as { signIn: string }).signIn = 'ok'));
  });

  await test.step('Google Drive: the picked files start a project, a Google Doc as its PDF, with the ones that failed named', async () => {
    await page.getByRole('button', { name: 'Add from Google Drive' }).click();
    await expect(page.getByRole('tab', { name: 'Tide tables' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Field notes' })).toBeVisible();
    await expect(page.locator('.textLayer span', { hasText: 'High water at the reef' }).first()).toBeVisible();
    const problems = page.locator('.problems');
    await expect(problems).toContainText('Missing.pdf could not be added. Google Drive could not find it.');
    await expect(problems).toContainText('Budget.xlsx is not a file Gloss can open.');
    // Only the files Gloss opens are downloaded: the spreadsheet never is.
    expect(drive.sort()).toEqual([
      '/drive/v3/files/gone?alt=media&supportsAllDrives=true',
      '/drive/v3/files/notes/export?mimeType=application/pdf',
      '/drive/v3/files/tides?alt=media&supportsAllDrives=true',
    ]);
    // drive.file opens a picked file only when the Picker was built with the app's project number.
    expect(await page.evaluate(() => (window as unknown as { picker: Record<string, unknown> }).picker)).toMatchObject({
      token: TOKEN,
      appId: '36227836543',
      key: expect.stringMatching(/^AIza/),
    });
    await shot(page, 'cloud-drive-project');
  });

  await test.step('Dropbox: from the list of documents, with its progress on show, into the same project', async () => {
    await page.getByRole('button', { name: 'All documents' }).first().click();
    const list = page.getByRole('dialog', { name: 'All documents' });
    await expect(list.getByRole('button', { name: 'Add from Google Drive' })).toBeVisible();
    await shot(page, 'cloud-document-list');
    await list.getByRole('button', { name: 'Add from Dropbox' }).click();
    await expect(page.locator('.progress-notice')).toHaveText(/Downloading from Dropbox: [01] of 2/);
    await shot(page, 'cloud-dropbox-progress');
    release();
    await expect(page.getByRole('tab', { name: 'Reef survey' })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
    await expect(page.locator('.textLayer span', { hasText: 'forty species of hard coral' }).first()).toBeVisible();
    await expect(page.locator('.problems')).toContainText('Broken.pdf could not be added. Gloss could not reach Dropbox. Check the connection.');
    await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab')).toHaveCount(3);
    const chooser = await page.evaluate(() => (window as unknown as { chooser: Record<string, unknown> }).chooser);
    expect(chooser).toMatchObject({ appKey: 'skaq1wxxhdu1hwy', linkType: 'direct', multiselect: true });
    expect(chooser.extensions).toEqual(expect.arrayContaining(['.pdf', '.docx', '.pptx', 'images']));
  });

  await test.step('A second pick in this visit needs no second sign in', async () => {
    // The list stays open, as it does for a folder added from it.
    await page.getByRole('dialog', { name: 'All documents' }).getByRole('button', { name: 'Add from Google Drive' }).click();
    await expect(page.getByRole('tab', { name: 'Tide tables' })).toHaveCount(2, { timeout: 15_000 });
    // The blocked try, then the one that signed in.
    expect(await page.evaluate(() => (window as unknown as { requested: number }).requested)).toBe(2);
  });
});

test('the privacy policy is at /privacy, linked from the start page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'manish@manyxlabs.com' })).toHaveAttribute('href', 'mailto:manish@manyxlabs.com');
  await shot(page, 'privacy');
});
