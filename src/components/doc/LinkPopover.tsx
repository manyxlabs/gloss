import { FileText, StickyNote, X } from 'lucide-react';
import { useEffect } from 'react';
import { docName, endsOf, quoted, where } from '../../links';
import { cardText } from '../../search';
import { showEnd, unlinkCard, unlinkPassages } from '../../store/links';
import { showCard, shownPanes, useStore, type Pane } from '../../store/project';
import type { Highlight } from '../../types';
import { m } from '../../i18n';

/** What a passage's link marker opens: each passage and card it is linked to, to go to or unlink. */
export function LinkPopover({ highlight, pane, x, y, onClose }: { highlight: Highlight; pane: Pane; x: number; y: number; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const split = useStore((s) => shownPanes(s) > 1);
  const ends = project ? endsOf(project, highlight.id) : [];
  const only = ends.length === 1 && 'highlight' in ends[0]! ? ends[0].highlight.id : null;

  // With several panes open, a single linked passage opens beside this one straight away, so both are in view.
  useEffect(() => {
    if (split && only) showEnd(only, pane);
  }, [split, only, pane]);
  useEffect(() => {
    if (!ends.length) onClose();
  }, [ends.length, onClose]);

  if (!project) return null;
  return (
    <div className="popup below link-popover" style={{ left: x, top: y }} role="dialog" aria-label={m.docMarks.linkedPassages}>
      <ul>
        {ends.map((end) => (
          <li key={end.link.id}>
            {'highlight' in end ? (
              <button
                className={`end hl-${end.highlight.color}`}
                onClick={() => {
                  if (!split) onClose();
                  showEnd(end.highlight.id, pane);
                }}
              >
                <FileText size={14} aria-hidden="true" />
                <span className="text">{quoted(end.highlight) || m.doc.figure}</span>
                <span className="where">
                  {docName(project, end.highlight.docId)} · {where(end.highlight)}
                </span>
              </button>
            ) : (
              <button className="end" onClick={() => (onClose(), showCard(end.card.id))}>
                <StickyNote size={14} aria-hidden="true" />
                <span className="text">{cardText(project, end.card) || m.doc.handwriting}</span>
                <span className="where">{m.docMarks.cardOnCanvas}</span>
              </button>
            )}
            <button
              className="icon"
              aria-label={m.docMarks.unlink}
              title={m.docMarks.unlinkTitle}
              onClick={() => ('highlight' in end ? unlinkPassages(end.link.id) : unlinkCard(end.link.id))}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
