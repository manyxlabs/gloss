import 'pdfjs-dist/web/pdf_viewer.css';
import { Columns2, Copy, FileDown, FoldVertical, Minus, Plus, Trash2, X } from 'lucide-react';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { inkAlong } from '../erase';
import { download } from '../export';
import { outline, PAPER, pathOf } from '../ink';
import { locate, pageAt, pointOnPage, selectionAnchor, textBoxes, type Anchor } from '../pdf/anchor';
import { annotatedPdf } from '../pdf/annotate';
import { layoutFolds, refreshTails } from '../pdf/folds';
import { loadDoc } from '../pdf/pdfjs';
import {
  addDocs,
  addFold,
  addHighlight,
  addInk,
  excerpt,
  jumped,
  recolor,
  rememberPage,
  removeDoc,
  removeFolds,
  removeHighlight,
  removeInk,
  setActiveDoc,
  setSideBySide,
  showCard,
  useStore,
  type Pane,
} from '../store/project';
import { COLORS, type Color, type Highlight, type Point } from '../types';
import { paint, type PageView } from './doc/paint';
import { EXCERPT_MIME } from './dnd';
import { FilePicker } from './FilePicker';
import { WebPicker } from './WebPicker';
import { Tools } from './Tools';

type Viewer = { viewer: PDFViewer; bus: EventBus; links: PDFLinkService };
type Popup = { docId: string; x: number; y: number; below?: boolean } & ({ anchor: Anchor } | { highlightId: string });
type Stroke = { page: number; box: DOMRect; points: Point[]; pen: boolean };

const FLASH_MS = 1600;
/** Pen width as a fraction of the page's width: about a fine felt tip on A4. */
const INK_SIZE = 0.005;
/** Fingers brought this close together, from where they started, squeeze the text between them. */
const SQUEEZE_AT = 0.6;
const POPUP_HALF_WIDTH = 190;

/** A position inside the scrolling content, so a popup scrolls with the page it belongs to, kept clear of the pane's sides. */
function inScroller(c: HTMLElement, clientX: number, clientY: number) {
  const box = c.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - box.left, POPUP_HALF_WIDTH), c.clientWidth - POPUP_HALF_WIDTH);
  return {
    x: (c.clientWidth < 2 * POPUP_HALF_WIDTH ? c.clientWidth / 2 : x) + c.scrollLeft,
    y: clientY - box.top + c.scrollTop,
  };
}

/**
 * The toolbar for the current selection: above its first line, or below its last where there is
 * no room above, and always below on a touch screen, where the system's own menu is above.
 */
function selectionPopup(c: HTMLElement, touch: boolean, docId: string | null): Popup | null {
  const anchor = selectionAnchor(c);
  if (!docId || !anchor) return null;
  const boxes = textBoxes(getSelection()!.getRangeAt(0));
  const first = boxes[0];
  const last = boxes.at(-1);
  if (!first || !last) return null;
  const below = touch || first.top - c.getBoundingClientRect().top < 60;
  const line = below ? last : first;
  return { docId, anchor, below, ...inScroller(c, line.left + line.width / 2, below ? line.bottom : line.top) };
}

function highlightAt(highlights: Highlight[], docId: string, page: number, fx: number, fy: number) {
  return highlights.findLast(
    (h) => h.docId === docId && h.parts.some((p) => p.page === page && p.rects.some(([x, y, w, hgt]) => fx >= x && fx <= x + w && fy >= y && fy <= y + hgt)),
  );
}

/** Repaints every page; only page divs that exist get marks, so this is cheap. */
function paintPages(viewer: PDFViewer | undefined, flashId: string | null, docId: string | null) {
  if (!viewer?.pdfDocument) return;
  for (let i = 0; i < viewer.pagesCount; i++) {
    paint(viewer.getPageView(i), flashId, docId);
    refreshTails(viewer as never, i + 1);
  }
}

