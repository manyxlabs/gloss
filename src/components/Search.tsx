import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { search, type CardHit, type CommentHit, type DocHit } from '../search';
import { showCard, showPage, showSource, useStore } from '../store/project';

type Option = { id: string; go: () => void; body: ReactNode };

export function Search() {
  const project = useStore((s) => s.project);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<{
    query: string;
    docs: DocHit[];
    cards: CardHit[];
    comments: CommentHit[];
  } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !project) return;
    let stale = false;
    // Text is read from every PDF on the first search, so wait for typing to pause.
    const t = setTimeout(
      () =>
        void search(project, q).then((r) => {
          if (stale) return;
          setResults({ query: q, ...r });
          setActive(-1);
        }),
      200,
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, project]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        input.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onDown);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onDown);
    };
  }, []);

  // On a phone the field is folded into a button until opened, and only then can it take the focus.
  useLayoutEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // In braces: scrolling may return a promise, which React would take for a cleanup.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const docName = (id: string) => project?.docs.find((d) => d.id === id)?.name ?? '';
  const q = query.trim();
  const shown = q.length >= 2 && results?.query === q ? results : null;
  const searching = q.length >= 2 && !shown;

  // Every result in the order shown, so the arrow keys can walk them.
  // Choosing a result hands the keyboard back to the page it opens.
  const close = (then: () => void) => () => (setOpen(false), input.current?.blur(), then());
  const groups: { title: string; options: Option[] }[] = shown
    ? [
        {
          title: 'On the canvas',
          options: shown.cards.map((hit) => ({ id: `card-${hit.cardId}`, go: close(() => showCard(hit.cardId)), body: <span className="snippet">{hit.text}</span> })),
        },
        {
          title: 'Comments',
          options: shown.comments.map((hit) => ({
            id: `comment-${hit.highlightId}`,
            go: close(() => showSource(hit.highlightId)),
            body: (
              <>
                <span className="page">p. {hit.page}</span>
                <span className="snippet">
                  {docName(hit.docId)}: {hit.note}
                </span>
              </>
            ),
          })),
        },
        ...(project?.docs ?? []).map((doc) => ({
          title: doc.name,
          options: shown.docs
            .filter((h) => h.docId === doc.id)
            .map((hit, i) => ({
              id: `doc-${doc.id}-${i}`,
              go: close(() => showPage(doc.id, hit.page, { query: shown.query })),
              body: (
                <>
                  <span className="page">p. {hit.page}</span>
                  <span className="snippet">
                    …{hit.before}
                    <mark>{hit.match}</mark>
                    {hit.after}…
                  </span>
                </>
              ),
            })),
        })),
      ].filter((g) => g.options.length)
    : [];
  const options = groups.flatMap((g) => g.options);
  const current = options[active];
  const listed = open && (shown || searching);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 && step < 0 ? options.length - 1 : (a + step + options.length) % options.length));
    } else if (e.key === 'Enter' && listed && options.length) {
      e.preventDefault();
      (current ?? options[0]!).go();
    }
  };

  return (
    <div className={`search${open ? ' open' : ''}`} ref={box}>
      <button className="icon opener" aria-label="Search" title="Search (Ctrl+K)" onClick={() => setOpen(true)}>
        <SearchIcon size={17} />
      </button>
      <SearchIcon size={15} />
      <input
        ref={input}
        type="search"
        placeholder="Search"
        aria-label="Search documents and cards"
        aria-controls="search-results"
        aria-activedescendant={listed && current ? current.id : undefined}
        value={query}
        onChange={(e) => (setQuery(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {!query && <kbd>Ctrl K</kbd>}
      {listed && (
        <div className="results" id="search-results" role="listbox" aria-label="Search results" aria-busy={searching} ref={list}>
          {searching ? (
            <p className="none" role="status">
              Searching…
            </p>
          ) : (
            !options.length && <p className="none">Nothing matches “{shown!.query}”.</p>
          )}
          {groups.map((g) => (
            <div key={g.options[0]!.id} role="group" aria-label={g.title}>
              <h3>{g.title}</h3>
              {g.options.map((o) => (
                <button key={o.id} id={o.id} role="option" tabIndex={-1} aria-selected={o === current} onClick={o.go} onPointerMove={() => setActive(options.indexOf(o))}>
                  {o.body}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
