import { m } from '../i18n';
import { findMatches, pageLines, type Match } from '../pdf/matches';
import { before } from '../pdf/folds';
import type { Card, CardLink, Color, Fold, Highlight, Project, Rect, Spot } from '../types';
import { create } from 'zustand';
import { canvasOf, canvasSpot, CARD_WIDTH, edit, newCard, PANES, uid, useStore } from './project';

/** The words last searched for in the project, offered when squeezing a document to search matches. */
export const useLastSearch = create<{ query: string }>(() => ({ query: '' }));

/** A document's matches of a search. */
export type Found = { docId: string; matches: Match[] };

/** Every match of a search in the documents given, all of the project's when none are. */
export async function findAll(query: string, docIds?: string[]): Promise<Found[]> {
  const docs = (useStore.getState().project?.docs ?? []).filter((d) => !docIds || docIds.includes(d.id));
  return Promise.all(docs.map(async (d) => ({ docId: d.id, matches: await findMatches(d.id, d.password, query).catch(() => []) })));
}

const overlap = (a: Rect, b: Rect) => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? (w * h) / Math.min(a[2] * a[3], b[2] * b[3]) : 0;
};

/** The highlight already marking a match, so acting twice on the same search does not mark it twice. */
const marking = (highlights: Highlight[], docId: string, m: Match) =>
  highlights.find((h) => h.docId === docId && !h.area && !h.typed && m.rects.every((r) => h.parts.some((p) => p.page === m.page && p.rects.some((x) => overlap(r, x) > 0.8))));

/** Rough height of an excerpt card before it is drawn, for laying cards out; the group is fitted once they are measured. */
const guessHeight = (text: string) => 74 + Math.min(10, Math.ceil(text.length / 34)) * 22;
const GAP = 24;
const PAD = 20;
const HEADER = 40;

export type Act = {
  color: Color;
  tag?: string;
  /** Excerpts what was found to the canvas on show, in a group named after the search. */
  excerpt?: boolean;
  /** Links every passage to a card, or to a new note naming the search. */
  link?: { cardId: string } | 'note';
};

/**
 * Highlights every match, as one undo step: matches already highlighted keep their highlight. Then
 * tags them, excerpts them, or links them to a card. Returns the passages it acted on.
 * Not `undoable`, it joins the step before, as when a tag was just made for it.
 */
export function actOnMatches(found: Found[], query: string, act: Act, undoable = true) {
  const { project, canvasId } = useStore.getState();
  if (!project) return [];
  const made: Highlight[] = [];
  const all = [...project.highlights];
  const ids: string[] = [];
  for (const { docId, matches } of found)
    for (const m of matches) {
      const h = marking(all, docId, m);
      if (h) ids.push(h.id);
      else {
        const fresh: Highlight = { id: uid(), docId, parts: [{ page: m.page, rects: m.rects }], text: m.text, color: act.color, ...(act.tag ? { tags: [act.tag] } : {}) };
        made.push(fresh);
        all.push(fresh);
        ids.push(fresh.id);
      }
    }
  const unique = [...new Set(ids)];
  if (!unique.length) return [];

  const excerpted = new Set(project.cards.flatMap((c) => (c.data.kind === 'excerpt' && canvasOf(project, c) === canvasId ? [c.data.highlightId] : [])));
  const cards: Card[] = [];
  let focus: string | undefined;
  if (act.excerpt) {
    const todo = unique.filter((id) => !excerpted.has(id));
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(todo.length))));
    const origin = canvasSpot.next();
    const box = newCard({ kind: 'group', title: m.engineStore.searchGroup(query) }, origin);
    let y = HEADER;
    const kids: Card[] = [];
    for (let row = 0; row * cols < todo.length; row++) {
      const line = todo.slice(row * cols, row * cols + cols);
      line.forEach((id, col) => kids.push({ ...newCard({ kind: 'excerpt', highlightId: id }, { x: PAD + col * (CARD_WIDTH + GAP), y }), parentId: box.id, selected: false }));
      y += Math.max(...line.map((id) => guessHeight(all.find((h) => h.id === id)?.text ?? ''))) + GAP;
    }
    if (kids.length) {
      // React Flow needs a group listed before the cards inside it.
      cards.push({ ...box, width: PAD * 2 + cols * CARD_WIDTH + (cols - 1) * GAP, height: y - GAP + PAD }, ...kids);
      focus = box.id;
    }
  }
  let linkTo = act.link && act.link !== 'note' ? act.link.cardId : undefined;
  if (act.link === 'note') {
    const note = newCard({ kind: 'note', text: m.engineStore.searchNote(query) }, canvasSpot.next());
    cards.push(note);
    linkTo = note.id;
    focus ??= note.id;
  }
  const tagged = act.tag ? new Set(unique) : new Set<string>();

  edit((p) => {
    const cardLinks: CardLink[] = linkTo
      ? unique.filter((id) => !p.cardLinks.some((l) => l.cardId === linkTo && l.highlightId === id)).map((id) => ({ id: uid(), cardId: linkTo!, highlightId: id }))
      : [];
    return {
      highlights: [...p.highlights.map((h) => (tagged.has(h.id) && act.tag && !h.tags?.includes(act.tag) ? { ...h, tags: [...(h.tags ?? []), act.tag] } : h)), ...made],
      cards: [...(cards.length ? p.cards.map((c) => (c.selected ? { ...c, selected: false } : c)) : p.cards), ...cards],
      cardLinks: [...p.cardLinks, ...cardLinks],
    };
  }, undoable);
  if (focus) {
    useStore.setState({ focus: { cardId: focus, at: Date.now() }, view: 'canvas' });
    if (act.excerpt) settle(focus);
  }
  return unique;
}

