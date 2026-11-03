import { openDB } from 'idb';
import { cite, commentOf } from './links';
import { openPdf, readTexts } from './pdf/pdfjs';
import { cardText, snippets } from './search';
import { fileKey, getFile, listProjects } from './store/db';
import type { DocMeta, Project } from './types';

/**
 * Each document's page texts, kept in a database of their own by the version of the file they
 * come from, which never changes, so the start page can search every project without opening its
 * PDFs again. A database apart from the projects' own, as it can be rebuilt and is not backed up.
 */
const db = openDB('gloss-text', 1, { upgrade: (d) => void d.createObjectStore('pages') });
const memory = new Map<string, string[]>();

async function textsOf(doc: DocMeta): Promise<string[]> {
  const key = fileKey(doc);
  const known = memory.get(key) ?? (await (await db).get('pages', key));
  if (known) {
    memory.set(key, known);
    return known;
  }
  const blob = await getFile(key);
  if (!blob) return [];
  const { doc: pdf, close } = await openPdf(blob, doc.password);
  try {
    const pages = await readTexts(pdf);
    memory.set(key, pages);
    await (await db).put('pages', pages, key);
    return pages;
  } finally {
    await close();
  }
}

export type AllHit = { id: string; project: Project; label: string; snippet?: { before: string; match: string; after: string } } & (
  { kind: 'project' } | { kind: 'page'; docId: string; page: number } | { kind: 'card'; cardId: string } | { kind: 'comment' | 'box'; highlightId: string }
);

const PER_PROJECT = 40;

/**
 * Every project's name, document pages, cards, comments and text boxes that mention the query. Documents not
 * read before are read first, reporting how many of how many as it goes; the index forgets files
 * no project shows any more.
 */
export async function searchAll(raw: string, progress: (done: number, total: number) => void): Promise<AllHit[]> {
  const query = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  const projects = await listProjects();
  const docs = projects.flatMap((p) => p.docs);
  const keys = new Set(docs.map(fileKey));
  const store = await db;
  const missing = docs.filter((d) => !memory.has(fileKey(d)));
  const cached = new Set((await store.getAllKeys('pages')) as string[]);
  const toRead = missing.filter((d) => !cached.has(fileKey(d)));
  let done = 0;
  if (toRead.length) progress(0, toRead.length);
  for (const d of toRead) {
    await textsOf(d).catch(() => []);
    progress(++done, toRead.length);
  }
  for (const key of cached) if (!keys.has(key)) void store.delete('pages', key);

  const hits: AllHit[] = [];
  for (const project of projects) {
    const mine: AllHit[] = [];
    if (project.name.toLowerCase().includes(query)) mine.push({ id: `p-${project.id}`, kind: 'project', project, label: project.name });
    for (const doc of project.docs) {
      const pages = await textsOf(doc).catch(() => [] as string[]);
      pages.forEach((text, i) =>
        snippets(text.replace(/\s+/g, ' '), query).forEach((snippet, n) =>
          mine.push({ id: `d-${project.id}-${doc.id}-${i}-${n}`, kind: 'page', project, docId: doc.id, page: i + 1, label: `${doc.name}, p. ${i + 1}`, snippet }),
        ),
      );
    }
    for (const c of project.cards) {
      const text = cardText(project, c);
      if (text.toLowerCase().includes(query)) mine.push({ id: `c-${project.id}-${c.id}`, kind: 'card', project, cardId: c.id, label: text });
    }
    // Projects saved before comments were shared have none until they are next opened.
    for (const c of project.comments ?? []) {
      const h = project.highlights.find((x) => x.commentId === c.id);
      if (h && c.text.toLowerCase().includes(query))
        mine.push({ id: `m-${project.id}-${c.id}`, kind: 'comment', project, highlightId: h.id, label: `${commentOf(project, h)?.text} (on ${cite(project, h)})` });
    }
    for (const h of project.highlights)
      if (h.typed && h.text.toLowerCase().includes(query)) mine.push({ id: `b-${project.id}-${h.id}`, kind: 'box', project, highlightId: h.id, label: cite(project, h) });
    hits.push(...mine.slice(0, PER_PROJECT));
  }
  return hits;
}
