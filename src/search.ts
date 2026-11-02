import { pageTexts } from './pdf/pdfjs';
import type { Card, Project } from './types';

export type DocHit = {
  docId: string;
  page: number;
  before: string;
  match: string;
  after: string;
};
export type CardHit = { cardId: string; text: string };
export type CommentHit = { highlightId: string; docId: string; page: number; note: string };

const PER_DOC = 30;
const CONTEXT = 48;

function snippets(text: string, query: string) {
  const out: Omit<DocHit, 'docId' | 'page'>[] = [];
  const lower = text.toLowerCase();
  for (let i = lower.indexOf(query); i >= 0 && out.length < PER_DOC; i = lower.indexOf(query, i + query.length)) {
    out.push({
      before: text.slice(Math.max(0, i - CONTEXT), i),
      match: text.slice(i, i + query.length),
      after: text.slice(i + query.length, i + query.length + CONTEXT),
    });
  }
  return out;
}

/** Every page of every document, every card and every comment in a document's margin that mentions the query. */
export async function search(project: Project, raw: string) {
  const query = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  const docs: DocHit[] = [];
  for (const doc of project.docs) {
    const pages = await pageTexts(doc.id, doc.password).catch(() => [] as string[]);
    const hits = pages.flatMap((text, i) =>
      snippets(text.replace(/\s+/g, ' '), query).map((s) => ({
        docId: doc.id,
        page: i + 1,
        ...s,
      })),
    );
    docs.push(...hits.slice(0, PER_DOC));
  }
  const cards: CardHit[] = project.cards.flatMap((c) => {
    const text = cardText(project, c);
    return text.toLowerCase().includes(query) ? [{ cardId: c.id, text }] : [];
  });
  // A comment on several passages is found once, at the first of them.
  const comments: CommentHit[] = project.comments.flatMap((c) => {
    const h = project.highlights.find((x) => x.commentId === c.id);
    return h && c.text.toLowerCase().includes(query) ? [{ highlightId: h.id, docId: h.docId, page: h.parts[0]?.page ?? 1, note: c.text }] : [];
  });
  return { docs, cards, comments };
}

/** The words on a card: a note, a group's name, a nested canvas's name, or an excerpt with the comment on it. Handwriting has none. */
export function cardText(p: Project, c: Card) {
  const d = c.data;
  if (d.kind === 'note') return d.text.trim();
  if (d.kind === 'group') return d.title.trim();
  if (d.kind === 'ink' || d.kind === 'sketch') return '';
  if (d.kind === 'canvas') return p.canvases.find((x) => x.id === d.target)?.name ?? '';
  return `${p.highlights.find((h) => h.id === d.highlightId)?.text ?? ''} ${d.comment ?? ''}`.trim();
}
