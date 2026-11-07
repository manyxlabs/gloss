import { create } from 'zustand';
import { m } from '../i18n';
import { prune } from '../links';
import type { Anchor } from '../pdf/anchor';
import type { Color, Highlight } from '../types';
import { addHighlight, edit, PANES, setActiveDoc, showSource, shownPanes, uid, useStore, type Pane } from './project';

/**
 * Waiting for the reader to pick a passage: the other end of a link from `from`, or another
 * passage for comment `commentId`. `refused` explains why the last pick was not taken.
 */
export type Linking = ({ kind: 'link'; from: string } | { kind: 'attach'; commentId: string }) & { refused?: string };
export const useLinking = create<{ linking: Linking | null }>(() => ({ linking: null }));

export const startLinking = (linking: Linking) => useLinking.setState({ linking });
export const cancelLinking = () => useLinking.setState({ linking: null });

const project = () => useStore.getState().project;

/** Takes the passage picked while linking; false when it cannot be, with the reason shown, and linking carries on. */
export function pick(highlightId: string) {
  const { linking } = useLinking.getState();
  const p = project();
  const target = p?.highlights.find((h) => h.id === highlightId);
  if (!linking || !p || !target) return false;
  const refuse = (refused: string) => (useLinking.setState({ linking: { ...linking, refused } }), false);
  if (linking.kind === 'link') {
    if (highlightId === linking.from) return refuse(m.engineStore.linkSelf);
    const exists = p.passageLinks.some((l) => (l.a === linking.from && l.b === highlightId) || (l.b === linking.from && l.a === highlightId));
    if (!exists) edit((q) => ({ passageLinks: [...q.passageLinks, { id: uid(), a: linking.from, b: highlightId }] }));
  } else {
    if (target.commentId === linking.commentId) return refuse(m.engineStore.hasThisComment);
    // A passage holds one comment, so taking a second would silently drop the first.
    if (target.commentId) return refuse(m.engineStore.hasOwnComment);
    edit((q) => ({ highlights: q.highlights.map((h) => (h.id === highlightId ? { ...h, commentId: linking.commentId } : h)) }));
  }
  cancelLinking();
  return true;
}

/** A selection picked while linking becomes a highlight, taken in the same undo step as the link. */
export const pickSelection = (docId: string, anchor: Anchor, color: Color) => pick(addHighlight(docId, anchor.parts, anchor.text, color).id);

/** Writes the comment beside a passage, which edits it for every passage sharing it; empty, it is removed from all of them. */
export function setComment(highlightId: string, text: string) {
  const trimmed = text.trim();
  edit((p) => {
    const h = p.highlights.find((x) => x.id === highlightId);
    if (!h) return {};
    if (!trimmed) {
      const highlights = p.highlights.map((x) => (h.commentId && x.commentId === h.commentId ? withoutComment(x) : x));
      return { highlights, ...prune({ ...p, highlights }) };
    }
    // A comment removed on another device while this passage kept its id is written anew.
    if (p.comments.some((c) => c.id === h.commentId)) return { comments: p.comments.map((c) => (c.id === h.commentId ? { ...c, text: trimmed } : c)) };
    const comment = { id: uid(), text: trimmed };
    return { comments: [...p.comments, comment], highlights: p.highlights.map((x) => (x.id === highlightId ? { ...x, commentId: comment.id } : x)) };
  });
  return project()?.highlights.find((x) => x.id === highlightId)?.commentId;
}

const withoutComment = ({ commentId: _, ...h }: Highlight): Highlight => h;

/** Takes a shared comment off one passage, leaving it on the others. */
export const detachComment = (highlightId: string) =>
  edit((p) => {
    const highlights = p.highlights.map((h) => (h.id === highlightId ? withoutComment(h) : h));
    return { highlights, ...prune({ ...p, highlights }) };
  });

/** A selection with a comment: the highlight and its comment are one undo step. */
export function commentSelection(docId: string, anchor: Anchor, color: Color, text: string) {
  const h = addHighlight(docId, anchor.parts, anchor.text, color);
  return setComment(h.id, text) ? h : undefined;
}

export const unlinkPassages = (id: string) => edit((p) => ({ passageLinks: p.passageLinks.filter((l) => l.id !== id) }));
export const unlinkCard = (id: string) => edit((p) => ({ cardLinks: p.cardLinks.filter((l) => l.id !== id) }));

export function linkCard(highlightId: string, cardId: string) {
  const p = project();
  if (!p || p.cardLinks.some((l) => l.highlightId === highlightId && l.cardId === cardId)) return;
  edit((q) => ({ cardLinks: [...q.cardLinks, { id: uid(), cardId, highlightId }] }));
}

/**
 * Shows the other end of a link: in another pane while several are open, so both passages are in
 * view together (one already showing its document, or else the next to the right), or else here.
 */
export function showEnd(highlightId: string, from: Pane) {
  const s = useStore.getState();
  const h = s.project?.highlights.find((x) => x.id === highlightId);
  if (!h) return;
  const n = shownPanes(s);
  const others = Array.from({ length: n - 1 }, (_, i) => ((from + 1 + i) % n) as Pane);
  const pane = others.find((p) => s[PANES[p]] === h.docId) ?? others[0] ?? from;
  setActiveDoc(h.docId, pane);
  showSource(highlightId, pane);
}
