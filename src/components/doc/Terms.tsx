import { BookOpen, BookOpenCheck, CornerDownRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { showPage, useStore, type Pane } from '../../store/project';
import { definitionsOf, setTermsOn, termPattern, useTerms, type Definition } from '../../terms';

/** A document's defined terms, once worked out; empty until then and for a document that defines none. */
function useDefinitions(docId: string | null) {
  const password = useStore((s) => s.project?.docs.find((d) => d.id === docId)?.password);
  const file = useStore((s) => s.project?.docs.find((d) => d.id === docId)?.file);
  const [defs, setDefs] = useState<{ docId: string; defs: Definition[] } | null>(null);
  useEffect(() => {
    if (!docId) return;
    let stale = false;
    definitionsOf(docId, password).then(
      (d) => !stale && setDefs({ docId, defs: d }),
      () => !stale && setDefs({ docId, defs: [] }),
    );
    return () => void (stale = true);
  }, [docId, password, file]);
  return defs?.docId === docId ? defs.defs : [];
}

const HOVER_MS = 250;
const LEAVE_MS = 300;

/** Underlines each later use of a defined term in a page's text layer, in a layer of its own under the text. */
function markPage(page: HTMLElement, pattern: RegExp) {
  const text = page.querySelector<HTMLElement>(':scope > .textLayer');
  if (!text?.querySelector('.endOfContent')) return;
  page.querySelector(':scope > .term-layer')?.remove();
  const box = page.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'term-layer';
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (const m of node.data.matchAll(pattern)) {
      // The term where it is defined, in its quotes, is not a use of it.
      if (/["“]$/.test(node.data.slice(0, m.index))) continue;
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      for (const r of range.getClientRects()) {
        if (r.width < 1) continue;
        const mark = document.createElement('div');
        mark.className = 'term-mark';
        mark.dataset.term = m[0];
        Object.assign(mark.style, {
          left: `${((r.left - box.left) / box.width) * 100}%`,
          top: `${((r.top - box.top) / box.height) * 100}%`,
          width: `${(r.width / box.width) * 100}%`,
          height: `${(r.height / box.height) * 100}%`,
        });
        layer.append(mark);
      }
    }
  }
  text.before(layer);
  text.dataset.terms = pattern.source.length.toString();
}

/** The term marked under a point, if any. */
function termAt(e: { target: EventTarget | null; clientX: number; clientY: number }) {
  const page = (e.target as Element | null)?.closest?.('.page');
  for (const mark of page?.querySelectorAll<HTMLElement>(':scope > .term-layer > .term-mark') ?? []) {
    const r = mark.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 1 && e.clientY <= r.bottom + 1) return { term: mark.dataset.term!, box: r };
  }
  return null;
}

type Shown = { def: Definition; x: number; top: number; bottom: number };

/**
 * Looks up defined terms, as LiquidText does for contracts: each use of a term the document defines
 * is underlined, and pointing at it, or tapping it, shows the definition with a way to go to it.
 */
export function DefinedTerms({
  viewer,
  scroller,
  docId,
  pane,
}: {
  viewer: RefObject<HTMLDivElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  docId: string | null;
  pane: Pane;
}) {
  const on = useTerms((s) => s.on);
  const defs = useDefinitions(docId);
  const [shown, setShown] = useState<Shown | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // Marks pages as pdf.js draws their text, and again when the terms or the setting change.
  useEffect(() => {
    const root = viewer.current;
    const pattern = on ? termPattern(defs) : null;
    if (!root) return;
    const clear = () => root.querySelectorAll('.term-layer').forEach((l) => l.remove());
    clear();
    root.querySelectorAll<HTMLElement>('.textLayer').forEach((t) => delete t.dataset.terms);
    if (!pattern) return;
    let frame = 0;
    const sweep = () => {
      frame = 0;
      root.querySelectorAll<HTMLElement>('.page').forEach((page) => {
        const text = page.querySelector<HTMLElement>(':scope > .textLayer');
        if (text && !text.dataset.terms) markPage(page, pattern);
      });
    };
    const watch = new MutationObserver(() => (frame ||= requestAnimationFrame(sweep)));
    watch.observe(root, { childList: true, subtree: true });
    sweep();
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
      clear();
    };
  }, [viewer, on, defs]);

  // Pointing at a term for a moment, or tapping it, shows its definition; it stays while pointed at.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !on || !defs.length) return;
    let hover: ReturnType<typeof setTimeout> | undefined;
    let leave: ReturnType<typeof setTimeout> | undefined;
    let at: string | null = null;
    let down: { x: number; y: number } | null = null;
    const show = (hit: NonNullable<ReturnType<typeof termAt>>) => {
      const def = defs.find((d) => d.term === hit.term);
      if (def) setShown({ def, x: hit.box.left + hit.box.width / 2, top: hit.box.top, bottom: hit.box.bottom });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const hit = termAt(e);
      if ((hit?.term ?? null) === at) return;
      at = hit?.term ?? null;
      clearTimeout(hover);
      clearTimeout(leave);
      if (hit) hover = setTimeout(() => show(hit), HOVER_MS);
      else leave = setTimeout(() => !card.current?.matches(':hover') && setShown(null), LEAVE_MS);
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
      const hit = termAt(e);
      if (hit && getSelection()?.isCollapsed !== false) show(hit);
    };
    const onScroll = () => setShown(null);
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(hover);
      clearTimeout(leave);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('scroll', onScroll);
    };
  }, [scroller, on, defs]);

  useEffect(() => {
    if (!shown) return;
    const close = (e: Event) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !card.current?.contains(e.target as Node) && !termAt(e as PointerEvent)) && setShown(null);
    addEventListener('keydown', close);
    addEventListener('pointerdown', close);
    return () => {
      removeEventListener('keydown', close);
      removeEventListener('pointerdown', close);
    };
  }, [shown]);

  if (!shown || !docId || !on) return null;
  // Below the term, or above it near the bottom of the window.
  const below = shown.bottom + 220 < innerHeight;
  return createPortal(
    <div
      ref={card}
      className="term-card glass"
      role="dialog"
      aria-label={`Definition of ${shown.def.term}`}
      style={{
        left: Math.min(Math.max(12, shown.x - 170), innerWidth - 352),
        ...(below ? { top: shown.bottom + 8 } : { bottom: innerHeight - shown.top + 8 }),
      }}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setShown(null)}
    >
      <header>
        <strong>{shown.def.term}</strong>
        <span className="where">Defined on p. {shown.def.page}</span>
        <button className="icon" aria-label="Close" title="Close" onClick={() => setShown(null)}>
          <X size={15} />
        </button>
      </header>
      <p>{shown.def.text}</p>
      <footer>
        <button onClick={() => (setShown(null), showPage(docId, shown.def.page, { pane, query: `"${shown.def.term}"` }))}>
          <CornerDownRight size={15} /> Go to the definition
        </button>
        <button className="ghost" onClick={() => (setShown(null), setTermsOn(false))}>
          Turn off
        </button>
      </footer>
    </div>,
    document.body,
  );
}

/** Turns the lookup on or off, shown for a document that defines terms. */
export function TermsToggle({ docId }: { docId: string }) {
  const on = useTerms((s) => s.on);
  const defs = useDefinitions(docId);
  if (!defs.length) return null;
  const Icon = on ? BookOpenCheck : BookOpen;
  return (
    <button
      className="icon"
      aria-pressed={on}
      aria-label="Defined terms"
      title={on ? `Defined terms: ${defs.length} found. Point at a term to read its definition. Click to turn off.` : 'Show definitions of defined terms'}
      onClick={() => setTermsOn(!on)}
    >
      <Icon size={17} />
    </button>
  );
}
