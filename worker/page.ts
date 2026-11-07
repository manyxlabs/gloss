// GET /api/page?url=: fetches a web page for the app, which cannot read other sites itself, and returns its
// article as cleaned HTML with images inlined. The server fetches on a reader's behalf, so every address,
// including each redirect and image, is checked first so it cannot be pointed at private networks.
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom/worker';
import type { Problem } from './problem';

const TIMEOUT = 10_000;
const MAX_PAGE = 5 * 1024 * 1024;
const MAX_HOPS = 5;
const IMAGES = { count: 20, each: 2 * 1024 * 1024, total: 8 * 1024 * 1024, timeout: 8_000 };
const HTML = /^(text\/html|application\/xhtml\+xml)$/;
const IMAGE = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;
const UA = 'Mozilla/5.0 (compatible; Gloss/1.0; +https://gloss.manyxlabs.com)';

/** A reason to show the reader; `upstream` is the status the site answered with, when it was an error. */
export class Refusal extends Error {
  constructor(
    readonly problem: Problem,
    readonly status = 400,
    readonly upstream?: number,
  ) {
    super(problem.code);
  }
}

/**
 * `follow` sees each address a redirect leads to, before it is checked, and may refuse it. `via`
 * changes where a checked address is fetched from; only the local tests set it.
 */
export type Guard = { allowPrivate: boolean; signal: AbortSignal; follow?: (url: URL) => void; via?: (url: URL) => URL };
/** What is fetched, for the reasons given when it is refused. */
export type Wanted = { accept: RegExp; max: number; notIt: Problem; tooLarge: Problem; headers?: string };
const PAGE: Pick<Wanted, 'notIt' | 'tooLarge'> = { notIt: { code: 'notPage' }, tooLarge: { code: 'pageTooLarge' } };

const privateName = (h: string) => !h.includes('.') || /(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(h);

function privateIp(ip: string) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    // Loopback, unspecified, unique local, link local, multicast, documentation, and IPv4 mapped or translated.
    return v6 === '::' || v6 === '::1' || /^(f[cd]|fe[89ab]|ff|::ffff:|64:ff9b:|100::|2001:db8:)/.test(v6);
  }
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b < 128) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b < 32) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Workers have no DNS API, so names are looked up over DNS over HTTPS; a name that cannot be checked is refused. */
async function lookup(host: string, signal: AbortSignal) {
  const answers = await Promise.all(
    ['A', 'AAAA'].map(async (type) => {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal });
      if (!res.ok) throw new Refusal({ code: 'unchecked' }, 502);
      const { Answer = [] } = (await res.json()) as { Answer?: { type: number; data: string }[] };
      return Answer.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
    }),
  );
  return answers.flat();
}

async function check(raw: string, { allowPrivate, signal }: Guard) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Refusal({ code: 'notAddress' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Refusal({ code: 'scheme' });
  if (url.username || url.password) throw new Refusal({ code: 'credentials' });
  // The URL parser has already turned every spelling of an IP address (decimal, hex, short forms) into this one.
  if (/^(\d+\.){3}\d+$/.test(url.hostname) || url.hostname.startsWith('[')) throw new Refusal({ code: 'ipNumber' });
  // Only the local test setup turns this off, to fetch a page it serves itself.
  if (!allowPrivate) {
    if (privateName(url.hostname)) throw new Refusal({ code: 'private' });
    const ips = await lookup(url.hostname, signal);
    if (!ips.length) throw new Refusal({ code: 'notFound' }, 502);
    // DNS can answer differently by the time of the fetch itself; Workers cannot pin the address, so this narrows rather than closes that gap.
    if (ips.some(privateIp)) throw new Refusal({ code: 'private' });
  }
  return url;
}

async function read(body: ReadableStream<Uint8Array> | null, max: number, tooLarge: Problem) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = body?.getReader();
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.byteLength;
    if (size > max) {
      await reader!.cancel();
      throw new Refusal(tooLarge, 413);
    }
    chunks.push(r.value);
  }
  const out = new Uint8Array(size);
  chunks.reduce((at, c) => (out.set(c, at), at + c.byteLength), 0);
  return out;
}

