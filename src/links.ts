import type { Card, CardLink, Comment, Highlight, PassageLink, Project } from './types';

/** Drops comments, passage links and card links whose passages or cards are gone; a comment stays while any passage still names it. */
export function prune(p: Pick<Project, 'highlights' | 'cards' | 'comments' | 'passageLinks' | 'cardLinks'>): Pick<Project, 'comments' | 'passageLinks' | 'cardLinks'> {
  const highlights = new Set(p.highlights.map((h) => h.id));
  const cards = new Set(p.cards.map((c) => c.id));
  const named = new Set(p.highlights.flatMap((h) => (h.commentId ? [h.commentId] : [])));
  return {
    comments: p.comments.filter((c) => named.has(c.id)),
    passageLinks: p.passageLinks.filter((l) => highlights.has(l.a) && highlights.has(l.b)),
    cardLinks: p.cardLinks.filter((l) => cards.has(l.cardId) && highlights.has(l.highlightId)),
  };
}

type Legacy = Omit<Project, 'comments' | 'passageLinks' | 'cardLinks' | 'highlights'> &
  Partial<Pick<Project, 'comments' | 'passageLinks' | 'cardLinks'>> & { highlights: (Highlight & { note?: string })[] };

/**
 * Projects saved before comments could be shared kept each one on its highlight as `note`; each
 * becomes a comment of its own. Returns the project as it is when there is nothing to change.
 */
export function migrate(p: Legacy): Project {
  if (p.comments && p.passageLinks && p.cardLinks && !p.highlights.some((h) => 'note' in h)) return p as Project;
  const comments: Comment[] = [...(p.comments ?? [])];
  const highlights = p.highlights.map(({ note, ...h }) => {
    if (!note?.trim()) return h;
    const comment = { id: crypto.randomUUID(), text: note.trim() };
    comments.push(comment);
    return { ...h, commentId: comment.id };
  });
  return { ...p, highlights, comments, passageLinks: p.passageLinks ?? [], cardLinks: p.cardLinks ?? [], updatedAt: Date.now() };
}

export const commentOf = (p: Pick<Project, 'comments'>, h: Highlight) => (h.commentId ? p.comments.find((c) => c.id === h.commentId) : undefined);

/** What a passage is linked to: other passages, then cards. */
export type End = { link: PassageLink; highlight: Highlight } | { link: CardLink; card: Card };

export function endsOf(p: Pick<Project, 'highlights' | 'cards' | 'passageLinks' | 'cardLinks'>, highlightId: string): End[] {
  const passages = p.passageLinks.flatMap((link) => {
    const other = link.a === highlightId ? link.b : link.b === highlightId ? link.a : null;
    const highlight = other && p.highlights.find((h) => h.id === other);
    return highlight ? [{ link, highlight }] : [];
  });
  const cards = p.cardLinks.flatMap((link) => {
    const card = link.highlightId === highlightId && p.cards.find((c) => c.id === link.cardId);
    return card ? [{ link, card }] : [];
  });
  return [...passages, ...cards];
}

export const docName = (p: Pick<Project, 'docs'>, docId: string) => p.docs.find((d) => d.id === docId)?.name ?? 'Document';

/** A figure has no text to quote; it is marked where the image would go, with any text it holds. */
export const quoted = (h: Highlight) => (h.area ? `[Figure${h.text ? `: ${h.text}` : ''}]` : h.text);

/** Where a passage is: its page, or that it waits to be placed again since its document was replaced. */
export const where = (h: Highlight) => (h.parts[0] ? `p. ${h.parts[0].page}` : 'not placed');

/** A passage as notes cite it: its words, a figure's, or a text box's, which are the reader's own and so not quoted, with where it is. */
export const cite = (p: Pick<Project, 'docs'>, h: Highlight) => `${h.area || h.typed ? quoted(h) : `“${h.text}”`} (${docName(p, h.docId)}, ${where(h)})`;
