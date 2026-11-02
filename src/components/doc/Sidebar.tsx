import { Image, Link2, StickyNote } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { loadDoc, regionImage } from '../../pdf/pdfjs';
import { commentOf, docName, endsOf, quoted } from '../../links';
import { cardText } from '../../search';
import { showEnd } from '../../store/links';
import { showCard, showPage, showSource, useStore, type Pane } from '../../store/project';
import type { Highlight } from '../../types';

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number];
type Tab = 'contents' | 'pages' | 'highlights';
const TABS: [Tab, string][] = [
  ['contents', 'Contents'],
  ['pages', 'Pages'],
  ['highlights', 'Highlights'],
];
/** Thumbnail width in CSS pixels, drawn at the screen's own resolution. */
const THUMB_WIDTH = 104;

/** The document open in a pane, for the sidebar's lists; null while it opens or if it cannot. */
function useDoc(docId: string, password?: string) {
  const [doc, setDoc] = useState<{ docId: string; doc: PDFDocumentProxy } | null>(null);
  useEffect(() => {
    let stale = false;
    loadDoc(docId, password).then(
      (d) => !stale && setDoc({ docId, doc: d }),
      () => {},
    );
    return () => void (stale = true);
  }, [docId, password]);
  return doc?.docId === docId ? doc.doc : null;
}

/** The PDF's table of contents, the pages as thumbnails, and the reader's highlights, beside one pane's document. */
export function Sidebar({ pane, docId, page, onJump }: { pane: Pane; docId: string; page: number; onJump: () => void }) {
  const [tab, setTab] = useState<Tab>('contents');
  const password = useStore((s) => s.project?.docs.find((d) => d.id === docId)?.password);
  const doc = useDoc(docId, password);
  return (
    <>
      <div className="side-tabs" role="tablist" aria-label="Sidebar">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="side-list" role="tabpanel" aria-label={TABS.find(([id]) => id === tab)![1]}>
        {!doc ? null : tab === 'contents' ? (
          <Contents doc={doc} docId={docId} pane={pane} onJump={onJump} />
        ) : tab === 'pages' ? (
          <Pages doc={doc} docId={docId} password={password} pane={pane} current={page} onJump={onJump} />
        ) : (
          <Highlights docId={docId} pane={pane} onJump={onJump} />
        )}
      </div>
    </>
  );
}

function Contents({ doc, docId, pane, onJump }: { doc: PDFDocumentProxy; docId: string; pane: Pane; onJump: () => void }) {
  const [outline, setOutline] = useState<OutlineItem[] | null | undefined>(undefined);
  useEffect(() => {
    let stale = false;
    doc.getOutline().then(
      (o) => !stale && setOutline(o?.length ? o : null),
      () => !stale && setOutline(null),
    );
    return () => void (stale = true);
  }, [doc]);

  const go = async (dest: OutlineItem['dest']) => {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    const ref = explicit?.[0];
    if (ref === undefined) return;
    // A destination names its page by reference, or in some files by number.
    const index = typeof ref === 'object' && ref ? await doc.getPageIndex(ref) : Number(ref);
    showPage(docId, index + 1, { pane, dest: explicit! });
    onJump();
  };

  if (outline === undefined) return null;
  if (!outline) return <p className="side-empty">This PDF has no table of contents. The Pages tab shows every page.</p>;
  const list = (items: OutlineItem[]) => (
    <ul>
      {items.map((item, i) => (
        <li key={i}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          ) : (
            <button disabled={!item.dest} onClick={() => void go(item.dest)}>
              {item.title}
            </button>
          )}
          {item.items.length > 0 && list(item.items)}
        </li>
      ))}
    </ul>
  );
  return <nav aria-label="Table of contents">{list(outline)}</nav>;
}

