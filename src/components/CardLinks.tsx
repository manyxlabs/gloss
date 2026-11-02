import { Link2 } from 'lucide-react';
import { docName } from '../links';
import { showSource, useStore } from '../store/project';

/** The passages a card was linked to with the pen, each a chip that opens the document there. */
export function CardLinks({ cardId }: { cardId: string }) {
  const project = useStore((s) => s.project);
  const linked = (project?.cardLinks ?? []).flatMap((l) => {
    const h = l.cardId === cardId && project!.highlights.find((x) => x.id === l.highlightId);
    return h ? [{ id: l.id, h }] : [];
  });
  if (!project || !linked.length) return null;
  return (
    <div className="card-links nodrag">
      {linked.map(({ id, h }) => (
        <button key={id} className={`hl-${h.color}`} onClick={() => showSource(h.id)} title="Show the linked passage">
          <Link2 size={12} aria-hidden="true" />
          <span>
            Linked to {docName(project, h.docId)} p. {h.parts[0]?.page}
          </span>
        </button>
      ))}
    </div>
  );
}
