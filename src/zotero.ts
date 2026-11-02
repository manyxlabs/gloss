// Zotero, through its Web API straight from the browser (it allows other sites' pages to call it),
// with the reader's own key: their library to import PDFs from, and notes sent back to an item.
import { commentOf } from './links';
import type { DocMeta, Project, ZoteroItem } from './types';

const ACCOUNT_KEY = 'gloss:zotero';
/** Points Gloss at another server speaking the Zotero API, for tests; unset, it is Zotero's own. */
const API_KEY = 'gloss:zotero-api';

export type ZoteroAccount = { userId: string; apiKey: string; username: string; write: boolean };
export type ZoteroResult = { key: string; item: ZoteroItem; pdf: boolean };

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
const api = () => stored(API_KEY) || 'https://api.zotero.org';

export function savedAccount(): ZoteroAccount | null {
  try {
    const a = JSON.parse(stored(ACCOUNT_KEY) ?? 'null') as ZoteroAccount | null;
    return a?.userId && a.apiKey ? a : null;
  } catch {
    return null;
  }
}

/** Forgets the key on this device. */
export function disconnect() {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Nothing was kept.
  }
}

export class ZoteroError extends Error {}

async function call(a: Pick<ZoteroAccount, 'apiKey'>, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${api()}${path}`, { ...init, headers: { 'Zotero-API-Key': a.apiKey, 'Zotero-API-Version': '3', ...init.headers } });
  } catch {
    throw new ZoteroError('Zotero could not be reached. Check the connection and try again.');
  }
  if (res.status === 403) throw new ZoteroError('Zotero refused: the key does not allow this. Check its permissions at zotero.org/settings/keys.');
  if (res.status === 404) throw new ZoteroError('Zotero does not know this item or library.');
  if (res.status === 429 || res.status === 503) throw new ZoteroError('Zotero is busy. Try again in a minute.');
  if (!res.ok) throw new ZoteroError(`Zotero answered with an error (${res.status}).`);
  return res;
}

/** Checks a key against Zotero, and keeps it in this browser only once it works for the user given. */
export async function connect(userId: string, apiKey: string): Promise<ZoteroAccount> {
  const res = await call({ apiKey }, '/keys/current').catch((err: unknown) => {
    throw err instanceof ZoteroError && /refused|know/.test(err.message)
      ? new ZoteroError('Zotero does not recognise this key. Copy it again from zotero.org/settings/keys.')
      : err;
  });
  const info = (await res.json()) as { userID?: number; username?: string; access?: { user?: { library?: boolean; write?: boolean } } };
  if (String(info.userID) !== userId.trim()) throw new ZoteroError(`This key belongs to user ID ${info.userID}, not ${userId.trim()}.`);
  if (!info.access?.user?.library) throw new ZoteroError('This key cannot read your library. Allow library access for it at zotero.org/settings/keys.');
  const account = { userId: userId.trim(), apiKey, username: info.username ?? userId, write: !!info.access.user.write };
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Storage is blocked: connected for now, and asked again next time.
  }
  return account;
}

type Creator = { firstName?: string; lastName?: string; name?: string };
type Data = { key: string; itemType: string; title?: string; creators?: Creator[]; date?: string; extra?: string; citationKey?: string; contentType?: string; linkMode?: string };
type Item = { key: string; data: Data; meta?: { parsedDate?: string; numChildren?: number } };

const isPdf = (d: Data) => d.itemType === 'attachment' && d.contentType === 'application/pdf' && /^imported_/.test(d.linkMode ?? '');

function itemOf(a: ZoteroAccount, i: Item): ZoteroItem {
  const d = i.data;
  const year = (i.meta?.parsedDate ?? d.date ?? '').match(/\b\d{4}\b/)?.[0];
  // Zotero 7 has its own field; Better BibTeX keeps the key in Extra.
  const citationKey = d.citationKey || d.extra?.match(/^Citation Key:\s*(\S+)/im)?.[1];
  return {
    userId: a.userId,
    key: i.key,
    title: d.title?.trim() || 'Untitled',
    authors: (d.creators ?? []).map((c) => c.name ?? [c.firstName, c.lastName].filter(Boolean).join(' ')).filter(Boolean),
    ...(year ? { year } : {}),
    ...(citationKey ? { citationKey } : {}),
  };
}

/** The library's items matching the words given, newest first; everything recent with none. */
export async function search(a: ZoteroAccount, query: string): Promise<ZoteroResult[]> {
  const q = new URLSearchParams({ limit: '30', sort: 'dateModified', direction: 'desc', qmode: 'titleCreatorYear', ...(query.trim() ? { q: query.trim() } : {}) });
  const items = (await (await call(a, `/users/${encodeURIComponent(a.userId)}/items/top?${q}`)).json()) as Item[];
  return items
    .filter((i) => !['note', 'annotation'].includes(i.data.itemType) && (i.data.itemType !== 'attachment' || isPdf(i.data)))
    .map((i) => ({ key: i.key, item: itemOf(a, i), pdf: isPdf(i.data) || (i.meta?.numChildren ?? 0) > 0 }));
}

/** The PDFs stored with an item, as files named after it; none when it has only links or other files. */
export async function pdfsOf(a: ZoteroAccount, result: ZoteroResult): Promise<File[]> {
  const base = `/users/${encodeURIComponent(a.userId)}/items`;
  const own = (await (await call(a, `${base}/${result.key}`)).json()) as Item;
  const attachments = isPdf(own.data) ? [own] : ((await (await call(a, `${base}/${result.key}/children`)).json()) as Item[]).filter((i) => isPdf(i.data));
  const files: File[] = [];
  for (const [n, att] of attachments.entries()) {
    const blob = await (await call(a, `${base}/${att.key}/file`)).blob();
    files.push(new File([blob], `${result.item.title}${attachments.length > 1 ? ` (${n + 1})` : ''}.pdf`, { type: 'application/pdf' }));
  }
  return files;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A document's highlights, comments and excerpt comments in page order, as the HTML of a Zotero note. */
export function noteOf(p: Project, doc: DocMeta) {
  const marks = p.highlights
    .filter((h) => h.docId === doc.id)
    .sort((a, b) => (a.parts[0]?.page ?? Infinity) - (b.parts[0]?.page ?? Infinity) || (a.parts[0]?.rects[0]?.[1] ?? 0) - (b.parts[0]?.rects[0]?.[1] ?? 0));
  const cardNotes = new Map(p.cards.flatMap((c) => (c.data.kind === 'excerpt' && c.data.comment?.trim() ? [[c.data.highlightId, c.data.comment.trim()]] : [])));
  const body = marks.map((h) => {
    const where = h.parts[0] ? `p. ${h.parts[0].page}` : 'not placed';
    const notes = [commentOf(p, h)?.text, cardNotes.get(h.id)].filter(Boolean).map((t) => `<p>${escape(t!)}</p>`);
    return `<blockquote><p>${escape(h.area ? `[Figure${h.text ? `: ${h.text}` : ''}]` : `“${h.text}”`)} (${where})</p></blockquote>${notes.join('')}`;
  });
  return { html: `<h1>Notes from Gloss: ${escape(doc.name)}</h1>${body.join('')}`, count: marks.length };
}

/** Adds a note under the document's Zotero item; it needs a key that may write. */
export async function sendNote(a: ZoteroAccount, p: Project, doc: DocMeta & { zotero: ZoteroItem }) {
  if (!a.write) throw new ZoteroError('This key can only read your library. Make one that may write at zotero.org/settings/keys to send notes back.');
  const { html, count } = noteOf(p, doc);
  const res = await call(a, `/users/${encodeURIComponent(a.userId)}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ itemType: 'note', parentItem: doc.zotero.key, note: html, tags: [], collections: [], relations: {} }]),
  });
  const out = (await res.json()) as { successful?: Record<string, unknown>; failed?: Record<string, { message?: string }> };
  if (!out.successful?.['0']) throw new ZoteroError(`Zotero did not keep the note${out.failed?.['0']?.message ? `: ${out.failed['0'].message}` : '.'}`);
  return count;
}

/** How a Zotero item is cited in the documents' list and sidebar. */
export const byline = (z: ZoteroItem) => [z.authors.length > 3 ? `${z.authors[0]} et al.` : z.authors.join(', '), z.year].filter(Boolean).join(' · ');
