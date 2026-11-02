import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant, type NodeProps } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { outline, pathOf, SCREEN } from '../ink';
import { regionImage } from '../pdf/pdfjs';
import { checkpoint, showSource, ungroup, updateCard, useStore } from '../store/project';
import type { Card, ExcerptData, GroupData, Highlight, InkData, NoteData } from '../types';

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

/**
 * A figure boxed in a document, drawn from the PDF at twice the screen's resolution so it stays
 * sharp in a widened card. Images are drawn on demand rather than kept in the project.
 */
function Figure({ highlight, password }: { highlight: Highlight; password?: string }) {
  const part = highlight.parts[0];
  const [image, setImage] = useState<{ url: string } | { failed: true } | null>(null);
  useEffect(() => {
    const rect = part?.rects[0];
    if (!part || !rect) return;
    let stale = false;
    regionImage(highlight.docId, password, part.page, rect, 2 * devicePixelRatio).then(
      (url) => !stale && setImage({ url }),
      () => !stale && setImage({ failed: true }),
    );
    return () => void (stale = true);
  }, [highlight.docId, password, part]);
  if (image && 'url' in image) return <img className="snip" src={image.url} alt={highlight.text || 'Figure'} draggable={false} />;
  return <div className="snip">{image ? 'The figure could not be drawn from the PDF.' : null}</div>;
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function InkCard({ data, selected }: { data: InkData; selected: boolean }) {
  const d = useMemo(() => pathOf(outline(data.points, data.size, data.pen)), [data]);
  return (
    <svg className={`ink-card${selected ? ' selected' : ''}`} data-ink-card>
      <path d={d} fill={SCREEN[data.color]} />
    </svg>
  );
}

function GroupCard({ id, data, selected }: { id: string; data: GroupData; selected: boolean }) {
  return (
    <section className={`group${selected ? ' selected' : ''}`} aria-label={data.title || 'Group'}>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={120} lineClassName="group-edge" handleClassName="group-corner" onResizeStart={checkpoint} />
      <header>
        <input className="nodrag" value={data.title} placeholder="Name this group" aria-label="Group name" onChange={(e) => updateCard(id, { title: e.target.value })} />
        <button className="nodrag ghost" onClick={() => ungroup(id)} title="Keep the cards, remove the group">
          Ungroup
        </button>
      </header>
    </section>
  );
}

export function CardNode(props: NodeProps<Card>) {
  const { data, selected } = props;
  if (data.kind === 'group') return <GroupCard id={props.id} data={data} selected={selected} />;
  return (
    <>
      {data.kind === 'ink' ? <InkCard data={data} selected={selected} /> : <TextCard {...props} data={data} />}
      {/* After the card, so they sit above it and can be grabbed. */}
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} />
      ))}
    </>
  );
}

function TextCard({ id, data, selected }: NodeProps<Card> & { data: ExcerptData | NoteData }) {
  const highlight = useStore((s) => (data.kind === 'excerpt' ? s.project?.highlights.find((h) => h.id === data.highlightId) : undefined));
  const doc = useStore((s) => (highlight ? s.project?.docs.find((d) => d.id === highlight.docId) : undefined));
  // A new, empty note opens ready to type; the flag is read once, so later edits do not steal focus.
  const [fresh] = useState(data.kind === 'note' && data.text === '');
  const [commenting, setCommenting] = useState(false);

  return (
    <article className={`card ${data.kind}${selected ? ' selected' : ''}${highlight ? ` hl-${highlight.color}` : ''}`}>
      <NodeResizeControl
        variant={ResizeControlVariant.Line}
        position={Position.Right}
        resizeDirection="horizontal"
        minWidth={160}
        maxWidth={720}
        className="resize"
        onResizeStart={checkpoint}
      />

      {data.kind === 'note' ? (
        <Grow value={data.text} onChange={(text) => updateCard(id, { text })} placeholder="Write a note" autoFocus={fresh} label="Note" />
      ) : highlight ? (
        <>
          {highlight.area ? <Figure highlight={highlight} password={doc?.password} /> : <blockquote>{highlight.text}</blockquote>}
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
