import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  useViewport,
  type FinalConnectionState,
  type Node as FlowNode,
  type OnBeforeDelete,
  type XYPosition,
} from '@xyflow/react';
import { ImageDown, SquarePen, SquareStack, StickyNote } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { canvasView } from '../canvasView';
import { inkAlong } from '../erase';
import { fillOf, outline, pathOf, ruler, SCREEN, type Ruler } from '../ink';
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
  placeCards,
  startStroke,
  useStore,
  type Drawn,
} from '../store/project';
import { addNestedCanvas, addSketch, addStroke, erase as eraseOnCanvas, type Erased } from '../store/cards';
import type { Card, Link, Point } from '../types';
import { CanvasPath, CanvasStyleMenu } from './CanvasNav';
import { CanvasExport, openCanvasExport } from './CanvasExport';
import { CanvasTabs } from './CanvasTabs';
import { CardNode } from './CardNode';
import { EXCERPT_MIME, type ExcerptDrag } from './dnd';
import { Cursors } from './Presence';
import { SelectionBar } from './SelectionBar';
import { TagFilter } from './Tags';
import { Tools } from './Tools';

const nodeTypes = { card: CardNode };
/** Fingers this much closer or further apart than they started count as a pinch in or out. */
const PINCH_IN = 0.6;
const PINCH_OUT = 1.5;
/** Pen width on the canvas, in canvas units, so writing scales with the canvas like everything else on it. */
const INK_SIZE = 3.5;
/** Space between dots, grid lines and ruled lines, in canvas units. */
const GAP = 24;

/** Ruled lines, as on a notepad, which React Flow's own patterns cannot draw: theirs go both ways. */
function Ruled() {
  const { y, zoom } = useViewport();
  const gap = GAP * zoom;
  return <div className="react-flow__background ruled" style={{ backgroundSize: `100% ${gap}px`, backgroundPositionY: `${y % gap}px` }} />;
}