function Pages({ doc, docId, password, pane, current, onJump }: { doc: PDFDocumentProxy; docId: string; password?: string; pane: Pane; current: number; onJump: () => void }) {
  const list = useRef<HTMLOListElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    void doc.getPage(1).then((p) => {
      const { width, height } = p.getViewport({ scale: 1 });
      setRatio(width / height);
    });
  }, [doc]);

  // Keeps the current page's thumbnail in view, without scrolling anything else.
  useEffect(() => {
    const scroller = list.current?.parentElement;
    const el = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !el) return;
    const top = el.offsetTop;
    if (top < scroller.scrollTop || top + el.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top - (scroller.clientHeight - el.offsetHeight) / 2;
  }, [current, ratio]);

  if (!ratio) return null;
  return (
    <ol className="thumbs" ref={list}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <li key={i}>
          <button
            aria-label={`Page ${i + 1}`}
            aria-current={current === i + 1 ? 'page' : undefined}
            onClick={() => {
              showPage(docId, i + 1, { pane });
              onJump();
            }}
          >
            <Thumb doc={doc} docId={docId} password={password} page={i + 1} ratio={ratio} />
            <span>{i + 1}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A page drawn small once it scrolls near view, and kept for the next time it is shown. */
function Thumb({ doc, docId, password, page, ratio }: { doc: PDFDocumentProxy; docId: string; password?: string; page: number; ratio: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        seen.disconnect();
        void doc
          .getPage(page)
          .then((p) => regionImage(docId, password, page, [0, 0, 1, 1], (THUMB_WIDTH * devicePixelRatio) / p.getViewport({ scale: 1 }).width))
          .then((u) => !stale && setUrl(u));
      },
      { root: box.current!.closest('.side-list'), rootMargin: '300px 0px' },
    );
    seen.observe(box.current!);
    return () => {
      stale = true;
      seen.disconnect();
    };
  }, [doc, docId, password, page]);
  return (
    <span className="thumb" ref={box} style={{ aspectRatio: ratio }}>
      {url && <img src={url} alt="" draggable={false} />}
    </span>
  );
}

const byPlace = (a: Highlight, b: Highlight) =>
  (a.parts[0]?.page ?? 0) - (b.parts[0]?.page ?? 0) ||
  (a.parts[0]?.rects[0]?.[1] ?? 0) - (b.parts[0]?.rects[0]?.[1] ?? 0) ||
  (a.parts[0]?.rects[0]?.[0] ?? 0) - (b.parts[0]?.rects[0]?.[0] ?? 0);

function Highlights({ docId, pane, onJump }: { docId: string; pane: Pane; onJump: () => void }) {
  const project = useStore((s) => s.project);
  const mine = (project?.highlights ?? []).filter((h) => h.docId === docId).sort(byPlace);
  if (!project || !mine.length) return <p className="side-empty">Highlights, figures and comments in this document will be listed here.</p>;
  return (
    <ul className="marks">
      {mine.map((h) => (
        <li key={h.id}>
          <button
            className={`hl-${h.color}`}
            onClick={() => {
              showSource(h.id, pane);
              onJump();
            }}
          >
            <span className="what">
              {h.area && <Image size={14} aria-label="Figure" />}
              <span className="text">{h.text || (h.area ? 'Figure' : '')}</span>
              <span className="page">p. {h.parts[0]?.page}</span>
            </span>
            {h.commentId && <span className="note">{commentOf(project, h)?.text}</span>}
          </button>
          {endsOf(project, h.id).map((end) =>
            'highlight' in end ? (
              <button
                key={end.link.id}
                className={`end hl-${end.highlight.color}`}
                onClick={() => {
                  showEnd(end.highlight.id, pane);
                  onJump();
                }}
              >
                <Link2 size={13} aria-label="Linked passage" />
                <span className="text">{quoted(end.highlight) || 'Figure'}</span>
                <span className="page">
                  {end.highlight.docId === docId ? '' : `${docName(project, end.highlight.docId)}, `}p. {end.highlight.parts[0]?.page}
                </span>
              </button>
            ) : (
              <button
                key={end.link.id}
                className="end"
                onClick={() => {
                  showCard(end.card.id);
                  onJump();
                }}
              >
                <StickyNote size={13} aria-label="Linked card" />
                <span className="text">{cardText(project, end.card) || 'Handwriting'}</span>
                <span className="page">card</span>
              </button>
            ),
          )}
        </li>
      ))}
    </ul>
  );
}
