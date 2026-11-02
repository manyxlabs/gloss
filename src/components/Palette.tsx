import { BookOpen, Bookmark, Columns2, FileText, Hash, LayoutDashboard, ListTree, Redo2, Settings2, StickyNote, Undo2, Zap, type LucideIcon } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { loadDoc } from '../pdf/pdfjs';
import { collapseAround, expandAll } from '../store/bulk';
import { addNote, closePane, openPane, paneCount, PANES, redo, setActiveDoc, setCanvas, setView, showPage, shownPanes, undo, useStore, type Pane } from '../store/project';
import { bookmarksOf } from '../store/bookmarks';
import { paneRoom } from '../panes';
import { manageTags, toggleFilter, useTagView } from '../store/tags';
import { setTermsOn, useTerms } from '../terms';
import { showEntry } from './doc/Sidebar';

type Item = { id: string; kind: string; label: string; icon: LucideIcon; run: () => void };
type Entry = { title: string; depth: number; dest: Parameters<typeof showEntry>[2] };

/** The document pane last pointed at or typed in; the palette acts on it. */
let lastPane: Pane = 0;
const notePane = (e: Event) => {
  const pane = (e.target as Element | null)?.closest?.('.doc-pane');
  if (pane) lastPane = Math.max(0, ['Documents', 'Second document', 'Third document'].indexOf(pane.getAttribute('aria-label') ?? '')) as Pane;
};

/** The PDF's contents, flattened in reading order with their depth. */
async function contentsOf(doc: PDFDocumentProxy): Promise<Entry[]> {
  const out: Entry[] = [];
  const walk = (items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>, depth: number) => {
    for (const item of items ?? []) {
      if (item.dest) out.push({ title: item.title, depth, dest: item.dest });
      walk(item.items, depth + 1);
    }
  };
  walk(await doc.getOutline(), 0);
  return out;
}

const matches = (label: string, words: string[]) => words.every((w) => label.toLowerCase().includes(w));

/**
 * Jumps by keyboard, with Ctrl+P or Ctrl+G: a page number goes to that page, and typing finds a
 * document, an entry in its contents, a canvas, a tag or an action. Arrow keys and Enter choose.
 * Pages and contents are those of the pane last used.
 */
