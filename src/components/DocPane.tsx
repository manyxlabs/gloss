import 'pdfjs-dist/web/pdf_viewer.css';
import { Check, Columns2, Copy, FileDown, FoldVertical, Link2, MessageSquare, MessageSquarePlus, Minus, PanelLeft, Plus, Tag, Trash2, X } from 'lucide-react';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { inkAlong } from '../erase';
import { download } from '../export';
import { outline, PAPER, pathOf } from '../ink';
import { commentOf } from '../links';
import { highlightAt, locate, pageAt, pointOnPage, selectionAnchor, textBoxes, type Anchor } from '../pdf/anchor';
import { annotatedPdf } from '../pdf/annotate';
import { layoutFolds, refreshTails } from '../pdf/folds';
import { loadDoc, textIn } from '../pdf/pdfjs';
import { shownLook, useReading } from '../reading';
import {
  addDocs,
  addFold,
  addHighlight,
  addInk,
  excerpt,
  jumped,
  notePen,
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
import { commentSelection, detachComment, pick, pickSelection, setComment, startLinking, useLinking } from '../store/links';
import { setTag } from '../store/tags';
import { COLORS, type Color, type Point, type Rect } from '../types';
import { Collapse } from './doc/Collapse';
import { LinkPopover } from './doc/LinkPopover';
import { AnnotsBanner } from './doc/AnnotsBanner';
import { PageLookMenu } from './doc/PageLookMenu';
import { NoteEditor } from './doc/NoteEditor';
import { OcrBanner } from './doc/OcrBanner';
import { paint, type PageView } from './doc/paint';
import { Sidebar } from './doc/Sidebar';
import { DefinedTerms } from './doc/Terms';
import { TagPicker, TagRow } from './Tags';
import { EXCERPT_MIME } from './dnd';
import { FilePicker } from './FilePicker';
import { onTabKeys, revealTab } from './tabs';
import { WebPicker } from './WebPicker';
import { Tools } from './Tools';

// pdf.js tidies its text layers on every keyup and selection change in the document, and that
// change to the page ends the browser's undo step for typing in any field after one letter.
// Such events from fields stop at the app's root, short of the document.
for (const type of ['keyup', 'selectionchange'])
  document.getElementById('root')!.addEventListener(type, (e) => {
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)) e.stopPropagation();
  });

type Viewer = { viewer: PDFViewer; bus: EventBus; links: PDFLinkService };
/** A toolbar for a selection or a highlight, or with `editing` the comment on it, or with `tagging` its tags. */
type Popup = { docId: string; x: number; y: number; below?: boolean; editing?: boolean } & ({ anchor: Anchor } | { highlightId: string; links?: boolean; tagging?: boolean });
type Stroke = { page: number; box: DOMRect; points: Point[]; pen: boolean };
/** A box being drawn on a page, kept to the stretch of the page in view where it started. */
type Snip = { page: number; box: DOMRect; from: number; to: number; x: number; y: number };

