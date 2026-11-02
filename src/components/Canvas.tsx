import '@xyflow/react/dist/style.css';
import { Background, ConnectionMode, Controls, MiniMap, Position, ReactFlow, useReactFlow, type FinalConnectionState, type Node as FlowNode, type XYPosition } from '@xyflow/react';
import { Group, StickyNote } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { inkAlong } from '../erase';
import { outline, pathOf, SCREEN } from '../ink';
import {
  addCanvasInk,
  addHighlight,
  addNote,
  CARD_WIDTH,
  canvasSpot,
  checkpoint,
  connect,
  excerpt,
  group,
  onCardsChange,
  onLinksChange,
  regroup,
  useStore,
} from '../store/project';
import type { Card, Point } from '../types';
import { CardNode } from './CardNode';
import { EXCERPT_MIME, type ExcerptDrag } from './dnd';
import { Cursors } from './Presence';
import { Tools } from './Tools';

const nodeTypes = { card: CardNode };
/** Pen width on the canvas, in canvas units, so writing scales with the canvas like everything else on it. */
const INK_SIZE = 3.5;

export function Canvas() {
  const cards = useStore((s) => s.project?.cards ?? []);
  const links = useStore((s) => s.project?.links ?? []);
  const focus = useStore((s) => s.focus);
  const tool = useStore((s) => s.canvasTool);
  const inkColor = useStore((s) => s.inkColor);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const live = useRef<SVGPathElement>(null);
  const stroke = useRef<{ points: Point[]; pen: boolean } | null>(null);
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

  // A link dropped anywhere on a card connects to the side of it facing where the link came from,
  // rather than only when it lands on one of the small handles.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const point = 'changedTouches' in e ? e.changedTouches[0]! : e;
    const id = (document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node') as HTMLElement | null)?.dataset.id;
    const to = id && id !== state.fromNode.id ? rf.getInternalNode(id) : undefined;
    if (!to) return;
    const center = (n: typeof to) => ({
      x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
      y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2,
    });
    const [a, b] = [center(state.fromNode), center(to)];
    const [dx, dy] = [a.x - b.x, a.y - b.y];
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top;
    connect({
      source: state.fromNode.id,
      sourceHandle: state.fromHandle?.id ?? null,
      target: to.id,
      targetHandle: side,
    });
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
    const writing = tool === 'pen' || e.pointerType === 'pen';
    if ((!writing && tool !== 'eraser') || !(e.target as HTMLElement).closest('.react-flow__pane, .react-flow__node')) return;
    // Taken before React Flow sees it, which would otherwise pan or drag.
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    eraser.current = null;
    if (!writing) return erase(e.clientX, e.clientY);
    stroke.current = { points: [at(e)], pen: e.pointerType === 'pen' };
    drawLive();
  };
  const onPointerMoveCapture = (e: ReactPointerEvent) => {
    if (tool === 'eraser' && e.buttons && !stroke.current) return erase(e.clientX, e.clientY);
    if (!stroke.current) return;
    e.stopPropagation();
    for (const m of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) stroke.current.points.push(at(m));
    drawLive();
  };
  const onPointerUpCapture = () => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    drawLive();
    addCanvasInk(s.points, INK_SIZE, s.pen);
  };

  const chosen = cards.filter((c) => c.selected && !c.parentId && c.data.kind !== 'group');

  return (
    <section
      className={`canvas tool-${tool}${over ? ' over' : ''}`}
      aria-label="Canvas"
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
      </div>
      {!cards.length && (
        <p className="canvas-hint">
          Select text in a document and press <b>Excerpt</b>, or drag it here.
          <br />
          Double-click anywhere to write a note, or pick the pen to write by hand. Drag from a card’s edge to another card to connect them.
        </p>
      )}
    </section>
  );
}
