import { Image } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { loadDoc } from '../../pdf/pdfjs';
import { showPage, showSource, useStore, type Pane } from '../../store/project';
import type { Highlight } from '../../types';
import { Pages } from './Pages';

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number];
type Tab = 'contents' | 'pages' | 'highlights';
const TABS: [Tab, string][] = [
  ['contents', 'Contents'],
  ['pages', 'Pages'],
  ['highlights', 'Highlights'],
];

/** The document open in a pane, for the sidebar's lists, opened again for each new version of its `file`; null while it opens or if it cannot. */
function useDoc(docId: string, password?: string, file?: string) {
  const [doc, setDoc] = useState<{ docId: string; doc: PDFDocumentProxy } | null>(null);
  useEffect(() => {
    let stale = false;
    loadDoc(docId, password).then(
      (d) => !stale && setDoc({ docId, doc: d }),
      () => {},
    );
    return () => void (stale = true);
  }, [docId, password, file]);
  return doc?.docId === docId ? doc.doc : null;
}

/** The PDF's table of contents, the pages as thumbnails, and the reader's highlights, beside one pane's document. */
export function Sidebar({ pane, docId, page, onJump }: { pane: Pane; docId: string; page: number; onJump: () => void }) {
  const [tab, setTab] = useState<Tab>('contents');
  const password = useStore((s) => s.project?.docs.find((d) => d.id === docId)?.password);
  const file = useStore((s) => s.project?.docs.find((d) => d.id === docId)?.file);
  const doc = useDoc(docId, password, file);
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
          <Pages key={docId} doc={doc} docId={docId} password={password} pane={pane} current={page} onJump={onJump} />
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

const byPlace = (a: Highlight, b: Highlight) =>
  (a.parts[0]?.page ?? 0) - (b.parts[0]?.page ?? 0) ||
  (a.parts[0]?.rects[0]?.[1] ?? 0) - (b.parts[0]?.rects[0]?.[1] ?? 0) ||
  (a.parts[0]?.rects[0]?.[0] ?? 0) - (b.parts[0]?.rects[0]?.[0] ?? 0);

function Highlights({ docId, pane, onJump }: { docId: string; pane: Pane; onJump: () => void }) {
  const all = useStore((s) => s.project?.highlights);
  const mine = (all ?? []).filter((h) => h.docId === docId).sort(byPlace);
  if (!mine.length) return <p className="side-empty">Highlights, figures and comments in this document will be listed here.</p>;
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
            {h.note && <span className="note">{h.note}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