/** Fetches by hand through redirects, checking every hop, and stops reading past `max` bytes. */
export async function get(raw: string, guard: Guard, { accept, max, notIt, tooLarge, headers = 'text/html,application/xhtml+xml,image/*;q=0.8' }: Wanted) {
  let url = await check(raw, guard);
  for (let hop = 0; ; hop++) {
    const res = await fetch(guard.via?.(url) ?? url, { redirect: 'manual', signal: guard.signal, headers: { accept: headers, 'user-agent': UA } });
    const location = res.headers.get('location');
    const [type = '', ...params] = (res.headers.get('content-type') ?? '')
      .toLowerCase()
      .split(';')
      .map((s) => s.trim());
    const refuse = async (problem: Problem, status: number) => {
      await res.body?.cancel();
      return new Refusal(problem, status);
    };
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop === MAX_HOPS) throw await refuse({ code: 'redirects' }, 502);
      await res.body?.cancel();
      const next = new URL(location, url);
      guard.follow?.(next);
      url = await check(next.href, guard);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Refusal({ code: 'upstream', status: res.status }, 502, res.status);
    }
    if (!accept.test(type)) throw await refuse(notIt, 415);
    if (Number(res.headers.get('content-length')) > max) throw await refuse(tooLarge, 413);
    const charset = params
      .find((p) => p.startsWith('charset='))
      ?.slice(8)
      .replace(/"/g, '');
    return { url, type, charset, headers: res.headers, bytes: await read(res.body, max, tooLarge) };
  }
}

function decode({ bytes, charset }: { bytes: Uint8Array; charset?: string }) {
  const declared = charset ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 4096)))?.[1];
  try {
    return new TextDecoder(declared || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const base64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

const KEEP: Record<string, string[]> = Object.fromEntries(
  'P H1 H2 H3 H4 H5 H6 UL OL LI BLOCKQUOTE PRE CODE EM STRONG B I A IMG TABLE THEAD TBODY TFOOT TR TH TD CAPTION BR HR FIGURE FIGCAPTION SUB SUP'
    .split(' ')
    .map((t) => [t, t === 'A' ? ['href'] : t === 'IMG' ? ['src', 'alt'] : t === 'OL' ? ['start'] : []]),
);
const DROP = new Set('SCRIPT STYLE IFRAME OBJECT EMBED FORM SVG MATH VIDEO AUDIO CANVAS NOSCRIPT TEMPLATE INPUT BUTTON SELECT TEXTAREA LINK META'.split(' '));

/** Keeps only the article's structure, with links made absolute and images inlined, since the app cannot fetch them. */
async function clean(html: string, base: URL, allowPrivate: boolean) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const absolute = (u: string | null) => {
    try {
      const url = new URL(u ?? '', base);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };
  const walk = (el: typeof document.body) => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toUpperCase();
      if (DROP.has(tag)) {
        child.remove();
        continue;
      }
      walk(child);
      const kept = KEEP[tag];
      if (!kept) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const { name } of [...child.attributes]) if (!kept.includes(name)) child.removeAttribute(name);
      for (const name of ['href', 'src']) {
        if (!child.hasAttribute(name)) continue;
        const url = absolute(child.getAttribute(name));
        if (url) child.setAttribute(name, url);
        else child.removeAttribute(name);
      }
    }
  };
  walk(document.body);

  const guard = { allowPrivate, signal: AbortSignal.timeout(IMAGES.timeout) };
  let budget = IMAGES.total;
  const images = [...document.querySelectorAll('img')];
  await Promise.all(
    images.map(async (img, i) => {
      try {
        if (i >= IMAGES.count) throw new Error('too many');
        const { type, bytes } = await get(img.getAttribute('src') ?? '', guard, { ...PAGE, accept: IMAGE, max: IMAGES.each });
        if ((budget -= bytes.byteLength) < 0) throw new Error('over budget');
        img.setAttribute('src', `data:${type};base64,${base64(bytes)}`);
      } catch {
        img.remove();
      }
    }),
  );
  return document.body.innerHTML;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
/** The answer to a refused fetch, as `{ error: Problem }`. */
export const refused = (error: Problem, status: number) => json({ error }, status);

export async function handlePage(request: Request, env: { ALLOW_PRIVATE_HOSTS?: string }): Promise<Response> {
  if (request.method !== 'GET') return refused({ code: 'method' }, 405);
  const allowPrivate = env.ALLOW_PRIVATE_HOSTS === '1';
  try {
    const page = await get(new URL(request.url).searchParams.get('url') ?? '', { allowPrivate, signal: AbortSignal.timeout(TIMEOUT) }, { ...PAGE, accept: HTML, max: MAX_PAGE });
    const { document } = parseHTML(decode(page));
    const article = new Readability(document).parse();
    if (!article?.content) throw new Refusal({ code: 'noArticle' }, 422);
    return json({
      url: page.url.href,
      title: article.title?.trim() || page.url.hostname,
      byline: article.byline?.trim() || undefined,
      site: article.siteName?.trim() || undefined,
      html: await clean(article.content, page.url, allowPrivate),
    });
  } catch (err) {
    if (err instanceof Refusal) return refused(err.problem, err.status);
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return refused({ code: 'pageTimeout' }, 504);
    return refused({ code: 'pageFailed' }, 502);
  }
}
