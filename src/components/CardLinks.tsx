import { Link2, SquareStack } from 'lucide-react';
import { docName, where } from '../links';
import { setCanvas, showSource, useStore } from '../store/project';

/**
 * The passages a card was linked to with the pen, each a chip that opens the document there, and
 * the canvases it leads to, each a chip that opens that canvas. The eraser finds them by their data
 * attributes.
 */
export function CardLinks({ cardId }: { cardId: string }) {
  const project = useStore((s) => s.project);
  const linked = (project?.cardLinks ?? []).flatMap((l) => {
    const h = l.cardId === cardId && project!.highlights.find((x) => x.id === l.highlightId);
    return h ? [{ id: l.id, h }] : [];
  });
  const canvasLinks = project?.cards.find((c) => c.id === cardId)?.data.canvasLinks ?? [];
  const canvases = project?.canvases.filter((c) => canvasLinks.includes(c.id)) ?? [];
  if (!project || (!linked.length && !canvases.length)) return null;
  return (
    <div className="card-links nodrag">
      {linked.map(({ id, h }) => (
        <button key={id} className={`hl-${h.color}`} data-card-link={id} onClick={() => showSource(h.id)} title="Show the linked passage">
          <Link2 size={12} aria-hidden="true" />
          <span>
            Linked to {docName(project, h.docId)} {where(h)}
          </span>
        </button>
      ))}
      {canvases.map((c) => (
        <button key={c.id} className="canvas-chip" data-canvas-link={`${cardId} ${c.id}`} onClick={() => setCanvas(c.id)} title={`Open the canvas “${c.name}”`}>
          <SquareStack size={12} aria-hidden="true" />
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  );
}
