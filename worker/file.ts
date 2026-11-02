// GET /api/file?url=: fetches a file from a link for the app, which cannot read other sites itself: a share
// link from Google Drive, Dropbox, OneDrive or Box, turned into the address that downloads the file, or a
// link straight to a file. It goes through the same checks as a web page (page.ts), and only files Gloss
// can open come back.
import { PROVIDER_HOSTS, shareLink, signIn, type Provider } from './links';
import { get, Refusal, type Guard } from './page';

const TIMEOUT = 30_000;
const MAX_FILE = 50 * 1024 * 1024;
/** What a server may call a file worth reading: its own type, or a generic download whose bytes then say what it is. */
const DECLARED =
  /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation)|image\/[\w.+-]+|text\/(plain|markdown|x-markdown|html)|application\/(octet-stream|x-download|force-download|zip|binary)|binary\/octet-stream|)$/;
const NOT_A_FILE = 'That address is not a web page or a file Gloss can open.';

type Kind = { ext: string; type: string };
const KINDS = {
  pdf: { ext: 'pdf', type: 'application/pdf' },
  docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pptx: { ext: 'pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  png: { ext: 'png', type: 'image/png' },
  jpg: { ext: 'jpg', type: 'image/jpeg' },
  gif: { ext: 'gif', type: 'image/gif' },
  webp: { ext: 'webp', type: 'image/webp' },
  heic: { ext: 'heic', type: 'image/heic' },
  avif: { ext: 'avif', type: 'image/avif' },
  bmp: { ext: 'bmp', type: 'image/bmp' },
  txt: { ext: 'txt', type: 'text/plain' },
  md: { ext: 'md', type: 'text/markdown' },
} satisfies Record<string, Kind>;

/** What a file is, from its first bytes, as servers often call every download a stream of bytes. */
function kindOf(bytes: Uint8Array, type: string, name: string): Kind | null {
  // One character per byte; a 'latin1' TextDecoder is really windows-1252, which changes some bytes.
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  if (head.includes('%PDF-')) return KINDS.pdf;
  if (head.startsWith('PK\x03\x04')) {
    // An Office file is a zip whose parts are named near its start.
    const names = new TextDecoder('latin1').decode(bytes.subarray(0, 64 * 1024));
    return names.includes('word/') ? KINDS.docx : names.includes('ppt/') ? KINDS.pptx : null;
  }
  if (head.startsWith('\x89PNG')) return KINDS.png;
  if (head.startsWith('\xff\xd8\xff')) return KINDS.jpg;
  if (head.startsWith('GIF8')) return KINDS.gif;
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return KINDS.webp;
  if (head.slice(4, 8) === 'ftyp') return /^avi[fs]/.test(head.slice(8, 12)) ? KINDS.avif : /^(hei[cfsx]|mif1|msf1)/.test(head.slice(8, 12)) ? KINDS.heic : null;
  if (head.startsWith('BM')) return KINDS.bmp;
  // Text has no signature: it must be called text, by its type or its name, and hold no control bytes a text file would not.
  if ((/^text\/(plain|markdown|x-markdown)$/.test(type) || /\.(txt|md|markdown)$/i.test(name)) && !bytes.subarray(0, 1024).some((b) => b < 9 || (b > 13 && b < 27)))
    return /markdown/.test(type) || /\.(md|markdown)$/i.test(name) ? KINDS.md : KINDS.txt;
  return null;
}

/** The file's name, from the download's header or else the address. */
function nameOf(headers: Headers, url: URL) {
  const disposition = headers.get('content-disposition') ?? '';
  const encoded = /filename\*\s*=\s*[\w-]+'[\w-]*'([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(disposition);
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const name = encoded ? decode(encoded.trim()) : (plain?.[1] ?? plain?.[2]?.trim() ?? decode(url.pathname.split('/').pop() ?? ''));
  // A name is shown and stored, never used as a path.
  return name.replace(/[\\/]|\p{Cc}/gu, ' ').trim();
}

const privately = (provider: Provider) =>
  `${provider} did not hand over the file, which usually means it is private. Share it so that anyone with the link can view it, then add the link again.`;

/** Drive asks before handing over a file too large for it to scan: the page's form names the address that downloads it anyway. */
function driveConfirm(html: string) {
  const form = /<form[^>]+id="download-form"[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/.exec(html);
  if (!form) return null;
  const url = new URL(form[1]!.replace(/&amp;/g, '&'));
  for (const [, name, value] of form[2]!.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)) url.searchParams.set(name!, value!.replace(/&amp;/g, '&'));
  return url.href;
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function handleFile(request: Request, env: { ALLOW_PRIVATE_HOSTS?: string; TEST_PROVIDER_ORIGIN?: string }): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Only GET is supported.' }, 405);
  const raw = new URL(request.url).searchParams.get('url') ?? '';
  const link = shareLink(raw);
  const origin = env.TEST_PROVIDER_ORIGIN;
  const guard: Guard = {
    allowPrivate: env.ALLOW_PRIVATE_HOSTS === '1',
    signal: AbortSignal.timeout(TIMEOUT),
    follow: (url) => {
      if (link && signIn(url)) throw new Refusal(privately(link.provider), 403);
    },
    // The local tests stand in for the providers, at their addresses' paths on a local server.
    via: origin ? (url) => (PROVIDER_HOSTS.test(url.hostname) ? new URL(`${origin}/${url.host}${url.pathname}${url.search}`) : url) : undefined,
  };
  const wanted = { accept: DECLARED, max: MAX_FILE, notIt: NOT_A_FILE, tooLarge: `The file is larger than ${MAX_FILE >> 20} MB.`, headers: '*/*' };
  try {
    if (link && 'folder' in link) throw new Refusal(`That ${link.provider} link is to a folder. Share a single file and add its link.`);
    let file = await get(link?.url ?? raw, guard, wanted);
    if (file.type === 'text/html') {
      const confirmed = link?.provider === 'Google Drive' && driveConfirm(new TextDecoder().decode(file.bytes));
      if (confirmed) file = await get(confirmed, guard, wanted);
    }
    const name = nameOf(file.headers, file.url);
    const kind = kindOf(file.bytes, file.type, name);
    if (!kind) throw new Refusal(link && file.type === 'text/html' ? privately(link.provider) : NOT_A_FILE, link && file.type === 'text/html' ? 403 : 415);
    const base = name.replace(/\.[^.]*$/, '') || (link ? `From ${link.provider}` : file.url.hostname);
    return new Response(file.bytes, {
      headers: { 'content-type': kind.type, 'x-file-name': encodeURIComponent(`${base}.${kind.ext}`), 'cache-control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof Refusal) {
      if (link && err.upstream && [401, 403, 404].includes(err.upstream)) return json({ error: privately(link.provider) }, 403);
      return json({ error: err.message }, err.status);
    }
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return json({ error: 'The file took too long to download.' }, 504);
    return json({ error: 'The file could not be fetched.' }, 502);
  }
}
