import { CircleAlert, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { commentOf, quoted } from '../../links';
import { selectionAnchor } from '../../pdf/anchor';
import { edit, removeHighlight, useStore } from '../../store/project';
import { m } from '../../i18n';

/**
 * Highlights whose words were not found when their document was replaced, kept with their
 * comments, links and excerpts until they are placed on a selection in the document, or deleted.
 */
export function Unplaced({ docId }: { docId: string }) {
  const highlights = useStore((s) => s.project?.highlights);
  const comments = useStore((s) => s.project?.comments);
  const lost = (highlights ?? []).filter((h) => h.docId === docId && !h.parts.length);
  const box = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(false);
  const scroller = () => box.current?.closest('.doc-pane')?.querySelector<HTMLElement>('.doc-scroll') ?? null;

  useEffect(() => {
    const onSelection = () => {
      const root = scroller();
      setSelected(!!root && !!selectionAnchor(root));
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  if (!lost.length) return null;
  return (
    <section className="unplaced" ref={box} aria-label={m.docSidebar.unplacedLabel}>
      <h3>
        <CircleAlert size={14} aria-hidden="true" /> {m.docSidebar.unplaced(lost.length)}
      </h3>
      <p className="side-note">{m.docSidebar.unplacedNote}</p>
      <ul className="unplaced-marks">
        {lost.map((h) => (
          <li key={h.id} className={`unplaced-item hl-${h.color}`}>
            <span className="text">{quoted(h)}</span>
            {h.commentId && comments && <span className="note">{commentOf({ comments }, h)?.text}</span>}
            {/* Pressing these must not take the selection away from under them. */}
            <span className="actions" onMouseDown={(e) => e.preventDefault()}>
              <button
                disabled={!selected}
                title={selected ? m.docSidebar.placeTitle : m.docSidebar.selectFirst}
                onClick={() => {
                  const anchor = selectionAnchor(scroller()!);
                  if (!anchor) return;
                  getSelection()?.removeAllRanges();
                  edit((p) => ({ highlights: p.highlights.map((x) => (x.id === h.id ? { ...x, parts: anchor.parts, text: anchor.text } : x)) }));
                }}
              >
                {m.docSidebar.place}
              </button>
              <button className="icon" aria-label={m.docSidebar.deleteUnplaced} title={m.docSidebar.deleteUnplacedTitle} onClick={() => removeHighlight(h.id)}>
                <Trash2 size={15} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
