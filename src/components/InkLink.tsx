import { useEffect, useRef } from 'react';
import { outline, PAPER, pathOf } from '../ink';
import { highlightAt, pageAt } from '../pdf/anchor';
import { linkCard } from '../store/links';
import { addInk, PANES, useStore } from '../store/project';
import type { Card, Point } from '../types';
import { INK_SIZE } from './DocPane';

type Gesture = { id: number; docId: string; highlightId: string; page: number; box: DOMRect; points: Point[]; pen: boolean; over?: HTMLElement };

/** The card under a point that a passage can be linked to: any but a group. */
function cardAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.canvas .react-flow__node');
  const card = el && useStore.getState().project?.cards.find((c: Card) => c.id === el.dataset.id);
  return card && card.data.kind !== 'group' ? el : undefined;
}

/**
 * A pen stroke that starts on a highlight may cross from the document to the canvas, so it is
 * followed over the whole workspace: ending on a card, it links the passage to the card; ending
 * anywhere else, it is kept as handwriting on the page it started on, as any other stroke.
 */
export function InkLink() {
  const path = useRef<SVGPathElement>(null);
  const inkColor = useStore((s) => s.inkColor);

  useEffect(() => {
    let g: Gesture | null = null;
    const draw = () => {
      const d = g
        ? pathOf(
            outline(
              g.points.map(([x, y, p]) => [g!.box.left + x * g!.box.width, g!.box.top + y * g!.box.height, p]),
              INK_SIZE * g.box.width,
              g.pen,
            ),
          )
        : '';
      path.current?.setAttribute('d', d);
    };
    const hover = (el: HTMLElement | undefined) => {
      if (!g || g.over === el) return;
      g.over?.classList.remove('ink-target');
      el?.classList.add('ink-target');
      g.over = el;
    };
    const add = (e: PointerEvent) => {
      for (const m of e.getCoalescedEvents?.() ?? [e]) g!.points.push([(m.clientX - g!.box.left) / g!.box.width, (m.clientY - g!.box.top) / g!.box.height, m.pressure || 0.5]);
    };

    // Taken in the capture phase, before the document pane would start a stroke of its own.
    const onDown = (e: PointerEvent) => {
      const state = useStore.getState();
      const { docTool, project } = state;
      const target = e.target as HTMLElement;
      const scroller = target.closest?.<HTMLElement>('.doc-scroll');
      if (docTool !== 'pen' || !scroller || !project || target.closest('.popup, .fold-bar') || e.button > 0) return;
      const docId = state[PANES[[...document.querySelectorAll('.doc-pane')].indexOf(scroller.closest('.doc-pane')!)] ?? 'activeDocId'];
      const hit = pageAt(scroller, e.clientX, e.clientY);
      const h = docId && hit && highlightAt(project.highlights, docId, hit.page, (e.clientX - hit.box.left) / hit.box.width, (e.clientY - hit.box.top) / hit.box.height);
      if (!h) return;
      e.stopPropagation();
      e.preventDefault();
      scroller.setPointerCapture(e.pointerId);
      g = { id: e.pointerId, docId: docId!, highlightId: h.id, page: hit!.page, box: hit!.box, points: [], pen: e.pointerType === 'pen' };
      add(e);
      draw();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== g?.id) return;
      e.stopPropagation();
      add(e);
      hover(cardAt(e.clientX, e.clientY));
      draw();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== g?.id) return;
      e.stopPropagation();
      const done = g;
      hover(undefined);
      g = null;
      draw();
      const card = e.type === 'pointerup' && cardAt(e.clientX, e.clientY);
      if (card) linkCard(done.highlightId, card.dataset.id!);
      else addInk(done.docId, done.page, done.points, INK_SIZE, done.pen);
    };
    const opts = { capture: true };
    addEventListener('pointerdown', onDown, opts);
    addEventListener('pointermove', onMove, opts);
    addEventListener('pointerup', onUp, opts);
    addEventListener('pointercancel', onUp, opts);
    return () => {
      removeEventListener('pointerdown', onDown, opts);
      removeEventListener('pointermove', onMove, opts);
      removeEventListener('pointerup', onUp, opts);
      removeEventListener('pointercancel', onUp, opts);
    };
  }, []);

  return (
    <svg className="ink-link" aria-hidden="true">
      <path ref={path} fill={PAPER[inkColor]} />
    </svg>
  );
}
