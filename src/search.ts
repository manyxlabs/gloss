import { pageTexts } from './pdf/pdfjs';
import { cardTags, tagWord } from './tags';
import type { Card, Project, Tag } from './types';

export type DocHit = {
  docId: string;
  page: number;
  before: string;
  match: string;
  after: string;
};
export type CardHit = { cardId: string; text: string };
export type CommentHit = { highlightId: string; docId: string; page: number; note: string };
export type HighlightHit = { highlightId: string; docId: string; page: number; text: string };

/**
 * A query split into its words and its `#tag` terms. Each term picks the tags whose names start with
 * it, so a tag can be found while its name is still being typed; null for a term that names none.
 */
export function parseQuery(raw: string, tags: Tag[]) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const terms = words.filter((w) => w.length > 1 && w.startsWith('#')).map((w) => w.slice(1).toLowerCase());
  const text = words
    .filter((w) => !(w.length > 1 && w.startsWith('#')))
    .join(' ')
    .toLowerCase();
  const picks = terms.map((term) => {
    const exact = tags.filter((t) => tagWord(t).toLowerCase() === term);
    const found = exact.length ? exact : tags.filter((t) => tagWord(t).toLowerCase().startsWith(term));
    return found.length ? found.map((t) => t.id) : null;
  });
  return { text, picks };
}

/** Whether tag ids carry a tag of every term. */
const tagged = (ids: string[] | undefined, picks: (string[] | null)[]) => picks.every((pick) => !!pick && !!ids?.some((id) => pick.includes(id)));

const PER_DOC = 30;
const CONTEXT = 48;

export function snippets(text: string, query: string) {
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
  const { text: query, picks } = parseQuery(raw, project.tags);
  // With tags named, what is found is what carries them: passages and cards, narrowed by any words.
  if (picks.length) {
    const highlights: HighlightHit[] = project.highlights.flatMap((h) =>
      tagged(h.tags, picks) && h.text.toLowerCase().includes(query) ? [{ highlightId: h.id, docId: h.docId, page: h.parts[0]?.page ?? 1, text: h.text || 'Figure' }] : [],
    );
    const cards: CardHit[] = project.cards.flatMap((c) => {
      const text = cardText(project, c);
      return c.data.kind !== 'excerpt' && tagged(cardTags(project, c), picks) && text.toLowerCase().includes(query) ? [{ cardId: c.id, text: text || 'Handwriting' }] : [];
    });
    return { docs: [] as DocHit[], cards, comments: [] as CommentHit[], highlights };
  }
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
  return { docs, cards, comments, highlights: [] as HighlightHit[] };
}

/** The words on a card: a note, a group's name, or an excerpt with the comment on it. Handwriting has none. */
export function cardText(p: Project, c: Card) {
  const d = c.data;
  if (d.kind === 'note') return d.text.trim();
  if (d.kind === 'group') return d.title.trim();
  if (d.kind === 'ink') return '';
  return `${p.highlights.find((h) => h.id === d.highlightId)?.text ?? ''} ${d.comment ?? ''}`.trim();
}
