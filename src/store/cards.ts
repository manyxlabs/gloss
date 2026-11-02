import type { XYPosition } from '@xyflow/react';
import type { Background, CanvasMeta, Card, Color, Point, Project, Stroke } from '../types';
import { canvasSpot, edit, newCard, uid, useStore, without } from './project';

const { getState: get } = useStore;

const SKETCH = { width: 280, height: 180 };

/** A box to write in by hand, on the canvas on show. */
export function addSketch(position = canvasSpot.next()) {
  const card: Card = { ...newCard({ kind: 'sketch', strokes: [] }, position), ...SKETCH };
  edit((p) => ({ cards: [...p.cards.map((c) => ({ ...c, selected: false })), card] }));
  return card;
}

/** A canvas nested in the one on show, with the card that opens it, as one step. */
export function addNestedCanvas(position = canvasSpot.next()) {
  const { project, canvasId } = get();
  if (!project) return;
  const canvas: CanvasMeta = { id: uid(), name: `Canvas ${project.canvases.length + 1}`, parentId: canvasId };
  const card = newCard({ kind: 'canvas', target: canvas.id }, position);
  edit((p) => ({ canvases: [...p.canvases, canvas], cards: [...p.cards.map((c) => ({ ...c, selected: false })), card] }));
  return card;
}

/** Adds a stroke to a note or an ink box, in canvas units: it is kept from the card's corner. */
export function addStroke(cardId: string, points: Point[], at: XYPosition, size: number, pen: boolean) {
  const stroke: Stroke = { id: uid(), points: points.map(([x, y, p]) => [x - at.x, y - at.y, p]), color: get().inkColor, size, pen };
  edit((p) => ({
    cards: p.cards.map((c) =>
      c.id === cardId && (c.data.kind === 'note' || c.data.kind === 'sketch') ? ({ ...c, data: { ...c.data, strokes: [...(c.data.strokes ?? []), stroke] } } as Card) : c,
    ),
  }));
}

/** Toggles a chip on a card that opens another canvas. */
export function toggleCanvasLink(cardId: string, canvasId: string) {
  edit((p) => ({
    cards: p.cards.map((c) => {
      if (c.id !== cardId) return c;
      const links = c.data.canvasLinks ?? [];
      return { ...c, data: { ...c.data, canvasLinks: links.includes(canvasId) ? links.filter((id) => id !== canvasId) : [...links, canvasId] } } as Card;
    }),
  }));
}

export type CanvasStyle = { background?: Background | null; cardColor?: Color | null; accent?: Color | null };

/** Sets how a canvas looks; null goes back to the default. */
export function setCanvasStyle(id: string, style: CanvasStyle) {
  edit((p) => ({
    canvases: p.canvases.map((c) => {
      if (c.id !== id) return c;
      const next: Record<string, unknown> = { ...c, ...style };
      for (const [k, v] of Object.entries(style)) if (v === null) delete next[k];
      return next as CanvasMeta;
    }),
  }));
}

/**
 * What an eraser passed over on the canvas, as one undo step: handwriting cards (`card`), strokes
 * in a note or ink box (`stroke`), lines between cards (`edge`), a card's link to a passage
 * (`cardlink`) and a card's chip for another canvas (`canvaslink`).
 */
export type Erased = { card: string[]; stroke: [cardId: string, strokeId: string][]; edge: string[]; cardlink: string[]; canvaslink: [cardId: string, canvasId: string][] };

export function erase(e: Erased) {
  if (!Object.values(e).some((list) => list.length)) return;
  edit((p) => {
    const strokes = new Map<string, Set<string>>();
    for (const [card, stroke] of e.stroke) strokes.set(card, (strokes.get(card) ?? new Set()).add(stroke));
    const unlinked = new Map<string, Set<string>>();
    for (const [card, canvas] of e.canvaslink) unlinked.set(card, (unlinked.get(card) ?? new Set()).add(canvas));
    const cards = p.cards.map((c) => {
      const s = strokes.get(c.id);
      const u = unlinked.get(c.id);
      if (!s && !u) return c;
      const data = { ...c.data } as Card['data'];
      if (s && (data.kind === 'note' || data.kind === 'sketch')) data.strokes = data.strokes?.filter((x) => !s.has(x.id));
      if (u) data.canvasLinks = data.canvasLinks?.filter((x) => !u.has(x));
      return { ...c, data } as Card;
    });
    const gone = new Set(e.edge);
    const q: Project = { ...p, cards, links: p.links.filter((l) => !gone.has(l.id)), cardLinks: p.cardLinks.filter((l) => !e.cardlink.includes(l.id)) };
    return { ...q, ...without(q, new Set(e.card)) };
  });
}
