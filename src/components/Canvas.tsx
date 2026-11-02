import '@xyflow/react/dist/style.css';
import { Background, ConnectionMode, Controls, MiniMap, Position, ReactFlow, useReactFlow, type FinalConnectionState, type XYPosition } from '@xyflow/react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { addHighlight, addNote, CARD_WIDTH, canvasSpot, checkpoint, connect, excerpt, onCardsChange, onLinksChange, useStore } from '../store/project';
import { CardNode } from './CardNode';
import { EXCERPT_MIME, type ExcerptDrag } from './dnd';

const nodeTypes = { card: CardNode };

export function Canvas() {
  const cards = useStore((s) => s.project?.cards ?? []);
  const links = useStore((s) => s.project?.links ?? []);
  const focus = useStore((s) => s.focus);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    // New cards go in the middle of what is on screen, stepped aside from any card already there.
    canvasSpot.next = () => {
      const box = wrapper.current!.getBoundingClientRect();
      const mid = rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
      const at: XYPosition = { x: Math.round(mid.x - CARD_WIDTH / 2), y: Math.round(mid.y - 60) };
      const taken = useStore.getState().project?.cards ?? [];
      while (taken.some((c) => Math.abs(c.position.x - at.x) < 12 && Math.abs(c.position.y - at.y) < 12)) {
        at.x += 28;
        at.y += 28;
      }
      return at;
    };
  }, [rf]);

  useEffect(() => {
    if (!focus) return;
    const node = rf.getNode(focus.cardId);
    if (!node) return;
    const w = node.measured?.width ?? CARD_WIDTH;
    const h = node.measured?.height ?? 120;
    const { x, y, zoom } = rf.getViewport();
    const box = wrapper.current!.getBoundingClientRect();
    const [left, top] = [node.position.x * zoom + x, node.position.y * zoom + y];
    // Only move the canvas when the card is not already in full view: a jump away from where one is working is disorienting.
    if (left < 0 || top < 0 || left + w * zoom > box.width || top + h * zoom > box.height) {
      rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: Math.max(zoom, 0.8), duration: 400 });
    }
    onCardsChange(useStore.getState().project!.cards.map((c) => ({ type: 'select', id: c.id, selected: c.id === focus.cardId })));
  }, [focus, rf]);

  // A link dropped anywhere on a card connects to the side of it facing where the link came from,
  // rather than only when it lands on one of the small handles.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const point = 'changedTouches' in e ? e.changedTouches[0]! : e;
    const id = (document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node') as HTMLElement | null)?.dataset.id;
    const to = id && id !== state.fromNode.id ? rf.getInternalNode(id) : undefined;
    if (!to) return;
    const center = (n: typeof to) => ({ x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2, y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2 });
    const [a, b] = [center(state.fromNode), center(to)];
    const [dx, dy] = [a.x - b.x, a.y - b.y];
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top;
    connect({ source: state.fromNode.id, sourceHandle: state.fromHandle?.id ?? null, target: to.id, targetHandle: side });
  };

  const onDrop = (e: DragEvent) => {
    setOver(false);
    const raw = e.dataTransfer.getData(EXCERPT_MIME);
    if (!raw) return;
    e.preventDefault();
    const drag = JSON.parse(raw) as ExcerptDrag;
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    getSelection()?.removeAllRanges();
    excerpt(addHighlight(drag.docId, drag.parts, drag.text, drag.color).id, { x: at.x - 24, y: at.y - 20 });
  };

  return (
    <section
      className={`canvas${over ? ' over' : ''}`}
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
        if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
        const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNote({ x: at.x - 20, y: at.y - 20 });
      }}
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
        onSelectionDragStart={checkpoint}
        connectionMode={ConnectionMode.Loose}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.1}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
      >
        <Background gap={24} size={1.2} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable ariaLabel="Map of the canvas" style={{ width: 140, height: 96 }} />
      </ReactFlow>
      <div className="canvas-tools">
        <button onClick={() => addNote()}>+ Note</button>
      </div>
      {!cards.length && (
        <p className="canvas-hint">
          Select text in a document and press <b>Excerpt</b>, or drag it here.
          <br />
          Double-click anywhere to write a note. Drag from a card’s edge to another card to connect them.
        </p>
      )}
    </section>
  );
}
