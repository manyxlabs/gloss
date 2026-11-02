import { pageTexts } from './pdf/pdfjs';
import type { Project } from './types';

export type DocHit = { docId: string; page: number; before: string; match: string; after: string };
export type CardHit = { cardId: string; text: string };

const PER_DOC = 30;
const CONTEXT = 48;

function snippets(text: string, query: string) {
  const out: Omit<DocHit, 'docId' | 'page'>[] = [];
  const lower = text.toLowerCase();
  for (let i = lower.indexOf(query); i >= 0 && out.length < PER_DOC; i = lower.indexOf(query, i + query.length)) {
    out.push({ before: text.slice(Math.max(0, i - CONTEXT), i), match: text.slice(i, i + query.length), after: text.slice(i + query.length, i + query.length + CONTEXT) });
  }
  return out;
}

/** Every page of every document, and every card, that mentions the query. */
export async function search(project: Project, raw: string) {
  const query = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  const docs: DocHit[] = [];
  for (const doc of project.docs) {
    const pages = await pageTexts(doc.id).catch(() => [] as string[]);
    const hits = pages.flatMap((text, i) => snippets(text.replace(/\s+/g, ' '), query).map((s) => ({ docId: doc.id, page: i + 1, ...s })));
    docs.push(...hits.slice(0, PER_DOC));
  }
  const cards: CardHit[] = project.cards.flatMap((c) => {
    const text = c.data.kind === 'note' ? c.data.text : `${project.highlights.find((h) => h.id === (c.data as { highlightId: string }).highlightId)?.text ?? ''} ${c.data.comment ?? ''}`;
    return text.toLowerCase().includes(query) ? [{ cardId: c.id, text: text.trim() }] : [];
  });
  return { docs, cards };
}
