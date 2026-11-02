// Share links from cloud storage, and the addresses that download the file itself rather than the
// page that shows it. Shared by the app, which sends such links to /api/file, and the Worker, which
// fetches them.

export type Provider = 'Google Drive' | 'Dropbox' | 'OneDrive' | 'Box';
export type ShareLink = { provider: Provider; url: string } | { provider: Provider; folder: true };

const base64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A link's provider and the address that downloads its file; null for any other link. */
export function shareLink(raw: string): ShareLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (host === 'drive.google.com') {
    const provider = 'Google Drive';
    if (path.startsWith('/drive/folders/') || path.startsWith('/drive/u/') || path === '/embeddedfolderview') return { provider, folder: true };
    const id = /^\/file\/d\/([\w-]+)/.exec(path)?.[1] ?? u.searchParams.get('id');
    if (!id) return null;
    const key = u.searchParams.get('resourcekey');
    // Files over Drive's virus scanning limit answer with a page asking to confirm; the Worker follows it.
    return { provider, url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}${key ? `&resourcekey=${encodeURIComponent(key)}` : ''}` };
  }
  if (host === 'docs.google.com') {
    // Google's own documents have no file to download, so they are exported as PDFs.
    const [, kind, id] = /^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/.exec(path) ?? [];
    if (!kind || !id) return null;
    return { provider: 'Google Drive', url: `https://docs.google.com/${kind}/d/${id}/export?format=pdf` };
  }
  if (host === 'dropbox.com' || host === 'www.dropbox.com') {
    const provider = 'Dropbox';
    if (/^\/(sh|scl\/fo)\//.test(path)) return { provider, folder: true };
    if (!/^\/(s|scl\/fi)\//.test(path)) return null;
    const direct = new URL(u);
    direct.searchParams.set('dl', '1');
    return { provider, url: direct.href };
  }
  if (host === '1drv.ms' || host === 'onedrive.live.com') {
    const provider = 'OneDrive';
    if (/^\/f\//.test(path)) return { provider, folder: true };
    // The shares API takes any sharing link, encoded, and answers with the file's content.
    return { provider, url: `https://api.onedrive.com/v1.0/shares/u!${base64url(u.href)}/root/content` };
  }
  if (host.endsWith('.sharepoint.com')) {
    const provider = 'OneDrive';
    if (/^\/:f:\//.test(path)) return { provider, folder: true };
    if (!/^\/:\w:\//.test(path)) return null;
    const direct = new URL(u);
    direct.searchParams.set('download', '1');
    return { provider, url: direct.href };
  }
  if (host === 'box.com' || host.endsWith('.box.com')) {
    const name = /^\/s\/(\w+)/.exec(path)?.[1];
    if (name) return { provider: 'Box', url: `https://${host === 'box.com' ? 'app.box.com' : host}/shared/static/${name}` };
    if (path.startsWith('/shared/static/')) return { provider: 'Box', url: u.href };
    return null;
  }
  return null;
}

/** Where a provider sends a visitor who is not allowed to see a file: its sign in page. */
export function signIn(url: URL) {
  const host = url.hostname.toLowerCase();
  return (
    host === 'accounts.google.com' ||
    host === 'login.live.com' ||
    host === 'login.microsoftonline.com' ||
    ((host === 'www.dropbox.com' || host === 'dropbox.com') && url.pathname.startsWith('/login')) ||
    ((host === 'box.com' || host.endsWith('.box.com')) && url.pathname.includes('/login'))
  );
}

/** Hosts the providers serve from, which the local tests point at a local server instead. */
export const PROVIDER_HOSTS =
  /(^|\.)(google\.com|googleusercontent\.com|dropbox\.com|dropboxusercontent\.com|1drv\.ms|1drv\.com|onedrive\.com|live\.com|sharepoint\.com|box\.com|boxcloud\.com)$/;
