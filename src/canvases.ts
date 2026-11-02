import type { CanvasMeta, Card, Project } from './types';

/** The canvas a card is on: cards from before there were several have none and are on the first. */
const onCanvas = (canvases: CanvasMeta[], card: Card) => card.data.canvasId ?? canvases[0]?.id;

/**
 * Drops nested canvases whose canvas card is gone, with every card on them, and so on down the
 * tree, and takes links to dropped canvases off the cards that remain. Returns the lists as they
 * were when nothing goes.
 */
export function dropOrphans(canvases: CanvasMeta[], cards: Card[]): { canvases: CanvasMeta[]; cards: Card[] } {
  let [kept, left] = [canvases, cards];
  for (;;) {
    const ids = new Set(kept.map((c) => c.id));
    const opened = new Set(left.flatMap((c) => (c.data.kind === 'canvas' && ids.has(onCanvas(kept, c) ?? '') ? [c.data.target] : [])));
    const gone = new Set(kept.filter((c) => c.parentId && (!ids.has(c.parentId) || !opened.has(c.id))).map((c) => c.id));
    if (!gone.size) break;
    kept = kept.filter((c) => !gone.has(c.id));
    left = left.filter((c) => !gone.has(onCanvas(canvases, c) ?? ''));
  }
  const ids = new Set(kept.map((c) => c.id));
  if (left.some((c) => c.data.canvasLinks?.some((id) => !ids.has(id))))
    left = left.map((c) =>
      c.data.canvasLinks?.some((id) => !ids.has(id)) ? ({ ...c, data: { ...c.data, canvasLinks: c.data.canvasLinks.filter((id) => ids.has(id)) } } as Card) : c,
    );
  return kept === canvases && left === cards ? { canvases, cards } : { canvases: kept, cards: left };
}

/** A canvas and the canvases it is nested in, from the top level down. */
export function pathTo(p: Pick<Project, 'canvases'>, id: string): CanvasMeta[] {
  const out: CanvasMeta[] = [];
  for (let c = p.canvases.find((x) => x.id === id); c && !out.includes(c); c = c.parentId ? p.canvases.find((x) => x.id === c!.parentId) : undefined) out.unshift(c);
  return out;
}

/** The canvases nested in one, at any depth, each with how deep it is below it. */
export function nestedIn(p: Pick<Project, 'canvases'>, id: string, depth = 1): { canvas: CanvasMeta; depth: number }[] {
  // Canvases only ever nest as they are made, so a cycle cannot form; the bound is for a damaged project.
  if (depth > 32) return [];
  return p.canvases.filter((c) => c.parentId === id).flatMap((canvas) => [{ canvas, depth }, ...nestedIn(p, canvas.id, depth + 1)]);
}

/** Whether a canvas, or one it is nested in, is kept on this device only. */
export const isLocalCanvas = (p: Pick<Project, 'canvases'>, id: string) => pathTo(p, id).some((c) => c.local);