/**
 * Lays out a group's cards again once they have been drawn and measured, in rows as tall as their
 * tallest card, and fits the group around them. Part of the step that made them.
 */
function settle(groupId: string) {
  let tries = 0;
  const tick = () => {
    const p = useStore.getState().project;
    const kids = p?.cards.filter((c) => c.parentId === groupId) ?? [];
    if (!kids.length) return;
    if (kids.some((c) => !c.measured?.height) && ++tries < 120) return void requestAnimationFrame(tick);
    edit((q) => {
      const box = q.cards.find((c) => c.id === groupId);
      if (!box) return {};
      const inside = q.cards.filter((c) => c.parentId === groupId);
      const cols = new Set(inside.map((c) => c.position.x)).size;
      const placed = new Map<string, Card>();
      let y = HEADER;
      for (let i = 0; i < inside.length; i += cols) {
        const row = inside.slice(i, i + cols);
        row.forEach((c) => placed.set(c.id, { ...c, position: { x: c.position.x, y } }));
        y += Math.max(...row.map((c) => c.measured?.height ?? 100)) + GAP;
      }
      return { cards: q.cards.map((c) => placed.get(c.id) ?? (c.id === groupId ? { ...c, height: y - GAP + PAD } : c)) };
    }, false);
  };
  requestAnimationFrame(tick);
}

/** What to squeeze around: the matches of a search, or highlights, optionally only of a colour or with a tag. */
export type Around = { query: string } | { color?: Color; tag?: string };

/** Spans to keep in view, as [page, top, bottom] fractions. */
type Keep = [page: number, top: number, bottom: number];

async function keepsOf(docId: string, around: Around): Promise<Keep[]> {
  const p = useStore.getState().project;
  const doc = p?.docs.find((d) => d.id === docId);
  if (!p || !doc) return [];
  const parts =
    'query' in around
      ? (await findMatches(docId, doc.password, around.query)).map((m) => ({ page: m.page, rects: m.rects }))
      : p.highlights.filter((h) => h.docId === docId && (!around.color || h.color === around.color) && (!around.tag || h.tags?.includes(around.tag))).flatMap((h) => h.parts);
  return parts.flatMap((part): Keep[] => (part.rects.length ? [[part.page, Math.min(...part.rects.map((r) => r[1])), Math.max(...part.rects.map((r) => r[1] + r[3]))]] : []));
}

/** Widens each span to whole lines, with `context` lines more above and below it on its page. */
async function withContext(docId: string, keeps: Keep[], context: number): Promise<Keep[]> {
  const doc = useStore.getState().project?.docs.find((d) => d.id === docId);
  const lines = new Map<number, [number, number][]>();
  const out: Keep[] = [];
  for (const [page, top, bottom] of keeps) {
    if (!lines.has(page)) lines.set(page, await pageLines(docId, doc?.password, page).catch(() => []));
    const all = lines.get(page)!;
    const first = all.findIndex(([, b]) => b > top);
    const last = all.findLastIndex(([t]) => t < bottom);
    const a = all[Math.max(0, (first < 0 ? all.length : first) - context)];
    const b = all[Math.min(all.length - 1, (last < 0 ? -1 : last) + context)];
    // A small margin, so the tops and tails of letters are not cut.
    out.push([page, Math.max(0, Math.min(top, a?.[0] ?? top) - 0.004), Math.min(1, Math.max(bottom, b?.[1] ?? bottom) + 0.004)]);
  }
  return out;
}

/** The squeezes that hide everything but the spans kept, from the top of the document to its end. */
function foldsAround(docId: string, pages: number, keeps: Keep[]): Fold[] {
  const sorted = [...keeps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const folds: Fold[] = [];
  let from: Spot = { page: 1, y: 0 };
  const close = (to: Spot) => before(from, to) && (to.page !== from.page || to.y - from.y > 0.003) && folds.push({ id: uid(), docId, from, to });
  for (const [page, top, bottom] of sorted) {
    close({ page, y: top });
    const end = { page, y: bottom };
    if (before(from, end)) from = end;
  }
  close({ page: pages, y: 1 });
  return folds;
}

/**
 * Squeezes each document given down to what is found in it, with lines of context, replacing its
 * squeezes, all as one step. Returns how many passages were kept in view; nothing changes when none.
 */
export async function collapseAround(docIds: string[], around: Around, context: number) {
  const plans: [string, Fold[], number][] = [];
  for (const docId of docIds) {
    const doc = useStore.getState().project?.docs.find((d) => d.id === docId);
    const keeps = await keepsOf(docId, around);
    if (doc && keeps.length) plans.push([docId, foldsAround(docId, doc.pages, await withContext(docId, keeps, context)), keeps.length]);
  }
  if (!plans.length) return 0;
  const touched = new Set(plans.map(([id]) => id));
  edit((p) => ({ folds: [...p.folds.filter((f) => !touched.has(f.docId)), ...plans.flatMap(([, folds]) => folds)] }));
  // What was kept starts the document now, so the panes showing it go back to its top.
  const state = useStore.getState();
  const scrollers = document.querySelectorAll<HTMLElement>('.doc-pane .doc-scroll');
  PANES.forEach((k, i) => state[k] && touched.has(state[k]) && scrollers[i]?.scrollTo({ top: 0 }));
  return plans.reduce((n, [, , k]) => n + k, 0);
}

/** Opens every squeeze in a document, as one step. */
export const expandAll = (docId: string) => edit((p: Project) => ({ folds: p.folds.filter((f) => f.docId !== docId) }));
