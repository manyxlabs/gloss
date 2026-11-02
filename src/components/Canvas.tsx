import '@xyflow/react/dist/style.css';
import { Background, ConnectionMode, Controls, MiniMap, Position, ReactFlow, useReactFlow, type FinalConnectionState, type Node as FlowNode, type XYPosition } from '@xyflow/react';
import { Group, ImageDown, StickyNote } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { canvasView } from '../canvasView';
import { inkAlong } from '../erase';
import { outline, pathOf, SCREEN } from '../ink';
import {
  addCanvasInk,
  addHighlight,
  addNote,
  CARD_WIDTH,
  canvasSpot,
  checkpoint,
  collapseGroup,
  connect,
  excerpt,
  group,
  notePen,
  onCardsChange,
  onLinksChange,
  regroup,
  useStore,
} from '../store/project';
import type { Card, Point } from '../types';
import { CanvasExport, openCanvasExport } from './CanvasExport';
import { CanvasTabs } from './CanvasTabs';
import { CardNode } from './CardNode';
import { EXCERPT_MIME, type ExcerptDrag } from './dnd';
import { Cursors } from './Presence';
import { Tools } from './Tools';

const nodeTypes = { card: CardNode };
/** Fingers this much closer or further apart than they started count as a pinch in or out. */
const PINCH_IN = 0.6;
const PINCH_OUT = 1.5;
/** Pen width on the canvas, in canvas units, so writing scales with the canvas like everything else on it. */
const INK_SIZE = 3.5;

