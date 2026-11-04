import { NodeResizer } from '@xyflow/react';
import { ArrowRight, SquareStack } from 'lucide-react';
import { useMemo } from 'react';
import { fillOf, isCard, outline, pathOf, SCREEN } from '../ink';
import { checkpoint, renameCanvas, setCanvas, useStore } from '../store/project';
import type { CanvasCardData, CardData, SketchData, Stroke } from '../types';
import { CardLinks } from './CardLinks';
import { TagChips } from './Tags';
import { useDimmed } from './useDimmed';

/** Handwriting inside a card, over whatever else it holds. Each stroke can be erased on its own. */
export function CardInk({ strokes }: { strokes: Stroke[] }) {
  const paths = useMemo(() => strokes.map((s) => ({ id: s.id, d: pathOf(outline(s.points, s)), ...fillOf(s, SCREEN) })), [strokes]);
  return (
    <svg className="card-ink" aria-hidden="true">
      {paths.map((p) => (
        <path key={p.id} data-stroke={p.id} d={p.d} fill={p.fill} fillOpacity={p.fillOpacity} />
      ))}
    </svg>
  );
}

/** How tall a card must be to show its handwriting whole. */
export const inkBottom = (strokes: Stroke[] | undefined) => Math.max(0, ...(strokes ?? []).flatMap((s) => s.points.map((p) => p[1] + s.size)));

/** A box written in by hand, resized from its corners while chosen. */
export function SketchCard({ id, data, selected }: { id: string; data: SketchData & Pick<CardData, 'tags'>; selected: boolean }) {
  const dim = useDimmed(id);
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={80} lineClassName="sketch-edge" handleClassName="sketch-corner" onResizeStart={checkpoint} />
      <article className={`card sketch${selected ? ' selected' : ''}${dim ? ' dim' : ''}`} aria-label="Ink box">
        <CardInk strokes={data.strokes} />
        <TagChips ids={data.tags} />
        {!data.strokes.length && <p className="sketch-hint">Write here with the pen</p>}
      </article>
      <CardLinks cardId={id} />
    </>
  );
}

/** A card that opens a canvas nested in this one: its name, and how many cards are on it. */
export function CanvasCard({ id, data, selected }: { id: string; data: CanvasCardData & Pick<CardData, 'tags'>; selected: boolean }) {
  const dim = useDimmed(id);
  const canvas = useStore((s) => s.project?.canvases.find((c) => c.id === data.target));
  const count = useStore((s) => s.project?.cards.filter((c) => c.data.canvasId === data.target && isCard(c)).length ?? 0);
  const open = () => setCanvas(data.target);
  return (
    <article className={`card canvas-card${selected ? ' selected' : ''}${dim ? ' dim' : ''}`} aria-label={`Canvas ${canvas?.name ?? ''}`} onDoubleClick={open}>
      <header>
        <SquareStack size={18} aria-hidden="true" />
        <input
          className="nodrag"
          aria-label="Nested canvas name"
          value={canvas?.name ?? ''}
          placeholder="Name this canvas"
          onChange={(e) => renameCanvas(data.target, e.target.value)}
          onBlur={(e) => !e.target.value.trim() && renameCanvas(data.target, 'Canvas')}
        />
      </header>
      <TagChips ids={data.tags} />
      <footer>
        <span className="count">
          {count} card{count === 1 ? '' : 's'}
        </span>
        <button className="nodrag" onClick={open} disabled={!canvas}>
          Open <ArrowRight size={14} />
        </button>
      </footer>
      <CardLinks cardId={id} />
    </article>
  );
}
