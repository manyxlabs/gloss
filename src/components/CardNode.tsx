import { Handle, NodeResizeControl, Position, ResizeControlVariant, type NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { showSource, updateCard, useStore } from '../store/project';
import type { Card } from '../types';

/**
 * A textarea that grows with its text. A hidden copy of the text sizes the box in CSS, so the
 * height stays right when the font finishes loading or the card is resized.
 */
function Grow({ value, onChange, placeholder, autoFocus, label }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // React Flow keeps a new card hidden until it has measured it, and a hidden field cannot take focus.
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      ref.current?.focus();
      if (document.activeElement !== ref.current && ++tries < 30) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);
  return (
    <div className="grow" data-value={value || placeholder}>
      <textarea ref={ref} className="nodrag nowheel" rows={1} value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function CardNode({ id, data, selected }: NodeProps<Card>) {
  const highlight = useStore((s) => (data.kind === 'excerpt' ? s.project?.highlights.find((h) => h.id === data.highlightId) : undefined));
  const doc = useStore((s) => (highlight ? s.project?.docs.find((d) => d.id === highlight.docId) : undefined));
  // A new, empty note opens ready to type; the flag is read once, so later edits do not steal focus.
  const [fresh] = useState(data.kind === 'note' && data.text === '');
  const [commenting, setCommenting] = useState(false);

  return (
    <article className={`card ${data.kind}${selected ? ' selected' : ''}${highlight ? ` hl-${highlight.color}` : ''}`}>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} />
      ))}
      <NodeResizeControl variant={ResizeControlVariant.Line} position={Position.Right} resizeDirection="horizontal" minWidth={160} maxWidth={720} className="resize" />

      {data.kind === 'note' ? (
        <Grow value={data.text} onChange={(text) => updateCard(id, { text })} placeholder="Write a note" autoFocus={fresh} label="Note" />
      ) : highlight ? (
        <>
          <blockquote>{highlight.text}</blockquote>
          <footer>
            <button className="source nodrag" onClick={() => showSource(highlight.id)} title="Show it in the document">
              {doc?.name ?? 'Document'} · p. {highlight.parts[0]?.page}
            </button>
            {data.comment === undefined && !commenting && (
              <button className="nodrag ghost" onClick={() => setCommenting(true)}>
                Comment
              </button>
            )}
          </footer>
          {(data.comment !== undefined || commenting) && (
            <Grow value={data.comment ?? ''} onChange={(comment) => updateCard(id, { comment })} placeholder="Your thoughts" autoFocus={commenting} label="Comment" />
          )}
        </>
      ) : (
        <p className="missing">The text this came from is gone.</p>
      )}
    </article>
  );
}
