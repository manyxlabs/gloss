import { ChevronDown, ChevronRight } from 'lucide-react';
import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant, type NodeProps } from '@xyflow/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { outline, pathOf, SCREEN } from '../ink';
import { where } from '../links';
import { regionImage } from '../pdf/pdfjs';
import { checkpoint, collapseGroup, showSource, startTyping, stopTyping, ungroup, updateCard, useStore } from '../store/project';
import type { Card, ExcerptData, GroupData, Highlight, InkData, NoteData } from '../types';
import { CanvasCard, CardInk, inkBottom, SketchCard } from './CanvasCards';
import { CardLinks } from './CardLinks';
import { LinkChips } from './LinkChips';
import { MentionSuggest } from './Mentions';

/** Focuses a field once its new card shows: React Flow keeps a card hidden until it has measured it, and a hidden field cannot take focus. */
function useAutoFocus(ref: RefObject<HTMLElement | null>, on: boolean | undefined) {
  useEffect(() => {
    if (!on) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      ref.current?.focus();
      if (document.activeElement !== ref.current && ++tries < 30) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [on, ref]);
}

/** Whether this card was just made here, so its field should take the focus; asked once, as the card appears. */
function useFresh(id: string, empty: boolean) {
  const [fresh] = useState(() => empty && useStore.getState().fresh === id);
  useEffect(() => void (fresh && useStore.setState({ fresh: null })), [fresh]);
  return fresh;
}

/**
 * A textarea that grows with its text. A hidden copy of the text sizes the box in CSS, so the
 * height stays right when the font finishes loading or the card is resized. It is left to the
 * browser while focused, so its own undo works there; what changes elsewhere, by undo or on
 * another device, is shown once it is not.
 */
function Grow({
  cardId,
  value,
  onChange,
  onDone,
  placeholder,
  autoFocus,
  label,
}: {
  cardId: string;
  value: string;
  onChange: (v: string) => void;
  onDone?: () => void;
  placeholder: string;
  autoFocus?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const typing = useRef<ReturnType<typeof startTyping>>(null);
  // React writes a changed defaultValue into the field's text, which clears the browser's undo, so it is given once.
  const [initial] = useState(value);
  useAutoFocus(ref, autoFocus);
  useLayoutEffect(() => {
    const el = ref.current!;
    if (el.value !== value && document.activeElement !== el) el.value = value;
  }, [value]);
  return (
    <div className="grow" data-value={value || placeholder}>
      <textarea
        ref={ref}
        className="nodrag nowheel"
        rows={1}
        defaultValue={initial}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => (typing.current = startTyping())}
        onBlur={() => {
          if (typing.current) stopTyping(typing.current, cardId);
          typing.current = null;
          onDone?.();
        }}
      />
      <MentionSuggest field={ref} />
    </div>
  );
}

/** A long passage shows its first lines, with a button to show the rest. */
function Quote({ text }: { text: string }) {
  const ref = useRef<HTMLQuoteElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => !open && setLong(el.scrollHeight > el.clientHeight + 1);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [text, open]);
  return (
    <>
      <blockquote ref={ref} className={open ? undefined : 'clamped'}>
        {text}
      </blockquote>
      {(long || open) && (
        <button className="more nodrag ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </>
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
  const count = useStore((s) => s.project?.cards.filter((c) => c.parentId === id).length ?? 0);
  const fresh = useFresh(id, !data.title);
  const name = useRef<HTMLInputElement>(null);
  useAutoFocus(name, fresh);
  return (
    <section className={`group${selected ? ' selected' : ''}${data.collapsed ? ' collapsed' : ''}`} aria-label={data.title || 'Group'}>
      {!data.collapsed && <NodeResizer isVisible={selected} minWidth={200} minHeight={120} lineClassName="group-edge" handleClassName="group-corner" onResizeStart={checkpoint} />}
      <header>
        <button
          className="nodrag icon fold"
          aria-label={data.collapsed ? 'Open group' : 'Collapse group'}
          title={data.collapsed ? 'Open group' : 'Collapse group to its name'}
          onClick={() => collapseGroup(id, !data.collapsed)}
        >
          {data.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <input ref={name} className="nodrag" value={data.title} placeholder="Name this group" aria-label="Group name" onChange={(e) => updateCard(id, { title: e.target.value })} />
        {data.collapsed ? (
          <span className="count">
            {count} card{count === 1 ? '' : 's'}
          </span>
        ) : (
          <button className="nodrag ghost" onClick={() => ungroup(id)} title="Keep the cards, remove the group">
            Ungroup
          </button>
        )}
      </header>
      {/* Links to cards inside a collapsed group end on the group. */}
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} isConnectable={false} />
      ))}
    </section>
  );
}

export function CardNode(props: NodeProps<Card>) {
  const { data, selected } = props;
  if (data.kind === 'group') return <GroupCard id={props.id} data={data} selected={selected} />;
  return (
    <>
      {data.kind === 'ink' ? (
        <>
          <InkCard data={data} selected={selected} />
          <CardLinks cardId={props.id} />
        </>
      ) : data.kind === 'sketch' ? (
        <SketchCard id={props.id} data={data} selected={selected} />
      ) : data.kind === 'canvas' ? (
        <CanvasCard id={props.id} data={data} selected={selected} />
      ) : (
        <TextCard {...props} data={data} />
      )}
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
  // A note just written opens ready to type; one brought back by undo or from another device does not.
  const fresh = useFresh(id, data.kind === 'note' && data.text === '');
  const [commenting, setCommenting] = useState(false);

  return (
    <article
      className={`card ${data.kind}${selected ? ' selected' : ''}${highlight ? ` hl-${highlight.color}` : ''}`}
      style={data.kind === 'note' && data.strokes?.length ? { minHeight: inkBottom(data.strokes) } : undefined}
    >
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
        <Grow cardId={id} value={data.text} onChange={(text) => updateCard(id, { text })} placeholder="Write a note" autoFocus={fresh} label="Note" />
      ) : highlight ? (
        <>
          {highlight.area ? <Figure highlight={highlight} password={doc?.password} /> : <Quote text={highlight.text} />}
          <footer>
            <button className="source nodrag" onClick={() => showSource(highlight.id)} title="Show it in the document">
              {doc?.name ?? 'Document'} · {where(highlight)}
            </button>
            {data.comment === undefined && !commenting && (
              <button className="nodrag ghost" onClick={() => setCommenting(true)}>
                Comment
              </button>
            )}
          </footer>
          {(data.comment !== undefined || commenting) && (
            <Grow
              cardId={id}
              value={data.comment ?? ''}
              onChange={(comment) => updateCard(id, { comment })}
              // A comment left empty goes, and the button to write one comes back.
              onDone={() => {
                setCommenting(false);
                const card = useStore.getState().project?.cards.find((c) => c.id === id);
                if (card?.data.kind === 'excerpt' && card.data.comment !== undefined && !card.data.comment.trim()) updateCard(id, { comment: undefined });
              }}
              placeholder="Your thoughts"
              autoFocus={commenting}
              label="Comment"
            />
          )}
        </>
      ) : (
        <p className="missing">The text this came from is gone.</p>
      )}
      {data.kind === 'note' && data.strokes?.length ? <CardInk strokes={data.strokes} /> : null}
      <LinkChips text={data.kind === 'note' ? data.text : (data.comment ?? '')} />
      <CardLinks cardId={id} />
    </article>
  );
}