const FLASH_MS = 1600;
/** Pen width as a fraction of the page's width: about a fine felt tip on A4. */
export const INK_SIZE = 0.005;
/** Fingers brought this close together, from where they started, squeeze the text between them. */
const SQUEEZE_AT = 0.6;
const POPUP_HALF_WIDTH = 190;
/** A box smaller than this, in screen pixels, was a click rather than a snip. */
const MIN_SNIP = 8;
/** Narrower than this, a pane's sidebar covers the page instead of pushing it aside, and its toolbar is compacted. */
const SIDEBAR_BESIDE = 560;

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
  const comments = useStore((s) => s.project?.comments);
  const passageLinks = useStore((s) => s.project?.passageLinks);
  const cardLinks = useStore((s) => s.project?.cardLinks);
  const linking = useLinking((s) => s.linking);
  const inks = useStore((s) => s.project?.inks);
  const folds = useStore((s) => s.project?.folds);
  const activeDocId = useStore((s) => (pane ? s.sideDocId : s.activeDocId));
  // A page edit, or its undo, gives the document a new file to show.
  const file = useStore((s) => s.project?.docs.find((d) => d.id === (pane ? s.sideDocId : s.activeDocId))?.file);
  const split = useStore((s) => s.sideDocId !== null);
  const jump = useStore((s) => s.jump);
  const tool = useStore((s) => s.docTool);
  const inkColor = useStore((s) => s.inkColor);
  // Pictures are put back over dark pages as they are, which a repaint does.
  const pictures = useReading((s) => shownLook(s) === 'dark' && s.keepImages);

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
  const [sidebar, setSidebar] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const section = useRef<HTMLElement>(null);
  const snipLive = useRef<HTMLDivElement>(null);
  const snip = useRef<Snip | null>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  /** Tags chosen while writing a comment on a selection, put on its highlight when it is saved. */
  const [draftTags, setDraftTags] = useState<string[]>([]);

  useEffect(() => revealTab(tabList.current), [activeDocId, docs.length]);

  // Escape puts a toolbar away, with the selection it was for; a selection gone by other means takes its toolbar with it.
  const toolbar = popup && !popup.editing && !('tagging' in popup && popup.tagging) ? popup : null;
  useEffect(() => {
    if (!toolbar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if ('anchor' in toolbar) getSelection()?.removeAllRanges();
      setPopup(null);
    };
    const onSelection = () => 'anchor' in toolbar && (getSelection()?.isCollapsed ?? true) && setPopup(null);
    addEventListener('keydown', onKey);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      removeEventListener('keydown', onKey);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, [toolbar]);

  useEffect(() => {
    const resize = new ResizeObserver(([entry]) => setNarrow(entry!.contentRect.width < SIDEBAR_BESIDE));
    resize.observe(section.current!);
    return () => resize.disconnect();
  }, []);

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
      imageResourcesPath: `${import.meta.env.BASE_URL}pdfjs/images/`,
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
    // The same document in a new version keeps its zoom.
    const scale = loaded === activeDocId && p.viewer.pdfDocument ? p.viewer.currentScaleValue : 'page-width';
    loadDoc(activeDocId, useStore.getState().project?.docs.find((d) => d.id === activeDocId)?.password).then(
      (doc) => {
        if (stale) return;
        p.bus.on(
          'pagesinit',
          () => {
            if (stale) return;
            p.viewer.currentScaleValue = scale;
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
  }, [activeDocId, file]); // eslint-disable-line react-hooks/exhaustive-deps

  // Before the jump below, so a squeeze opened for a jump is laid out when the jump measures.
  useEffect(() => {
    if (pdf.current) relayout(pdf.current.viewer, activeDocId);
  }, [folds, loaded, activeDocId]);

  useEffect(
    () => paintPages(pdf.current?.viewer, flash.current, activeDocId),
    [highlights, cards, inks, comments, passageLinks, cardLinks, linking, loaded, activeDocId, pictures],
  );

  useEffect(() => {
    const p = pdf.current;
    if (!jump || jump.pane !== pane || !p || loaded !== activeDocId) return;
    jumped();
    if ('page' in jump) {
      if (jump.dest) void p.links.goToDestination(jump.dest);
      else p.viewer.currentPageNumber = jump.page;
      if (jump.query)
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

  // With a stylus about, a finger on the page scrolls it even while the pen is chosen: the page
  // takes no touches of its own then, so the scroll is done here.
  const fingerScroll = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'pen') notePen();
    if (!activeDocId || tool === 'select' || (e.target as HTMLElement).closest('.popup, .fold-bar')) return;
    if (e.pointerType === 'touch' && useStore.getState().penSeen) {
      const c = scroller.current!;
      fingerScroll.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: c.scrollLeft, top: c.scrollTop };
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    eraser.current = null;
    if (tool === 'eraser') return erase(e.clientX, e.clientY);
    const hit = pageAt(scroller.current!, e.clientX, e.clientY);
    if (!hit) return;
    if (tool === 'snip') {
      snip.current = { page: hit.page, box: hit.box, from: hit.from, to: hit.to, x: e.clientX, y: e.clientY };
      return drawSnip(snip.current, e.clientX, e.clientY);
    }
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
    const f = fingerScroll.current;
    if (f && f.id === e.pointerId) return scroller.current!.scrollTo(f.left - (e.clientX - f.x), f.top - (e.clientY - f.y));
    if (snip.current) return drawSnip(snip.current, e.clientX, e.clientY);
    if (tool === 'eraser' && e.buttons) return erase(e.clientX, e.clientY);
    const s = stroke.current;
    if (!s) return;
    // Coalesced events keep a fast stroke smooth: the screen may report fewer moves than the pen made.
    for (const m of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent])
      s.points.push([(m.clientX - s.box.left) / s.box.width, (m.clientY - s.box.top) / s.box.height, m.pressure || 0.5]);
    drawLive(s);
  };

  const finishStroke = () => {
    fingerScroll.current = null;
    const s = stroke.current;
    stroke.current = null;
    drawLive(null);
    // Strokes are kept in fractions of the page's width and height.
    if (s && activeDocId) addInk(activeDocId, s.page, s.points, INK_SIZE, s.pen);
  };

  /** The box being snipped as page fractions, kept to the page and to the stretch of it in view. */
  const snipRect = (s: Snip, x: number, y: number): Rect => {
    const fx = (v: number) => Math.min(1, Math.max(0, (v - s.box.left) / s.box.width));
    const fy = (v: number) => Math.min(s.to, Math.max(s.from, (v - s.box.top) / s.box.height));
    const [left, right] = [fx(s.x), fx(x)].sort((a, b) => a - b) as [number, number];
    const [top, bottom] = [fy(s.y), fy(y)].sort((a, b) => a - b) as [number, number];
    return [left, top, right - left, bottom - top];
  };

  const drawSnip = (s: Snip | null, x: number, y: number) => {
    const el = snipLive.current!;
    if (!s) return void (el.style.display = 'none');
    const [rx, ry, rw, rh] = snipRect(s, x, y);
    const at = body.current!.getBoundingClientRect();
    Object.assign(el.style, {
      display: 'block',
      left: `${s.box.left - at.left + rx * s.box.width}px`,
      top: `${s.box.top - at.top + ry * s.box.height}px`,
      width: `${rw * s.box.width}px`,
      height: `${rh * s.box.height}px`,
    });
  };

  /** Keeps the box drawn as an area highlight, with the page's text inside it, and offers what can be done with it. */
  const finishSnip = async (x: number, y: number) => {
    const s = snip.current;
    snip.current = null;
    drawSnip(null, 0, 0);
    if (!s || !activeDocId) return;
    const rect = snipRect(s, x, y);
    if (rect[2] * s.box.width < MIN_SNIP || rect[3] * s.box.height < MIN_SNIP) return setPopup(null);
    const docId = activeDocId;
    const text = await textIn(docId, active?.password, s.page, [rect]).catch(() => '');
    const h = addHighlight(docId, [{ page: s.page, rects: [rect] }], text, color, { area: true });
    const c = scroller.current!;
    const top = Math.min(s.y, y);
    const below = top - c.getBoundingClientRect().top < 60;
    setPopup({ docId, highlightId: h.id, below, ...inScroller(c, (s.x + x) / 2, below ? Math.max(s.y, y) : top - 8) });
  };

  const onPointerCancel = () => {
    if (!snip.current) return finishStroke();
    snip.current = null;
    drawSnip(null, 0, 0);
  };

  /** A comment's marker in the margin opens the comment, and a link's marker what it links to, below the marker. */
  const onClick = (e: ReactMouseEvent) => {
    const mark = (e.target as HTMLElement).closest<HTMLElement>('.note-mark, .link-mark');
    if (!mark || !activeDocId) return;
    const box = mark.getBoundingClientRect();
    const at = { docId: activeDocId, below: true, ...inScroller(scroller.current!, box.left + box.width / 2, box.top) };
    setPopup(mark.dataset.noteId ? { ...at, highlightId: mark.dataset.noteId, editing: true } : { ...at, highlightId: mark.dataset.linkId!, links: true });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (tool === 'snip') return void finishSnip(e.clientX, e.clientY);
    if (tool !== 'select') return finishStroke();
    if (!activeDocId || (e.target as HTMLElement).closest('.popup, .fold-bar, .note-mark, .link-mark')) return;
    const docId = activeDocId;
    const c = scroller.current!;
    const touch = e.pointerType === 'touch';
    // The selection settles after the pointer is released.
    setTimeout(() => {
      const selected = selectionPopup(c, touch, docId);
      const at = pointOnPage(c, e.clientX, e.clientY);
      const hit = at && highlightAt(useStore.getState().project?.highlights ?? [], docId, at.page, at.fx, at.fy);
      // While linking, a mouse selection or a highlight is the other end at once; a touch selection is still being adjusted, so it waits for its toolbar.
      if (useLinking.getState().linking && ((selected && !touch) || (!selected && hit))) {
        setPopup(null);
        const anchor = selected && selectionAnchor(c);
        if (anchor) {
          getSelection()?.removeAllRanges();
          return pickSelection(docId, anchor, color);
        }
        return void pick(hit!.id);
      }
      if (selected) return setPopup(selected);
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

  // A press inside a selection starts a drag; let go where nothing takes it, the selection is still there, and so is its toolbar.
  const onDragEnd = (e: DragEvent) => {
    if (e.dataTransfer.dropEffect !== 'none') return getSelection()?.removeAllRanges();
    setPopup(selectionPopup(scroller.current!, false, activeDocId));
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
  const comment = highlight && comments && commentOf({ comments }, highlight);
  /** Saves the comment being written, making its highlight first for a selection, and returns the passage it is on. */
  const saveComment = (text: string) => {
    if (!shown) return;
    setPopup(null);
    if ('highlightId' in shown) return setComment(shown.highlightId, text) && shown.highlightId;
    getSelection()?.removeAllRanges();
    const tags = draftTags;
    setDraftTags([]);
    const h = text.trim()
      ? commentSelection(activeDocId!, shown.anchor, color, text)
      : tags.length
        ? addHighlight(activeDocId!, shown.anchor.parts, shown.anchor.text, color)
        : undefined;
    // In the same undo step as the highlight.
    if (h) for (const t of tags) setTag({ highlights: [h.id] }, t, true, false);
    return h?.id;
  };

  return (
    <section
      ref={section}
      className={`doc-pane${dropping ? ' dropping' : ''}${narrow ? ' narrow' : ''}${sidebar && active ? (narrow ? ' sidebar-over' : ' sidebar-beside') : ''}`}
      aria-label={pane ? 'Second document' : 'Documents'}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={onDrop}
    >
      <div className="tabs">
        {active && (
          <button
            className="icon"
            aria-label="Contents, pages and highlights"
            title="Contents, pages and highlights"
            aria-pressed={sidebar}
            aria-expanded={sidebar}
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeft size={16} />
          </button>
        )}
        {/* Only the tabs scroll; the buttons around them stay in reach however many documents there are. */}
        <div className="tab-list" role="tablist" aria-label="Open documents" ref={tabList} onKeyDown={onTabKeys}>
          {docs.map((d) => (
            <div key={d.id} className={`tab${d.id === activeDocId ? ' active' : ''}`}>
              <button
                role="tab"
                aria-selected={d.id === activeDocId}
                tabIndex={d.id === activeDocId ? 0 : -1}
                onClick={() => setActiveDoc(d.id, pane)}
                title={d.source ? `${d.name}\n${d.source.kind === 'link' ? 'From' : 'Converted from'} ${d.source.url ?? d.source.name}` : d.name}
              >
                {d.name}
              </button>
              <button
                className="close"
                aria-label={`Remove ${d.name}`}
                tabIndex={d.id === activeDocId ? 0 : -1}
                onClick={() =>
                  confirm(`Remove “${d.name}” from this project, with its highlights, comments and the excerpts made from it? Undo brings it all back.`) && removeDoc(d.id)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {pane ? (
          <button className="icon side" aria-label="Close this pane" title="Close this pane" onClick={() => setSideBySide(false)}>
            <X size={16} />
          </button>
        ) : (
          docs.length > 0 && (
            <>
              <FilePicker label="Add file" onProblems={onProblems} />
              <WebPicker add={async (url, how) => onProblems(await addDocs([{ url }], how))} />
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
          )
        )}
      </div>

      <div className="doc-body" ref={body}>
        {sidebar && active && (
          <>
            {narrow && <div className="side-backdrop" onClick={() => setSidebar(false)} />}
            <aside className="doc-sidebar" aria-label="Contents, pages and highlights">
              {narrow && (
                <button className="icon side-close" aria-label="Close the sidebar" title="Close the sidebar" onClick={() => setSidebar(false)}>
                  <X size={16} />
                </button>
              )}
              <Sidebar pane={pane} docId={active.id} page={status.page} onJump={() => narrow && setSidebar(false)} />
            </aside>
          </>
        )}
        <div
          className={`doc-scroll tool-${tool}`}
          ref={scroller}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="pdfViewer" ref={viewerDiv} />
          {shown?.editing && ('anchor' in shown || highlight) && (
            <div className={`popup${shown.below ? ' below' : ''}`} style={{ left: shown.x, top: shown.y }} role="dialog" aria-label="Comment">
              <NoteEditor
                note={comment?.text}
                shared={comment ? highlights.filter((h) => h.commentId === comment.id).length : 1}
                onCancel={() => setPopup(null)}
                onSave={saveComment}
                onAttach={(text) => {
                  const on = saveComment(text);
                  const commentId = on && useStore.getState().project?.highlights.find((h) => h.id === on)?.commentId;
                  if (commentId) startLinking({ kind: 'attach', commentId });
                }}
                onDetach={() => (setPopup(null), highlight && detachComment(highlight.id))}
              />
              {highlight ? (
                <TagRow on={highlight.tags ?? []} onToggle={(id, on, fresh) => setTag({ highlights: [highlight.id] }, id, on, !fresh)} />
              ) : (
                <TagRow on={draftTags} onToggle={(id, on) => setDraftTags((d) => (on ? [...d, id] : d.filter((t) => t !== id)))} />
              )}
            </div>
          )}
          {shown && !shown.editing && 'anchor' in shown && (
            // Pressing a button here must not take the selection away from under it.
            <div
              className={`popup${shown.below ? ' below' : ''}`}
              style={{ left: shown.x, top: shown.y }}
              role="toolbar"
              aria-label="Selection"
              onMouseDown={(e) => e.preventDefault()}
            >
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
              <button
                className="icon"
                aria-label="Comment"
                title="Highlight with a comment in the margin"
                // The comment is written below the selection, where a box taller than the toolbar has room.
                onClick={() => (setDraftTags([]), setPopup({ ...(selectionPopup(scroller.current!, true, activeDocId) ?? shown), editing: true }))}
              >
                <MessageSquarePlus size={17} />
              </button>
              <button
                className="icon"
                aria-label="Highlight with tag"
                title="Highlight with a tag"
                onClick={() => {
                  // Below the selection's last line, as the comment editor is, where the list has room.
                  const at = selectionPopup(scroller.current!, true, activeDocId) ?? shown;
                  const h = fromSelection(shown.anchor, color);
                  setPopup({ docId: at.docId, highlightId: h.id, tagging: true, below: true, x: at.x, y: at.y });
                }}
              >
                <Tag size={16} />
              </button>
              <button
                className="icon"
                aria-label={linking ? 'Link here' : 'Link'}
                title={linking ? 'Make this the other end' : 'Link this passage to another'}
                onClick={() => {
                  if (linking) {
                    getSelection()?.removeAllRanges();
                    setPopup(null);
                    return pickSelection(activeDocId!, shown.anchor, color);
                  }
                  startLinking({ kind: 'link', from: fromSelection(shown.anchor, color).id });
                }}
              >
                <Link2 size={17} />
              </button>
              <button className="icon" aria-label="Squeeze" title="Squeeze these lines out of view" onClick={() => squeeze(shown.anchor)}>
                <FoldVertical size={17} />
              </button>
              <button
                className="icon copy"
                aria-label={copied ? 'Copied' : 'Copy'}
                title={copied ? 'Copied' : 'Copy'}
                onClick={async () => {
                  await navigator.clipboard.writeText(shown.anchor.text);
                  setCopied(true);
                  setTimeout(() => (setCopied(false), setPopup((p) => (p === shown ? null : p))), 900);
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}
          {shown && 'links' in shown && shown.links && highlight && <LinkPopover highlight={highlight} pane={pane} x={shown.x} y={shown.y} onClose={() => setPopup(null)} />}
          {shown && 'tagging' in shown && shown.tagging && highlight && (
            <div className={`popup tag-popup${shown.below ? ' below' : ''}`} style={{ left: shown.x, top: shown.y }} role="dialog" aria-label="Tags">
              <TagPicker on={highlight.tags ?? []} onToggle={(id, on, fresh) => setTag({ highlights: [highlight.id] }, id, on, !fresh)} onClose={() => setPopup(null)} />
            </div>
          )}
          {shown && !shown.editing && !('links' in shown && shown.links) && !('tagging' in shown && shown.tagging) && highlight && (
            <div
              className={`popup${shown.below ? ' below' : ''}`}
              style={{ left: shown.x, top: shown.y }}
              role="toolbar"
              aria-label="Highlight"
              onMouseDown={(e) => e.preventDefault()}
            >
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
              <button
                className="icon"
                aria-label={comment ? 'Edit comment' : 'Comment'}
                title={comment ? 'Edit the comment in the margin' : 'Add a comment in the margin'}
                onClick={() => setPopup({ ...shown, below: true, editing: true })}
              >
                <MessageSquare size={16} />
              </button>
              <button className="icon" aria-label="Tag" title="Tag this passage" onClick={() => setPopup({ ...shown, below: true, tagging: true })}>
                <Tag size={16} />
              </button>
              <button className="icon" aria-label="Link" title="Link this passage to another" onClick={() => (setPopup(null), startLinking({ kind: 'link', from: highlight.id }))}>
                <Link2 size={16} />
              </button>
              <button className="icon" aria-label="Delete" title="Delete highlight" onClick={() => (setPopup(null), removeHighlight(highlight.id))}>
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        <DefinedTerms viewer={viewerDiv} scroller={scroller} docId={ready ? active.id : null} pane={pane} />
        {ready && (
          <div className="doc-banners">
            <AnnotsBanner doc={active} onProblems={onProblems} />
            <OcrBanner doc={active} onProblems={onProblems} />
          </div>
        )}
        <div className="snip-live" ref={snipLive} style={{ display: 'none' }} />
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
            <p>
              <span className="mouse-only">Drop PDFs, Word or PowerPoint files, images or text here, or add a web page, to start reading.</span>
              <span className="touch-only">Add PDFs, Word or PowerPoint files, images, text or a web page to start reading.</span>
            </p>
            <div className="actions">
              <FilePicker label="Choose files" primary onProblems={onProblems} />
              <WebPicker kind="text" add={async (url, how) => onProblems(await addDocs([{ url }], how))} />
            </div>
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
          <Collapse docId={active.id} />
          <PageLookMenu />
          <button className="icon" aria-label="Export PDF with highlights" title="Export PDF with highlights and handwriting" disabled={exporting} onClick={() => void exportPdf()}>
            <FileDown size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