const foldsOf = (docId: string | null) => useStore.getState().project?.folds.filter((f) => f.docId === docId) ?? [];
const relayout = (viewer: PDFViewer, docId: string | null) => {
  if (viewer.pdfDocument) layoutFolds(viewer as never, foldsOf(docId), removeFolds);
};

/** One document pane; a second one can sit beside it, showing another document or another place in the same one. */
export function DocPane({ pane, onProblems }: { pane: Pane; onProblems: (problems: string[]) => void }) {
  const docs = useStore((s) => s.project?.docs ?? []);
  const highlights = useStore((s) => s.project?.highlights ?? []);
  const cards = useStore((s) => s.project?.cards ?? []);
  const inks = useStore((s) => s.project?.inks);
  const folds = useStore((s) => s.project?.folds);
  const activeDocId = useStore((s) => (pane ? s.sideDocId : s.activeDocId));
  const split = useStore((s) => s.sideDocId !== null);
  const jump = useStore((s) => s.jump);
  const tool = useStore((s) => s.docTool);
  const inkColor = useStore((s) => s.inkColor);

  const scroller = useRef<HTMLDivElement>(null);
  const viewerDiv = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const live = useRef<SVGPathElement>(null);
  const pdf = useRef<Viewer | null>(null);
  const flash = useRef<string | null>(null);
  const stroke = useRef<Stroke | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<{
    docId: string;
    message: string;
  } | null>(null);
  const [status, setStatus] = useState({ page: 1, scale: 1 });
  const [popup, setPopup] = useState<Popup | null>(null);
  const [color, setColor] = useState<Color>('yellow');
  const [dropping, setDropping] = useState(false);
  const [band, setBand] = useState<{
    top: number;
    height: number;
    ready: boolean;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const container = scroller.current!;
    const bus = new EventBus();
    const links = new PDFLinkService({ eventBus: bus });
    const findController = new PDFFindController({
      eventBus: bus,
      linkService: links,
    });
    const viewer = new PDFViewer({
      container,
      viewer: viewerDiv.current!,
      eventBus: bus,
      linkService: links,
      findController,
    });
    links.setViewer(viewer);
    pdf.current = { viewer, bus, links };
    const docNow = () => (pane ? useStore.getState().sideDocId : useStore.getState().activeDocId);

    bus.on('pagerendered', ({ source }: { source: PageView }) => {
      paint(source, flash.current, docNow());
      refreshTails(viewer as never, source.id);
    });
    let frame = 0;
    bus.on('scalechanging', ({ scale }: { scale: number }) => {
      setStatus((s) => ({ ...s, scale }));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => relayout(viewer, docNow()));
    });
    let remember: ReturnType<typeof setTimeout> | undefined;
    bus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      setStatus((s) => ({ ...s, page: pageNumber }));
      const docId = docNow();
      clearTimeout(remember);
      // Only the main pane's place is remembered for the next visit.
      if (docId && !pane) remember = setTimeout(() => rememberPage(docId, pageNumber), 800);
    });

    // Ctrl or a trackpad pinch zooms the page, not the whole app.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      viewer.updateScale({
        steps: -Math.sign(e.deltaY),
        origin: [e.clientX, e.clientY],
        drawingDelay: 300,
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    // Two fingers: spread apart or together to zoom; held one above the other and brought
    // together, they squeeze the text between them out of view.
    let pinch: {
      mode: 'zoom' | 'squeeze';
      spread: number;
      start: number;
      ys: [number, number];
      x: number;
    } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return void (pinch = null);
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const vertical = Math.abs(a.clientY - b.clientY) > 2 * Math.abs(a.clientX - b.clientX);
      const ys = [Math.min(a.clientY, b.clientY), Math.max(a.clientY, b.clientY)] as [number, number];
      pinch = {
        mode: vertical ? 'squeeze' : 'zoom',
        spread: spread(e.touches),
        start: spread(e.touches),
        ys,
        x: (a.clientX + b.clientX) / 2,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const now = spread(e.touches);
      if (pinch.mode === 'squeeze') {
        const top = body.current!.getBoundingClientRect().top;
        setBand({
          top: pinch.ys[0] - top,
          height: pinch.ys[1] - pinch.ys[0],
          ready: now / pinch.start < SQUEEZE_AT,
        });
        pinch.spread = now;
        return;
      }
      const factor = now / pinch.spread;
      // Small steps are skipped: each one re-lays out every page.
      if (Math.abs(factor - 1) < 0.04) return;
      pinch.spread = now;
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      viewer.updateScale({
        scaleFactor: factor,
        origin: [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2],
        drawingDelay: 300,
      });
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return;
      const { mode, spread: last, start, ys, x } = pinch;
      pinch = null;
      if (mode !== 'squeeze') return;
      setBand(null);
      const docId = docNow();
      const from = pointOnPage(container, x, ys[0]);
      const to = pointOnPage(container, x, ys[1]);
      if (docId && from && to && last / start < SQUEEZE_AT) addFold(docId, { page: from.page, y: from.fy }, { page: to.page, y: to.fy });
    };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    // A phone turned sideways or a moved divider keeps the page fitted, unless the reader zoomed.
    const resize = new ResizeObserver(() => {
      if (viewer.pdfDocument && viewer.currentScaleValue === 'page-width') viewer.currentScaleValue = 'page-width';
    });
    resize.observe(container);

    // Touch selections are adjusted with handles after the finger lifts, so they are read when they change.
    let touching = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onDown = (e: PointerEvent) => (touching = e.pointerType === 'touch');
    const onSelection = () => {
      if (!touching || useStore.getState().docTool !== 'select') return;
      clearTimeout(settle);
      settle = setTimeout(() => {
        const popup = selectionPopup(container, true, docNow());
        if (popup) setPopup(popup);
      }, 300);
    };
    // With the pen or eraser, a drag must not select text, even where it ends outside the page.
    const onSelectStart = (e: Event) => useStore.getState().docTool !== 'select' && e.preventDefault();
    container.addEventListener('selectstart', onSelectStart);
    container.addEventListener('pointerdown', onDown);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      clearTimeout(remember);
      clearTimeout(settle);
      cancelAnimationFrame(frame);
      resize.disconnect();
      container.removeEventListener('selectstart', onSelectStart);
      container.removeEventListener('pointerdown', onDown);
      document.removeEventListener('selectionchange', onSelection);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      viewer.setDocument(null as never);
      pdf.current = null;
    };
  }, [pane]);

  useEffect(() => {
    const p = pdf.current!;
    if (!activeDocId) {
      p.viewer.setDocument(null as never);
      return;
    }
    let stale = false;
    loadDoc(activeDocId).then(
      (doc) => {
        if (stale) return;
        p.bus.on(
          'pagesinit',
          () => {
            if (stale) return;
            p.viewer.currentScaleValue = 'page-width';
            relayout(p.viewer, activeDocId);
            const last = useStore.getState().project?.docs.find((d) => d.id === activeDocId)?.lastPage;
            if (last) p.viewer.currentPageNumber = last;
            setStatus({
              page: p.viewer.currentPageNumber,
              scale: p.viewer.currentScale,
            });
            setLoaded(activeDocId);
          },
          { once: true },
        );
        p.viewer.setDocument(doc);
        p.links.setDocument(doc);
      },
      (err: Error) => !stale && setFailed({ docId: activeDocId, message: err.message }),
    );
    return () => {
      stale = true;
    };
  }, [activeDocId]);

  // Before the jump below, so a squeeze opened for a jump is laid out when the jump measures.
  useEffect(() => {
    if (pdf.current) relayout(pdf.current.viewer, activeDocId);
  }, [folds, loaded, activeDocId]);

  useEffect(() => paintPages(pdf.current?.viewer, flash.current, activeDocId), [highlights, cards, inks, loaded, activeDocId]);

  useEffect(() => {
    const p = pdf.current;
    if (!jump || jump.pane !== pane || !p || loaded !== activeDocId) return;
    jumped();
    if ('query' in jump) {
      p.viewer.currentPageNumber = jump.page;
      p.bus.dispatch('find', {
        source: null,
        type: '',
        query: jump.query,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: false,
        matchDiacritics: false,
      });
      return;
    }
    const h = useStore.getState().project?.highlights.find((x) => x.id === jump.highlightId);
    const part = h?.parts[0];
    const rect = part?.rects[0];
    const container = scroller.current!;
    const spot = part && rect && locate(container, part.page, rect[0], rect[1]);
    if (!h || !spot) return;
    const outer = container.getBoundingClientRect();
    container.scrollTo({
      top: container.scrollTop + spot.y - outer.top - container.clientHeight * 0.3,
      left: container.scrollLeft + spot.x - outer.left - container.clientWidth * 0.2,
      behavior: 'smooth',
    });
    flash.current = h.id;
    paintPages(p.viewer, flash.current, activeDocId);
    // Not cleared when this effect re-runs: clearing the request above re-runs it straight away.
    setTimeout(() => {
      if (flash.current !== h.id) return;
      flash.current = null;
      paintPages(p.viewer, flash.current, activeDocId);
    }, FLASH_MS);
  }, [jump, loaded, activeDocId, pane]);

  /** Draws the stroke so far over the pane, in screen pixels, until it is kept on its page. */
  const drawLive = (s: Stroke | null) => {
    const bodyBox = body.current!.getBoundingClientRect();
    const d = s
      ? pathOf(
          outline(
            s.points.map(([x, y, pr]) => [s.box.left + x * s.box.width - bodyBox.left, s.box.top + y * s.box.height - bodyBox.top, pr]),
            INK_SIZE * s.box.width,
            s.pen,
          ),
        )
      : '';
    live.current?.setAttribute('d', d);
  };

  const eraser = useRef<{ x: number; y: number } | null>(null);
  const erase = (x: number, y: number) => {
    const from = eraser.current ?? { x, y };
    eraser.current = { x, y };
    for (const id of inkAlong(from, { x, y }, (el) => (el as SVGElement).dataset?.inkId)) removeInk(id);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!activeDocId || tool === 'select' || (e.target as HTMLElement).closest('.popup, .fold-bar')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    eraser.current = null;
    if (tool === 'eraser') return erase(e.clientX, e.clientY);
    const hit = pageAt(scroller.current!, e.clientX, e.clientY);
    if (!hit) return;
    const s: Stroke = {
      page: hit.page,
      box: hit.box,
      pen: e.pointerType === 'pen',
      points: [],
    };
    s.points.push([(e.clientX - s.box.left) / s.box.width, (e.clientY - s.box.top) / s.box.height, e.pressure || 0.5]);
    stroke.current = s;
    drawLive(s);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (tool === 'eraser' && e.buttons) return erase(e.clientX, e.clientY);
    const s = stroke.current;
    if (!s) return;
    // Coalesced events keep a fast stroke smooth: the screen may report fewer moves than the pen made.
    for (const m of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent])
      s.points.push([(m.clientX - s.box.left) / s.box.width, (m.clientY - s.box.top) / s.box.height, m.pressure || 0.5]);
    drawLive(s);
  };

  const finishStroke = () => {
    const s = stroke.current;
    stroke.current = null;
    drawLive(null);
    // Strokes are kept in fractions of the page's width and height.
    if (s && activeDocId) addInk(activeDocId, s.page, s.points, INK_SIZE, s.pen);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (tool !== 'select') return finishStroke();
    if (!activeDocId || (e.target as HTMLElement).closest('.popup, .fold-bar')) return;
    const docId = activeDocId;
    const c = scroller.current!;
    const touch = e.pointerType === 'touch';
    // The selection settles after the pointer is released.
    setTimeout(() => {
      const selected = selectionPopup(c, touch, docId);
      if (selected) return setPopup(selected);
      const at = pointOnPage(c, e.clientX, e.clientY);
      const hit = at && highlightAt(useStore.getState().project?.highlights ?? [], docId, at.page, at.fx, at.fy);
      setPopup(
        hit
          ? {
              docId,
              highlightId: hit.id,
              below: touch,
              ...inScroller(c, e.clientX, touch ? e.clientY : e.clientY - 8),
            }
          : null,
      );
    });
  };

  const fromSelection = (anchor: Anchor, c: Color) => {
    getSelection()?.removeAllRanges();
    setPopup(null);
    return addHighlight(activeDocId!, anchor.parts, anchor.text, c);
  };

  /** Squeezes the selected lines out of view. */
  const squeeze = (anchor: Anchor) => {
    getSelection()?.removeAllRanges();
    setPopup(null);
    const first = anchor.parts[0]!;
    const last = anchor.parts.at(-1)!;
    const top = Math.min(...first.rects.map((r) => r[1]));
    const bottom = Math.max(...last.rects.map((r) => r[1] + r[3]));
    addFold(activeDocId!, { page: first.page, y: Math.max(0, top - 0.002) }, { page: last.page, y: Math.min(1, bottom + 0.002) });
  };

  const onDragStart = (e: DragEvent) => {
    const anchor = selectionAnchor(scroller.current!);
    if (!anchor || !activeDocId) return;
    setPopup(null);
    e.dataTransfer.setData(EXCERPT_MIME, JSON.stringify({ docId: activeDocId, color, ...anchor }));
    e.dataTransfer.setData('text/plain', anchor.text);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDrop = async (e: DragEvent) => {
    setDropping(false);
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    e.preventDefault();
    onProblems(await addDocs(files));
  };

  const zoom = (how: 'in' | 'out' | 'fit') => {
    const p = pdf.current;
    if (how === 'in') p?.viewer.increaseScale();
    else if (how === 'out') p?.viewer.decreaseScale();
    else if (p) p.viewer.currentScaleValue = 'page-width';
  };

  const exportPdf = async () => {
    const { project } = useStore.getState();
    if (!project || !active) return;
    setExporting(true);
    try {
      download(`${active.name} (annotated).pdf`, await annotatedPdf(project, active.id));
    } catch (err) {
      onProblems([`The PDF could not be exported: ${(err as Error).message}`]);
    } finally {
      setExporting(false);
    }
  };

  const active = docs.find((d) => d.id === activeDocId);
  const ready = !!active && loaded === activeDocId;
  const error = failed && failed.docId === activeDocId ? failed.message : null;
  const shown = popup?.docId === activeDocId ? popup : null;
  const highlight = shown && 'highlightId' in shown ? highlights.find((h) => h.id === shown.highlightId) : undefined;
  const card = highlight && cards.find((c) => c.data.kind === 'excerpt' && c.data.highlightId === highlight.id);

  return (
    <section
      className={`doc-pane${dropping ? ' dropping' : ''}`}
      aria-label={pane ? 'Second document' : 'Documents'}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={onDrop}
    >
      <div className="tabs" role="tablist" aria-label="Open documents">
        {docs.map((d) => (
          <div key={d.id} className={`tab${d.id === activeDocId ? ' active' : ''}`}>
            <button
              role="tab"
              aria-selected={d.id === activeDocId}
              onClick={() => setActiveDoc(d.id, pane)}
              title={d.source ? `${d.name}\nConverted from ${d.source.url ?? d.source.name}` : d.name}
            >
              {d.name}
            </button>
            <button
              className="close"
              aria-label={`Remove ${d.name}`}
              onClick={() => confirm(`Remove “${d.name}” and its highlights and excerpts from this project?`) && removeDoc(d.id)}
            >
              ×
            </button>
          </div>
        ))}
        {pane ? (
          <button className="icon side" aria-label="Close this pane" title="Close this pane" onClick={() => setSideBySide(false)}>
            <X size={16} />
          </button>
        ) : (
          <>
            <FilePicker label="Add PDF" onProblems={onProblems} />
            <WebPicker add={async (url) => onProblems(await addDocs([{ url }]))} />
            {!split && docs.length > 0 && (
              <button
                className="icon side"
                aria-label="Open side by side"
                title="Open a second document, or another place in this one, side by side"
                onClick={() => setSideBySide(true)}
              >
                <Columns2 size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="doc-body" ref={body}>
        <div
          className={`doc-scroll tool-${tool}`}
          ref={scroller}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={finishStroke}
          onDragStart={onDragStart}
        >
          <div className="pdfViewer" ref={viewerDiv} />
          {shown && 'anchor' in shown && (
            <div className={`popup${shown.below ? ' below' : ''}`} style={{ left: shown.x, top: shown.y }} role="toolbar" aria-label="Selection">
              <button className="primary" onClick={() => excerpt(fromSelection(shown.anchor, color).id)}>
                Excerpt
              </button>
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch hl-${c}${c === color ? ' current' : ''}`}
                  aria-label={`Highlight ${c}`}
                  title={`Highlight ${c}`}
                  onClick={() => {
                    setColor(c);
                    fromSelection(shown.anchor, c);
                  }}
                />
              ))}
              <span className="sep" />
              <button className="icon" aria-label="Squeeze" title="Squeeze these lines out of view" onClick={() => squeeze(shown.anchor)}>
                <FoldVertical size={17} />
              </button>
              <button className="icon" aria-label="Copy" title="Copy" onClick={() => (void navigator.clipboard.writeText(shown.anchor.text), setPopup(null))}>
                <Copy size={16} />
              </button>
            </div>
          )}
          {shown && highlight && (
            <div className={`popup${shown.below ? ' below' : ''}`} style={{ left: shown.x, top: shown.y }} role="toolbar" aria-label="Highlight">
              {card ? (
                <button className="primary" onClick={() => (setPopup(null), showCard(card.id))}>
                  Show on canvas
                </button>
              ) : (
                <button className="primary" onClick={() => (setPopup(null), excerpt(highlight.id))}>
                  Excerpt
                </button>
              )}
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch hl-${c}${c === highlight.color ? ' current' : ''}`}
                  aria-label={`Make it ${c}`}
                  title={`Make it ${c}`}
                  onClick={() => recolor(highlight.id, c)}
                />
              ))}
              <span className="sep" />
              <button className="icon" aria-label="Delete" title="Delete highlight" onClick={() => (setPopup(null), removeHighlight(highlight.id))}>
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        <svg className="ink-live" aria-hidden="true">
          <path ref={live} fill={PAPER[inkColor]} />
        </svg>
        {band && (
          <div className={`squeeze-band${band.ready ? ' ready' : ''}`} style={{ top: band.top, height: band.height }}>
            <span>{band.ready ? 'Release to squeeze' : 'Pinch to squeeze'}</span>
          </div>
        )}

        {!docs.length && !pane && (
          <div className="empty">
            <p>Drop PDFs, Word or PowerPoint files, images or text here to start reading.</p>
            <FilePicker label="Choose PDFs" primary onProblems={onProblems} />
          </div>
        )}
        {error && active && (
          <div className="empty">
            <p>{error}</p>
            <button onClick={() => removeDoc(active.id)}>Remove it from this project</button>
          </div>
        )}
      </div>

      {ready && (
        <div className="doc-status">
          <Tools side="docTool" />
          <span className="page-no" aria-live="polite">
            <span className="long">Page </span>
            {status.page} / {active.pages}
          </span>
          <span className="zoom">
            <button className="icon" aria-label="Zoom out" onClick={() => zoom('out')}>
              <Minus size={16} />
            </button>
            <button className="scale" title="Fit to width" onClick={() => zoom('fit')}>
              {Math.round(status.scale * 100)}%
            </button>
            <button className="icon" aria-label="Zoom in" onClick={() => zoom('in')}>
              <Plus size={16} />
            </button>
          </span>
          <button className="icon" aria-label="Export PDF with highlights" title="Export PDF with highlights and handwriting" disabled={exporting} onClick={() => void exportPdf()}>
            <FileDown size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
