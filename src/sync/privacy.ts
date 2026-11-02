import { isLocalCanvas } from '../canvases';
import type { Project } from '../types';

type Lists = Pick<Project, 'docs' | 'highlights' | 'cards' | 'links' | 'inks' | 'folds' | 'canvases' | 'comments' | 'passageLinks' | 'cardLinks'>;

/**
 * Everything kept on this device only: documents and canvases marked so, the canvases nested in
 * them, and all that is anchored to them, down to links and comments that would lead into them. A
 * comment stays shared while any shared passage has it.
 */
export function privateIds(p: Lists): Set<string> {
  const docs = new Set(p.docs.filter((d) => d.local).map((d) => d.id));
  const canvases = new Set(p.canvases.filter((c) => isLocalCanvas(p, c.id)).map((c) => c.id));
  if (!docs.size && !canvases.size) return new Set();
  const highlights = new Set(p.highlights.filter((h) => docs.has(h.docId)).map((h) => h.id));
  const first = p.canvases[0]?.id;
  const cards = new Set(
    p.cards
      .filter(
        (c) =>
          canvases.has(c.data.canvasId ?? first ?? '') ||
          (c.data.kind === 'excerpt' && highlights.has(c.data.highlightId)) ||
          (c.data.kind === 'canvas' && canvases.has(c.data.target)),
      )
      .map((c) => c.id),
  );
  const shared = new Set(p.highlights.flatMap((h) => (h.commentId && !highlights.has(h.id) ? [h.commentId] : [])));
  return new Set([
    ...docs,
    ...canvases,
    ...highlights,
    ...cards,
    ...p.inks.filter((i) => docs.has(i.docId)).map((i) => i.id),
    ...p.folds.filter((f) => docs.has(f.docId)).map((f) => f.id),
    ...p.links.filter((l) => cards.has(l.source) || cards.has(l.target)).map((l) => l.id),
    ...p.comments.filter((c) => !shared.has(c.id)).map((c) => c.id),
    ...p.passageLinks.filter((l) => highlights.has(l.a) || highlights.has(l.b)).map((l) => l.id),
    ...p.cardLinks.filter((l) => cards.has(l.cardId) || highlights.has(l.highlightId)).map((l) => l.id),
  ]);
}