export function Canvas() {
  const project = useStore((s) => s.project);
  const canvasId = useStore((s) => s.canvasId);
  // Only the canvas on show is drawn; links go with the cards they join.
  const [cards, links] = useMemo(() => (project ? canvasView(project, canvasId) : [[], []]), [project, canvasId]);
  const focus = useStore((s) => s.focus);
  const tool = useStore((s) => s.canvasTool);
  const inkColor = useStore((s) => s.inkColor);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const live = useRef<SVGPathElement>(null);
  const stroke = useRef<{ points: Point[]; pen: boolean; from?: string } | null>(null);
  const [over, setOver] = useState(false);
  // Fitting an empty canvas would happen when its first card appears, moving everything under the reader's pointer.
  const [fit] = useState(() => cards.length > 0);

  useEffect(() => {
    // New cards go in the middle of what is on screen, below any card already there.
    canvasSpot.next = () => {
      const box = wrapper.current!.getBoundingClientRect();
      const mid = rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
      const at: XYPosition = { x: Math.round(mid.x - CARD_WIDTH / 2), y: Math.round(mid.y - 60) };
      for (let tries = 0; tries < 50; tries++) {
        const hit = rf.getIntersectingNodes({ x: at.x, y: at.y, width: CARD_WIDTH, height: 100 }).find((n) => (n.data as Card['data']).kind !== 'group');
        if (!hit) break;
        const h = rf.getInternalNode(hit.id)!;
        at.y = Math.round(h.internals.positionAbsolute.y + (h.measured.height ?? 100) + 16);
      }
      return at;
    };
  }, [rf]);

  // Two fingers on two cards brought together group them; on one group, together closes it and
  // apart opens it. A pinch on the background still zooms, as React Flow does it.
  useEffect(() => {
    const el = wrapper.current!;
    let pinch: { a: string; b: string; start: number; last: number } | null = null;
    const nodeAt = (t: Touch) => document.elementFromPoint(t.clientX, t.clientY)?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
    const spread = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const kind = (id: string) => (rf.getNode(id)?.data as Card['data'] | undefined)?.kind;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [nodeAt(e.touches[0]!), nodeAt(e.touches[1]!)];
      if (!a || !b) return;
      pinch = { a, b, start: spread(e.touches), last: spread(e.touches) };
      e.stopPropagation();
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.stopPropagation();
      e.preventDefault();
      pinch.last = spread(e.touches);
    };
    const onEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return;
      e.stopPropagation();
      const { a, b, start, last } = pinch;
      pinch = null;
      const ratio = last / start;
      if (a === b && kind(a) === 'group') {
        if (ratio < PINCH_IN) collapseGroup(a, true);
        else if (ratio > PINCH_OUT) collapseGroup(a, false);
      } else if (a !== b && kind(a) !== 'group' && kind(b) !== 'group' && ratio < PINCH_IN) {
        const chosen =
          useStore
            .getState()
            .project?.cards.filter((c) => c.selected)
            .map((c) => c.id) ?? [];
        group([...new Set([a, b, ...chosen])]);
      }
    };
    el.addEventListener('touchstart', onStart, { capture: true, passive: true });
    el.addEventListener('touchmove', onMove, { capture: true, passive: false });
    el.addEventListener('touchend', onEnd, { capture: true });
    el.addEventListener('touchcancel', onEnd, { capture: true });
    return () => {
      el.removeEventListener('touchstart', onStart, { capture: true });
      el.removeEventListener('touchmove', onMove, { capture: true });
      el.removeEventListener('touchend', onEnd, { capture: true });
      el.removeEventListener('touchcancel', onEnd, { capture: true });
    };
  }, [rf]);

  // Another canvas has its own layout: show all of it, or the origin when it is empty.
  const seen = useRef(canvasId);
  useEffect(() => {
    if (seen.current === canvasId) return;
    seen.current = canvasId;
    const frame = requestAnimationFrame(() => (rf.getNodes().length ? void rf.fitView({ maxZoom: 1 }) : void rf.setViewport({ x: 40, y: 40, zoom: 1 })));
    return () => cancelAnimationFrame(frame);
  }, [canvasId, rf]);

  useEffect(() => {
    if (!focus) return;
    const node = rf.getInternalNode(focus.cardId);
    if (!node) return;
    const { x: nx, y: ny } = node.internals.positionAbsolute;
    const w = node.measured?.width ?? CARD_WIDTH;
    const h = node.measured?.height ?? 120;
    const { x, y, zoom } = rf.getViewport();
    const box = wrapper.current!.getBoundingClientRect();
    const [left, top] = [nx * zoom + x, ny * zoom + y];
    // Only move the canvas when the card is not already in full view: a jump away from where one is working is disorienting.
    if (left < 0 || top < 0 || left + w * zoom > box.width || top + h * zoom > box.height) {
      rf.setCenter(nx + w / 2, ny + h / 2, {
        zoom: Math.max(zoom, 0.8),
        duration: 400,
      });
    }
    onCardsChange(
      useStore.getState().project!.cards.map((c) => ({
        type: 'select',
        id: c.id,
        selected: c.id === focus.cardId,
      })),
    );
  }, [focus, rf]);

  /** The side of card `to` that faces card `from`. */
  const facing = (from: string, to: string) => {
    const center = (id: string) => {
      const n = rf.getInternalNode(id)!;
      return { x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2, y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2 };
    };
    const [a, b] = [center(from), center(to)];
    const [dx, dy] = [a.x - b.x, a.y - b.y];
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top;
  };
  /** The card under a point, if it is one a link can join: not a group. */
  const linkableAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.react-flow__node');
    const id = el?.dataset.id;
    return id && (rf.getNode(id)?.data as Card['data'] | undefined)?.kind !== 'group' ? id : undefined;
  };

  // A link dropped anywhere on a card connects to the side of it facing where the link came from,
  // rather than only when it lands on one of the small handles.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const point = 'changedTouches' in e ? e.changedTouches[0]! : e;
    const to = linkableAt(point.clientX, point.clientY);
    if (!to || to === state.fromNode.id) return;
    connect({ source: state.fromNode.id, sourceHandle: state.fromHandle?.id ?? null, target: to, targetHandle: facing(state.fromNode.id, to) });
  };

  /** A card dropped with its middle inside a group joins it; one dragged out of its group leaves it. */
  const onNodeDragStop = (_: unknown, node: FlowNode) => {
    const moved = rf.getInternalNode(node.id);
    if (!moved || (node.data as Card['data']).kind === 'group') return;
    const { x, y } = moved.internals.positionAbsolute;
    const cx = x + (moved.measured.width ?? 0) / 2;
    const cy = y + (moved.measured.height ?? 0) / 2;
    const target = useStore
      .getState()
      .project?.cards.filter((c) => c.data.kind === 'group')
      .map((c) => rf.getInternalNode(c.id)!)
      .find(
        (g) =>
          g &&
          cx >= g.internals.positionAbsolute.x &&
          cx <= g.internals.positionAbsolute.x + (g.measured.width ?? 0) &&
          cy >= g.internals.positionAbsolute.y &&
          cy <= g.internals.positionAbsolute.y + (g.measured.height ?? 0),
      );
    regroup(node.id, target?.id ?? null);
  };

  const onDrop = (e: DragEvent) => {
    setOver(false);
    const raw = e.dataTransfer.getData(EXCERPT_MIME);
    if (!raw) return;
    e.preventDefault();
    const drag = JSON.parse(raw) as ExcerptDrag;
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    getSelection()?.removeAllRanges();
    excerpt(addHighlight(drag.docId, drag.parts, drag.text, drag.color).id, {
      x: at.x - 24,
      y: at.y - 20,
    });
  };

  // Writing: with the pen chosen, or with a stylus at any time, a stroke is drawn instead of panning.
  const drawLive = () => {
    const s = stroke.current;
    if (!s) return live.current?.setAttribute('d', '');
    const { x, y, zoom } = rf.getViewport();
    live.current?.setAttribute(
      'd',
      pathOf(
        outline(
          s.points.map(([px, py, pr]) => [px * zoom + x, py * zoom + y, pr]),
          INK_SIZE * zoom,
          s.pen,
        ),
      ),
    );
  };
  const at = (e: { clientX: number; clientY: number; pressure: number }): Point => {
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return [p.x, p.y, e.pressure || 0.5];
  };
  const eraser = useRef<{ x: number; y: number } | null>(null);
  const erase = (x: number, y: number) => {
    const from = eraser.current ?? { x, y };
    eraser.current = { x, y };
    const ids = inkAlong(from, { x, y }, (el) =>
      el.tagName === 'path' && el.closest('[data-ink-card]') ? (el.closest<HTMLElement>('.react-flow__node')?.dataset.id ?? undefined) : undefined,
    );
    if (ids.size) onCardsChange([...ids].map((id) => ({ type: 'remove', id })));
  };
  const onPointerDownCapture = (e: ReactPointerEvent) => {
    if (e.pointerType === 'pen') notePen();
    // Palm rejection: once a stylus has been seen, fingers pan the canvas and only the pen writes.
    const palm = e.pointerType === 'touch' && useStore.getState().penSeen;
    const writing = e.pointerType === 'pen' || (tool === 'pen' && !palm);
    if (palm && tool === 'eraser') return;
    if ((!writing && tool !== 'eraser') || !(e.target as HTMLElement).closest('.react-flow__pane, .react-flow__node')) return;
    // Taken before React Flow sees it, which would otherwise pan or drag.
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    eraser.current = null;
    if (!writing) return erase(e.clientX, e.clientY);
    stroke.current = { points: [at(e)], pen: e.pointerType === 'pen', from: linkableAt(e.clientX, e.clientY) };
    drawLive();
  };
  const onPointerMoveCapture = (e: ReactPointerEvent) => {
    if (tool === 'eraser' && e.buttons && !stroke.current) return erase(e.clientX, e.clientY);
    if (!stroke.current) return;
    e.stopPropagation();
    for (const m of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) stroke.current.points.push(at(m));
    drawLive();
  };
  const onPointerUpCapture = (e: ReactPointerEvent) => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    drawLive();
    // A line drawn from one card to another links them, as a hand-drawn arrow would.
    const to = linkableAt(e.clientX, e.clientY);
    if (s.from && to && to !== s.from) return connect({ source: s.from, sourceHandle: facing(to, s.from), target: to, targetHandle: facing(s.from, to) });
    addCanvasInk(s.points, INK_SIZE, s.pen);
  };

  const chosen = cards.filter((c) => c.selected && !c.parentId && c.data.kind !== 'group');

  return (
    <section className={`canvas tool-${tool}${over ? ' over' : ''}`} aria-label="Canvas">
      <CanvasTabs />
      <div
        className="flow"
        ref={wrapper}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(EXCERPT_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
        onDrop={onDrop}
        onDoubleClick={(e) => {
          if (tool !== 'select' || !(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
          const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          addNote({ x: p.x - 20, y: p.y - 20 });
        }}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerUpCapture={onPointerUpCapture}
        onPointerCancelCapture={onPointerUpCapture}
      >
        <ReactFlow
          nodes={cards}
          edges={links}
          nodeTypes={nodeTypes}
          onNodesChange={onCardsChange}
          onEdgesChange={onLinksChange}
          onConnect={connect}
          onConnectEnd={onConnectEnd}
          onNodeDragStart={checkpoint}
          onNodeDragStop={onNodeDragStop}
          onSelectionDragStart={checkpoint}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.1}
          maxZoom={2.5}
          fitView={fit}
          fitViewOptions={{ maxZoom: 1 }}
        >
          <Background gap={24} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable ariaLabel="Map of the canvas" style={{ width: 140, height: 96 }} />
          <Cursors />
        </ReactFlow>
        <svg className="ink-live" aria-hidden="true">
          <path ref={live} fill={SCREEN[inkColor]} />
        </svg>
        <div className="canvas-tools">
          <button onClick={() => addNote()}>
            <StickyNote size={16} /> Note
          </button>
          <Tools side="canvasTool" />
          {chosen.length > 1 && (
            <button onClick={() => group(chosen.map((c) => c.id))}>
              <Group size={16} /> Group
            </button>
          )}
          {/* The header's Export menu is hidden on a phone. */}
          <button
            className="icon picture-export"
            aria-label="Export the canvas as a picture"
            title="Export the canvas as a picture"
            disabled={!cards.length}
            onClick={openCanvasExport}
          >
            <ImageDown size={17} />
          </button>
        </div>
        {!cards.length && (
          <p className="canvas-hint">
            Select text in a document and press <b>Excerpt</b>, or drag it here.
            <br />
            Double-click anywhere to write a note, or pick the pen to write by hand. Drag from a card’s edge to another card to connect them.
          </p>
        )}
      </div>
      <CanvasExport />
    </section>
  );
}