export function Palette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pane, setPane] = useState<Pane>(0);
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s[PANES[pane]] ?? s.activeDocId);
  const terms = useTerms((s) => s.on);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (key !== 'p' && key !== 'g')) return;
      e.preventDefault();
      opener.current = document.activeElement;
      setPane(lastPane < shownPanes(useStore.getState()) ? lastPane : 0);
      setQuery('');
      setActive(0);
      setOpen(true);
    };
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', notePane, true);
    addEventListener('focusin', notePane, true);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', notePane, true);
      removeEventListener('focusin', notePane, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const password = project?.docs.find((d) => d.id === docId)?.password;
  useEffect(() => {
    if (!open || !docId) return;
    let stale = false;
    loadDoc(docId, password)
      .then(contentsOf)
      .then(
        (e) => !stale && setEntries(e),
        () => !stale && setEntries([]),
      );
    return () => void (stale = true);
  }, [open, docId, password]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open || !project) return null;
  const doc = project.docs.find((d) => d.id === docId);
  const close = (then?: () => void) => {
    setOpen(false);
    // The keyboard goes back where it was, unless what was chosen moved it.
    if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    then?.();
  };

  const q = query.trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const number = /^(?:p(?:age|\.)?\s*)?(\d+)$/i.exec(q)?.[1];
  const items: Item[] = [];
  if (number && doc) {
    const page = Math.min(Math.max(1, Number(number)), doc.pages);
    items.push({ id: 'page', kind: doc.name, label: `Go to page ${page} of ${doc.pages}`, icon: FileText, run: () => showPage(doc.id, page, { pane }) });
  }
  /** A nested canvas is named with the canvases it is inside, as it is reached through them. */
  const trail = (id: string, seen = new Set<string>()): string => {
    const c = project.canvases.find((x) => x.id === id);
    if (!c) return '';
    return c.parentId && !seen.has(c.parentId) ? `${trail(c.parentId, seen.add(id))} › ${c.name}` : c.name;
  };
  const filter = useTagView.getState().filter;
  const panes = paneCount(useStore.getState());
  const tagFilter = project.tags.map((t) => ({
    id: `tag-${t.id}`,
    kind: 'Tag',
    label: `${filter.includes(t.id) ? 'Stop filtering by' : 'Filter by'} ${t.name}`,
    icon: Hash,
    run: () => toggleFilter(t.id),
  }));
  const all: Item[] = [
    ...project.docs.map((d) => ({ id: `doc-${d.id}`, kind: 'Document', label: d.name, icon: FileText, run: () => setActiveDoc(d.id, pane) })),
    ...entries.map((e, i) => ({
      id: `toc-${i}`,
      kind: 'Contents',
      label: `${'  '.repeat(e.depth)}${e.title}`,
      icon: ListTree,
      run: () => void loadDoc(docId!, password).then((d) => showEntry(d, docId!, e.dest, pane)),
    })),
    ...(docId ? bookmarksOf(project, docId) : []).map((b) => ({
      id: `bookmark-${b.id}`,
      kind: 'Bookmark',
      label: `${b.name} (p. ${b.page})`,
      icon: Bookmark,
      run: () => showPage(b.docId, b.page, { pane, y: b.y }),
    })),
    ...project.canvases.map((c) => ({ id: `canvas-${c.id}`, kind: 'Canvas', label: trail(c.id), icon: LayoutDashboard, run: () => (setCanvas(c.id), setView('canvas')) })),
    ...tagFilter,
    { id: 'undo', kind: 'Action', label: 'Undo', icon: Undo2, run: undo },
    { id: 'redo', kind: 'Action', label: 'Redo', icon: Redo2, run: redo },
    { id: 'note', kind: 'Action', label: 'New note on the canvas', icon: StickyNote, run: () => (setView('canvas'), addNote()) },
    ...(panes < paneRoom() ? [{ id: 'open-pane', kind: 'Action', label: panes === 1 ? 'Open side by side' : 'Open a third pane', icon: Columns2, run: openPane }] : []),
    ...(panes > 1 ? [{ id: 'close-pane', kind: 'Action', label: 'Close the last pane', icon: Columns2, run: () => closePane((panes - 1) as 1 | 2) }] : []),
    ...(doc
      ? [
          { id: 'squeeze', kind: 'Action', label: 'Squeeze to highlights', icon: Zap, run: () => void collapseAround([doc.id], {}, 2) },
          { id: 'expand', kind: 'Action', label: 'Expand all squeezes', icon: Zap, run: () => expandAll(doc.id) },
        ]
      : []),
    { id: 'terms', kind: 'Action', label: terms ? 'Turn off defined terms' : 'Turn on defined terms', icon: BookOpen, run: () => setTermsOn(!terms) },
    { id: 'tags', kind: 'Action', label: 'Manage tags', icon: Settings2, run: () => manageTags() },
  ];
  items.push(...all.filter((i) => matches(`${i.kind} ${i.label}`, words)).slice(0, 60));
  const current = items[Math.min(active, items.length - 1)];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (Math.min(a, items.length - 1) + step + items.length) % items.length);
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      close(current.run);
    }
  };

  return (
    <div className="command-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="command-palette glass" role="dialog" aria-modal="true" aria-label="Go to">
        <input
          ref={input}
          aria-label="Go to a page, document, contents entry, canvas, tag or action"
          placeholder={doc ? `Page number in ${doc.name}, or a name or action` : 'A name or action'}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={current ? `palette-${current.id}` : undefined}
          value={query}
          onChange={(e) => (setQuery(e.target.value), setActive(0))}
          onKeyDown={onKeyDown}
        />
        <div className="command-list" id="command-list" role="listbox" aria-label="Places and actions" ref={list}>
          {!items.length && <p className="none">Nothing matches “{q}”.</p>}
          {items.map((item) => (
            <button
              key={item.id}
              id={`palette-${item.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={item === current}
              onPointerMove={() => setActive(items.indexOf(item))}
              onClick={() => close(item.run)}
            >
              <item.icon size={16} aria-hidden="true" />
              <span className="label">{item.label}</span>
              <span className="kind">{item.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