export function Canvas() {
  const project = useStore((s) => s.project);
  const canvasId = useStore((s) => s.canvasId);
  // Only the canvas on show is drawn; links go with the cards they join.
  const [cards, links] = useMemo(() => (project ? canvasView(project, canvasId) : [[], []]), [project, canvasId]);
  const style = useStore((s) => s.project?.canvases.find((c) => c.id === s.canvasId));
  const focus = useStore((s) => s.focus);
  const tool = useStore((s) => s.canvasTool);
  const inkColor = useStore((s) => s.inkColor);
  const nib = useStore((s) => s.nib);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const live = useRef<SVGPathElement>(null);
  const stroke = useRef<(Drawn & { ruler: Ruler; from?: string }) | null>(null);
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
      // Below the cards already on screen it can be out of view, where the new card would seem not to have come.
      if (rf.flowToScreenPosition({ x: at.x, y: at.y + 100 }).y > box.bottom) rf.setCenter(at.x + CARD_WIDTH / 2, at.y + 50, { zoom: rf.getZoom(), duration: 300 });
      return at;
    };
    canvasSpot.at = (x, y) => (wrapper.current?.contains(document.elementFromPoint(x, y)) ? rf.screenToFlowPosition({ x, y }) : null);
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

  /**
   * Cards dropped with their middle inside an open group join it; one dragged out of its group
   * leaves it. Groups never grow during a drag, so their bounds are still those at its start.
   */
  const onNodeDragStop = (_: unknown, _node: FlowNode, dragged: FlowNode[]) => {
    const groups = rf.getNodes().filter((n) => (n.data as Card['data']).kind === 'group' && !(n.data as { collapsed?: boolean }).collapsed && !n.hidden);
    const moves = dragged.flatMap((node): [string, string | null][] => {
      const moved = rf.getInternalNode(node.id);
      // A card dragged along with its own group stays in it.
      if (!moved || (node.data as Card['data']).kind === 'group' || dragged.some((d) => d.id === node.parentId)) return [];
      const { x, y } = moved.internals.positionAbsolute;
      const cx = x + (moved.measured.width ?? 0) / 2;
      const cy = y + (moved.measured.height ?? 0) / 2;
      const target = groups.find((n) => {
        const g = rf.getInternalNode(n.id)!;
        const { x: gx, y: gy } = g.internals.positionAbsolute;
        return cx >= gx && cx <= gx + (g.measured.width ?? 0) && cy >= gy && cy <= gy + (g.measured.height ?? 0);
      });
      return [[node.id, target?.id ?? null]];
    });
    if (moves.length) placeCards(moves);
  };

  // Deleting a group on its own keeps its cards, and the links to them; only what was chosen goes.
  const onBeforeDelete: OnBeforeDelete<Card, Link> = async ({ nodes, edges }) => {
    const ids = new Set(nodes.map((n) => n.id));
    const kept = nodes.filter((n) => !(n.parentId && ids.has(n.parentId) && !n.selected));
    const going = new Set(kept.map((n) => n.id));
    return { nodes: kept, edges: edges.filter((e) => e.selected || going.has(e.source) || going.has(e.target)) };
  };

  // Ctrl+A on the canvas chooses its cards, rather than all the text in the app.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    let inside = false;
    const onDown = (e: PointerEvent) => (inside = !!section.current?.contains(e.target as Node));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!inside || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a' || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      onCardsChange(rf.getNodes().map((n) => ({ type: 'select', id: n.id, selected: !n.hidden })));
    };
    addEventListener('pointerdown', onDown, true);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('keydown', onKey);
    };
  }, [rf]);

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
          s.ruler.shape(s.points).map(([px, py, pr]) => [px * zoom + x, py * zoom + y, pr]),
          { ...s, size: s.size * zoom },
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
    // Each find is a kind and its ids, apart by spaces; see Erased.
    const found = inkAlong(from, { x, y }, (el) => {
      const card = el.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      const h = el as HTMLElement;
      if (el.tagName === 'path' && card && el.closest('[data-ink-card]')) return `card ${card}`;
      if (card && h.dataset?.stroke) return `stroke ${card} ${h.dataset.stroke}`;
      const chip = el.closest<HTMLElement>('[data-card-link], [data-canvas-link]');
      if (chip) return chip.dataset.cardLink ? `cardlink ${chip.dataset.cardLink}` : `canvaslink ${chip.dataset.canvasLink}`;
      const edge = el.closest<HTMLElement>('.react-flow__edge')?.dataset.id;
      return edge && links.some((l) => l.id === edge && l.deletable !== false) ? `edge ${edge}` : undefined;
    });
    const erased: Erased = { card: [], stroke: [], edge: [], cardlink: [], canvaslink: [] };
    for (const f of found) {
      const [kind, a, b] = f.split(' ') as [keyof Erased, string, string];
      if (kind === 'stroke' || kind === 'canvaslink') erased[kind].push([a, b]);
      else erased[kind].push(a);
    }
    eraseOnCanvas(erased);
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
    stroke.current = { ...startStroke(INK_SIZE, e.pointerType === 'pen'), ruler: ruler(drawLive), from: linkableAt(e.clientX, e.clientY) };
    stroke.current.points.push(at(e));
    drawLive();
  };
  const onPointerMoveCapture = (e: ReactPointerEvent) => {
    if (tool === 'eraser' && e.buttons && !stroke.current) return erase(e.clientX, e.clientY);
    if (!stroke.current) return;
    e.stopPropagation();
    for (const m of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) stroke.current.points.push(at(m));
    stroke.current.ruler.move(e);
    drawLive();
  };
  const onPointerUpCapture = (e: ReactPointerEvent) => {
    const s = stroke.current;
    if (!s) return;
    stroke.current = null;
    s.ruler.stop();
    drawLive();
    const { ruler: _, from, ...drawn } = { ...s, points: s.ruler.shape(s.points) };
    // A line drawn from one card to another links them, as a hand-drawn arrow would.
    const to = linkableAt(e.clientX, e.clientY);
    if (from && to && to !== from) return connect({ source: from, sourceHandle: facing(to, from), target: to, targetHandle: facing(from, to) });
    // Written on a note or in an ink box, it is kept in the card, and moves with it.
    const card = from ? rf.getInternalNode(from) : undefined;
    const kind = (card?.data as Card['data'] | undefined)?.kind;
    if (card && (kind === 'note' || kind === 'sketch')) return addStroke(card.id, drawn, card.internals.positionAbsolute);
    addCanvasInk(drawn);
  };

  return (
    <section
      ref={section}
      className={`canvas tool-${tool}${over ? ' over' : ''}${style?.cardColor ? ' tinted' : ''}`}
      aria-label="Canvas"
      style={
        {
          ...(style?.accent ? { '--accent': `var(--edge-${style.accent})`, '--accent-soft': `color-mix(in srgb, var(--edge-${style.accent}) 15%, transparent)` } : {}),
          ...(style?.cardColor ? { '--card-tint': `var(--hl-${style.cardColor})` } : {}),
        } as React.CSSProperties
      }
    >
      <CanvasTabs />
      <CanvasPath />
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
          onBeforeDelete={onBeforeDelete}
          onSelectionDragStart={checkpoint}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.1}
          maxZoom={2.5}
          fitView={fit}
          fitViewOptions={{ maxZoom: 1 }}
        >
          {style?.background === 'lined' ? (
            <Ruled />
          ) : (
            style?.background !== 'plain' && <Background variant={style?.background === 'grid' ? BackgroundVariant.Lines : BackgroundVariant.Dots} gap={GAP} size={1.2} />
          )}
          <Controls showInteractive={false} />
          {cards.length > 0 && <MiniMap pannable zoomable ariaLabel="Map of the canvas" style={{ width: 140, height: 96 }} />}
          <Cursors />
          <SelectionBar cards={cards} links={links} />
        </ReactFlow>
        <svg className="ink-live" aria-hidden="true">
          <path ref={live} {...fillOf({ color: inkColor, nib }, SCREEN)} />
        </svg>
        <div className="canvas-tools">
          <button onClick={() => addNote()}>
            <StickyNote size={16} /> Note
          </button>
          <button className="icon" aria-label="Ink box" title="Ink box: a box to write in by hand" onClick={() => addSketch()}>
            <SquarePen size={16} />
          </button>
          <button className="icon" aria-label="Nested canvas" title="Nested canvas: a card that opens a canvas of its own" onClick={() => addNestedCanvas()}>
            <SquareStack size={16} />
          </button>
          <Tools side="canvasTool" />
          <CanvasStyleMenu />
          {project?.tags.length ? <TagFilter /> : null}
          {/* Shown on a phone only, where the header is far from the canvas. */}
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
            <span className="mouse-only">
              Select text in a document and press <b>Excerpt</b>, or drag it here.
              <br />
              Double-click anywhere to write a note, or pick the pen to write by hand. Drag from a card’s edge to another card to connect them.
            </span>
            <span className="touch-only">
              Select text in a document and tap <b>Excerpt</b>.
              <br />
              Tap <b>Note</b> to write a note, or pick the pen to write by hand. Drag from a card’s edge to another card to connect them, or pinch two cards together to group them.
            </span>
          </p>
        )}
      </div>
      <CanvasExport />
    </section>
  );
}
