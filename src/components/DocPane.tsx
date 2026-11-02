import 'pdfjs-dist/web/pdf_viewer.css';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { pointOnPage, selectionAnchor, type Anchor } from '../pdf/anchor';
import { loadDoc } from '../pdf/pdfjs';
import { addDocs, addHighlight, excerpt, jumped, recolor, rememberPage, removeDoc, removeHighlight, setActiveDoc, showCard, useStore } from '../store/project';
import { COLORS, type Color, type Highlight } from '../types';
import { EXCERPT_MIME } from './dnd';
import { FilePicker } from './FilePicker';

type PageView = { id: number; div: HTMLElement };
type Viewer = { viewer: PDFViewer; bus: EventBus; links: PDFLinkService };
type Popup = { docId: string; x: number; y: number; below?: boolean } & ({ anchor: Anchor } | { highlightId: string });

const FLASH_MS = 1600;

/** Paints a page's highlights into the div pdf.js drew it in; pdf.js clears the div whenever it redraws the page. */
function paint(view: PageView, flashId: string | null) {
  const { project, activeDocId } = useStore.getState();
  if (!project) return;
  const excerpted = new Set(project.cards.flatMap((c) => (c.data.kind === 'excerpt' ? [c.data.highlightId] : [])));
  let layer = view.div.querySelector<HTMLElement>(':scope > .hl-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'hl-layer';
    // Under the text layer, so the text stays selectable through a highlight.
    view.div.insertBefore(layer, view.div.querySelector(':scope > .textLayer'));
  }
  layer.replaceChildren(
    ...project.highlights
      .filter((h) => h.docId === activeDocId)
      .flatMap((h) =>
        h.parts
          .filter((p) => p.page === view.id)
          .flatMap((p) =>
            p.rects.map(([x, y, w, hgt]) => {
              const mark = document.createElement('div');
              mark.className = `hl hl-${h.color}${excerpted.has(h.id) ? ' linked' : ''}${flashId === h.id ? ' flash' : ''}`;
              mark.dataset.id = h.id;
              Object.assign(mark.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${hgt * 100}%` });
              return mark;
            }),
          ),
      ),
  );
}

const POPUP_HALF_WIDTH = 170;

/** A position inside the scrolling content, so a popup scrolls with the page it belongs to, kept clear of the pane's sides. */
function inScroller(c: HTMLElement, clientX: number, clientY: number) {
  const box = c.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - box.left, POPUP_HALF_WIDTH), c.clientWidth - POPUP_HALF_WIDTH);
  return { x: (c.clientWidth < 2 * POPUP_HALF_WIDTH ? c.clientWidth / 2 : x) + c.scrollLeft, y: clientY - box.top + c.scrollTop };
}

/** The toolbar for the current selection: above it, or below it on a touch screen, where the system menu is above. */
function selectionPopup(c: HTMLElement, below: boolean): Popup | null {
  const docId = useStore.getState().activeDocId;
  const anchor = selectionAnchor(c);
  if (!docId || !anchor) return null;
  const r = getSelection()!.getRangeAt(0).getBoundingClientRect();
  return { docId, anchor, below, ...inScroller(c, r.left + r.width / 2, below ? r.bottom : r.top) };
}

function highlightAt(highlights: Highlight[], docId: string, page: number, fx: number, fy: number) {
  return highlights.findLast((h) => h.docId === docId && h.parts.some((p) => p.page === page && p.rects.some(([x, y, w, hgt]) => fx >= x && fx <= x + w && fy >= y && fy <= y + hgt)));
}

export function DocPane({ onProblems }: { onProblems: (problems: string[]) => void }) {
  const docs = useStore((s) => s.project?.docs ?? []);
  const highlights = useStore((s) => s.project?.highlights ?? []);
  const cards = useStore((s) => s.project?.cards ?? []);
  const activeDocId = useStore((s) => s.activeDocId);
  const jump = useStore((s) => s.jump);

  const scroller = useRef<HTMLDivElement>(null);
  const viewerDiv = useRef<HTMLDivElement>(null);
  const pdf = useRef<Viewer | null>(null);
  const flash = useRef<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ docId: string; message: string } | null>(null);
  const [status, setStatus] = useState({ page: 1, scale: 1 });
  const [popup, setPopup] = useState<Popup | null>(null);
  const [color, setColor] = useState<Color>('yellow');
  const [dropping, setDropping] = useState(false);

  const paintAll = () => {
    const viewer = pdf.current?.viewer;
    if (!viewer?.pdfDocument) return;
    for (let i = 0; i < viewer.pagesCount; i++) paint(viewer.getPageView(i), flash.current);
  };

  useEffect(() => {
    const container = scroller.current!;
    const bus = new EventBus();
    const links = new PDFLinkService({ eventBus: bus });
    const findController = new PDFFindController({ eventBus: bus, linkService: links });
    const viewer = new PDFViewer({ container, viewer: viewerDiv.current!, eventBus: bus, linkService: links, findController });
    links.setViewer(viewer);
    pdf.current = { viewer, bus, links };

    bus.on('pagerendered', ({ source }: { source: PageView }) => paint(source, flash.current));
    bus.on('scalechanging', ({ scale }: { scale: number }) => setStatus((s) => ({ ...s, scale })));
    let remember: ReturnType<typeof setTimeout> | undefined;
    bus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      setStatus((s) => ({ ...s, page: pageNumber }));
      const docId = useStore.getState().activeDocId;
      clearTimeout(remember);
      if (docId) remember = setTimeout(() => rememberPage(docId, pageNumber), 800);
    });

    // Ctrl or a trackpad pinch zooms the page, not the whole app.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      viewer.updateScale({ steps: -Math.sign(e.deltaY), origin: [e.clientX, e.clientY], drawingDelay: 300 });
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    // Two fingers zoom the page; the browser would otherwise zoom the whole app.
    let pinch: number | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onTouchStart = (e: TouchEvent) => {
      pinch = e.touches.length === 2 ? spread(e.touches) : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinch === null || e.touches.length !== 2) return;
      e.preventDefault();
      const now = spread(e.touches);
      const factor = now / pinch;
      // Small steps are skipped: each one re-lays out every page.
      if (Math.abs(factor - 1) < 0.04) return;
      pinch = now;
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      viewer.updateScale({ scaleFactor: factor, origin: [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2], drawingDelay: 300 });
    };
    const onTouchEnd = (e: TouchEvent) => e.touches.length < 2 && (pinch = null);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

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
      if (!touching) return;
      clearTimeout(settle);
      settle = setTimeout(() => {
        const popup = selectionPopup(container, true);
        if (popup) setPopup(popup);
      }, 300);
    };
    container.addEventListener('pointerdown', onDown);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      clearTimeout(remember);
      clearTimeout(settle);
      resize.disconnect();
      container.removeEventListener('pointerdown', onDown);
      document.removeEventListener('selectionchange', onSelection);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      viewer.setDocument(null as never);
      pdf.current = null;
    };
  }, []);

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
            const last = useStore.getState().project?.docs.find((d) => d.id === activeDocId)?.lastPage;
            if (last) p.viewer.currentPageNumber = last;
            setStatus({ page: p.viewer.currentPageNumber, scale: p.viewer.currentScale });
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

  // Only page divs that exist get marks, so repainting every page on a change is cheap.
  useEffect(paintAll, [highlights, cards, loaded]);

  useEffect(() => {
    const p = pdf.current;
    if (!jump || !p || loaded !== activeDocId) return;
    jumped();
    if ('query' in jump) {
      p.viewer.currentPageNumber = jump.page;
      p.bus.dispatch('find', { source: null, type: '', query: jump.query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: false, matchDiacritics: false });
      return;
    }
    const h = useStore.getState().project?.highlights.find((x) => x.id === jump.highlightId);
    const part = h?.parts[0];
    const rect = part?.rects[0];
    if (!h || !part || !rect) return;
    const container = scroller.current!;
    const box = (p.viewer.getPageView(part.page - 1) as PageView).div.getBoundingClientRect();
    const outer = container.getBoundingClientRect();
    container.scrollTo({
      top: container.scrollTop + box.top - outer.top + rect[1] * box.height - container.clientHeight * 0.3,
      left: container.scrollLeft + box.left - outer.left + rect[0] * box.width - container.clientWidth * 0.2,
      behavior: 'smooth',
    });
    flash.current = h.id;
    paintAll();
    // Not cleared when this effect re-runs: clearing the request above re-runs it straight away.
    setTimeout(() => {
      if (flash.current !== h.id) return;
      flash.current = null;
      paintAll();
    }, FLASH_MS);
  }, [jump, loaded, activeDocId]);

  const onPointerUp = (e: React.PointerEvent) => {
    if (!activeDocId || (e.target as HTMLElement).closest('.popup')) return;
    const docId = activeDocId;
    const c = scroller.current!;
    const touch = e.pointerType === 'touch';
    // The selection settles after the pointer is released.
    setTimeout(() => {
      const selected = selectionPopup(c, touch);
      if (selected) return setPopup(selected);
      const at = pointOnPage(c, e.clientX, e.clientY);
      const hit = at && highlightAt(useStore.getState().project?.highlights ?? [], docId, at.page, at.fx, at.fy);
      setPopup(hit ? { docId, highlightId: hit.id, below: touch, ...inScroller(c, e.clientX, touch ? e.clientY : e.clientY - 8) } : null);
    });
  };

  const fromSelection = (anchor: Anchor, c: Color) => {
    getSelection()?.removeAllRanges();
    setPopup(null);
    return addHighlight(activeDocId!, anchor.parts, anchor.text, c);
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

  const active = docs.find((d) => d.id === activeDocId);
  const ready = !!active && loaded === activeDocId;
  const error = failed && failed.docId === activeDocId ? failed.message : null;
  const shown = popup?.docId === activeDocId ? popup : null;
  const highlight = shown && 'highlightId' in shown ? highlights.find((h) => h.id === shown.highlightId) : undefined;
  const card = highlight && cards.find((c) => c.data.kind === 'excerpt' && c.data.highlightId === highlight.id);

  return (
    <section
      className={`doc-pane${dropping ? ' dropping' : ''}`}
      aria-label="Documents"
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
            <button role="tab" aria-selected={d.id === activeDocId} onClick={() => setActiveDoc(d.id)} title={d.name}>
              {d.name}
            </button>
            <button className="close" aria-label={`Remove ${d.name}`} onClick={() => confirm(`Remove “${d.name}” and its highlights and excerpts from this project?`) && removeDoc(d.id)}>
              ×
            </button>
          </div>
        ))}
        <FilePicker label="Add PDF" onProblems={onProblems} />
      </div>

      <div className="doc-body">
        <div className="doc-scroll" ref={scroller} onPointerUp={onPointerUp} onDragStart={onDragStart}>
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
              <button onClick={() => (void navigator.clipboard.writeText(shown.anchor.text), setPopup(null))}>Copy</button>
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
                <button key={c} className={`swatch hl-${c}${c === highlight.color ? ' current' : ''}`} aria-label={`Make it ${c}`} title={`Make it ${c}`} onClick={() => recolor(highlight.id, c)} />
              ))}
              <button onClick={() => (setPopup(null), removeHighlight(highlight.id))}>Delete</button>
            </div>
          )}
        </div>

        {!docs.length && (
          <div className="empty">
            <p>Drop PDFs here to start reading.</p>
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
          <span>
            Page {status.page} of {active.pages}
          </span>
          <span className="zoom">
            <button aria-label="Zoom out" onClick={() => zoom('out')}>
              −
            </button>
            <button className="scale" title="Fit to width" onClick={() => zoom('fit')}>
              {Math.round(status.scale * 100)}%
            </button>
            <button aria-label="Zoom in" onClick={() => zoom('in')}>
              +
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
