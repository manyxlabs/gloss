import { ArrowDown, ArrowUp, CopyPlus, Ellipsis, FilePlus2, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { ACCEPT } from '../../convert/formats';
import { anchoredOn, duplicate, editPages, insert, move, PROTECTED, remove, rotate, type Plan } from '../../pdf/pages';
import { regionImage } from '../../pdf/pdfjs';
import { showPage, useStore, type Pane } from '../../store/project';
import { Menu } from '../Menu';

/** Thumbnail width in CSS pixels, drawn at the screen's own resolution. */
const THUMB_WIDTH = 104;
const PAGES_MIME = 'application/x-gloss-pages';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listed = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const sorted = (pages: Iterable<number>) => [...new Set(pages)].sort((a, b) => a - b);

/**
 * The pages as thumbnails, each jumping to its page, with the page tools: pick pages (Ctrl or Shift
 * to pick several), then rotate, move, duplicate, delete or insert pages from the selection bar or a
 * page's menu, or drag them to a new place. Every edit is one step to undo.
 */
export function Pages({
  doc,
  docId,
  password,
  pane,
  current,
  onJump,
}: {
  doc: PDFDocumentProxy;
  docId: string;
  password?: string;
  pane: Pane;
  current: number;
  onJump: () => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const insertAt = useRef(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ page: number; button: HTMLElement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [drop, setDrop] = useState<number | null>(null);
  const count = doc.numPages;
  const chosen = picked.filter((n) => n <= count);
  const locked = !!password;

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

  /** The pages an action from a page's menu works on: the selection, if the page is in it. */
  const targets = (page: number) => (chosen.includes(page) ? chosen : [page]);

  const run = async (plan: Plan, after: (n: number) => number[] = () => [], add: File[] = []) => {
    setMenu(null);
    setBusy(true);
    try {
      const failed = await editPages(docId, plan, add);
      setProblems(failed);
      if (!failed.length) setPicked(after(count));
    } finally {
      setBusy(false);
    }
  };

  /** Where pages end up after a plan, to keep them selected. */
  const landing = (plan: Plan, pages: number[]) => (n: number) => plan(n, 0).flatMap((s, i) => ('page' in s && pages.includes(s.page) ? [i + 1] : []));

  const moveTo = (pages: number[], before: number) => {
    const plan = move(pages, before);
    void run(plan, landing(plan, pages));
  };

  const del = (pages: number[]) => {
    const project = useStore.getState().project;
    if (!project || pages.length >= count) return;
    const a = anchoredOn(project, docId, pages);
    const lost = listed([
      ...(a.highlights ? [plural(a.highlights, 'highlight')] : []),
      ...(a.comments ? [plural(a.comments, 'comment')] : []),
      ...(a.excerpts ? [plural(a.excerpts, 'excerpt card')] : []),
      ...(a.inks ? [plural(a.inks, 'handwritten stroke')] : []),
    ]);
    const what = pages.length === 1 ? `page ${pages[0]}` : `pages ${listed(pages.map(String))}`;
    if (lost && !confirm(`Delete ${what}? ${lost} on ${pages.length === 1 ? 'it' : 'them'} will be deleted too. Undo brings everything back.`)) return;
    void run(remove(pages));
  };

  const addFrom = (at: number) => {
    setMenu(null);
    insertAt.current = at;
    files.current!.click();
  };

  const pick = (page: number, e: MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, page), Math.max(anchor, page)];
      return setPicked(sorted([...chosen, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)]));
    }
    setAnchor(page);
    if (e.ctrlKey || e.metaKey) return setPicked(chosen.includes(page) ? chosen.filter((n) => n !== page) : sorted([...chosen, page]));
    setPicked([page]);
    showPage(docId, page, { pane });
    onJump();
  };

  const onDragStart = (e: DragEvent, page: number) => {
    const pages = targets(page);
    if (!chosen.includes(page)) setPicked([page]);
    e.dataTransfer.setData(PAGES_MIME, JSON.stringify(pages));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: DragEvent, page: number) => {
    if (!e.dataTransfer.types.includes(PAGES_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    setDrop(e.clientY < box.top + box.height / 2 ? page : page + 1);
  };
  const onDrop = (e: DragEvent) => {
    const data = e.dataTransfer.getData(PAGES_MIME);
    if (!data || drop === null) return;
    e.preventDefault();
    setDrop(null);
    moveTo(JSON.parse(data) as number[], drop);
  };

  if (!ratio) return null;
  const several = chosen.length > 1;
  const at = menu ? targets(menu.page) : [];
  return (
    <>
      {locked && <p className="side-note">{PROTECTED}</p>}
      {busy && (
        <p className="side-note" role="status">
          Updating pages…
        </p>
      )}
      {problems.length > 0 && (
        <div className="side-problem" role="alert">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <button className="icon" aria-label="Dismiss" onClick={() => setProblems([])}>
            <X size={14} />
          </button>
        </div>
      )}
      {several && !locked && (
        <div className="pages-bar" role="toolbar" aria-label="Selected pages">
          <span>{plural(chosen.length, 'page')}</span>
          <button className="icon" aria-label="Rotate left" title="Rotate left" disabled={busy} onClick={() => void run(rotate(chosen, -90), () => chosen)}>
            <RotateCcw size={16} />
          </button>
          <button className="icon" aria-label="Rotate right" title="Rotate right" disabled={busy} onClick={() => void run(rotate(chosen, 90), () => chosen)}>
            <RotateCw size={16} />
          </button>
          <button
            className="icon"
            aria-label="Delete pages"
            title={chosen.length >= count ? 'A document needs at least one page' : 'Delete'}
            disabled={busy || chosen.length >= count}
            onClick={() => del(chosen)}
          >
            <Trash2 size={16} />
          </button>
          <button className="icon" aria-label="Clear selection" title="Clear selection" onClick={() => setPicked([])}>
            <X size={16} />
          </button>
        </div>
      )}
      <ol className={`thumbs${busy ? ' busy' : ''}`} ref={list} aria-busy={busy} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <li
            key={n}
            className={`${chosen.includes(n) ? 'picked' : ''}${drop === n ? ' drop-before' : ''}${drop === n + 1 && n === count ? ' drop-after' : ''}`}
            draggable={!locked && !busy}
            onDragStart={(e) => onDragStart(e, n)}
            onDragOver={(e) => onDragOver(e, n)}
            onDrop={onDrop}
            onDragEnd={() => setDrop(null)}
          >
            <button aria-label={`Page ${n}`} aria-current={current === n ? 'page' : undefined} aria-pressed={chosen.includes(n)} onClick={(e) => pick(n, e)}>
              <Thumb doc={doc} docId={docId} password={password} page={n} ratio={ratio} />
              <span>{n}</span>
            </button>
            {!locked && (
              <button
                className="icon page-more"
                aria-label="Page actions"
                aria-haspopup="menu"
                aria-expanded={menu?.page === n}
                disabled={busy}
                onClick={(e) => setMenu(menu?.page === n ? null : { page: n, button: e.currentTarget })}
              >
                <Ellipsis size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {menu && (
        <Menu anchor={menu.button} label={at.length > 1 ? `${plural(at.length, 'page')}` : `Page ${menu.page}`} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => void run(rotate(at, -90), () => at)}>
            <RotateCcw size={16} /> Rotate left
          </button>
          <button role="menuitem" onClick={() => void run(rotate(at, 90), () => at)}>
            <RotateCw size={16} /> Rotate right
          </button>
          <button role="menuitem" disabled={at[0] === 1} onClick={() => moveTo(at, at[0]! - 1)}>
            <ArrowUp size={16} /> Move up
          </button>
          <button role="menuitem" disabled={at.at(-1) === count} onClick={() => moveTo(at, at.at(-1)! + 2)}>
            <ArrowDown size={16} /> Move down
          </button>
          <button role="menuitem" onClick={() => void run(duplicate(at))}>
            <CopyPlus size={16} /> Duplicate
          </button>
          <hr />
          <button role="menuitem" onClick={() => addFrom(at[0]! - 1)}>
            <FilePlus2 size={16} /> Insert pages before…
          </button>
          <button role="menuitem" onClick={() => addFrom(at.at(-1)!)}>
            <FilePlus2 size={16} /> Insert pages after…
          </button>
          <hr />
          <button role="menuitem" className="danger" disabled={at.length >= count} onClick={() => del(at)}>
            <Trash2 size={16} /> {at.length > 1 ? `Delete ${plural(at.length, 'page')}` : 'Delete page'}
          </button>
        </Menu>
      )}
      <input
        ref={files}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const chosenFiles = [...(e.target.files ?? [])];
          e.target.value = '';
          if (chosenFiles.length) void run(insert(insertAt.current), undefined, chosenFiles);
        }}
      />
    </>
  );
}

/** A page drawn small once it scrolls near view, at its own shape, as a turned page is wider than the rest. */
function Thumb({ doc, docId, password, page, ratio }: { doc: PDFDocumentProxy; docId: string; password?: string; page: number; ratio: number }) {
  const box = useRef<HTMLSpanElement>(null);
  // Kept with the file it was drawn from, so a page edit never shows another page's picture.
  const [drawn, setDrawn] = useState<{ doc: PDFDocumentProxy; url: string; ratio: number } | null>(null);
  const shown = drawn?.doc === doc ? drawn : null;
  useEffect(() => {
    let stale = false;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        seen.disconnect();
        void doc.getPage(page).then(async (p) => {
          const { width, height } = p.getViewport({ scale: 1 });
          const url = await regionImage(docId, password, page, [0, 0, 1, 1], (THUMB_WIDTH * devicePixelRatio) / width);
          if (!stale) setDrawn({ doc, url, ratio: width / height });
        });
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
    <span className="thumb" ref={box} style={{ aspectRatio: shown?.ratio ?? ratio }}>
      {shown && <img src={shown.url} alt="" draggable={false} />}
    </span>
  );
}
