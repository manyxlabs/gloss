import { ListChecks, Search as SearchIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { parseQuery, search, type CardHit, type CommentHit, type DocHit, type HighlightHit } from '../search';
import { showCard, showPage, showSource, useStore } from '../store/project';
import { tagWord } from '../tags';
import { useLastSearch } from '../store/bulk';
import { SearchActions } from './SearchActions';
import { tagStyle } from './Tags';

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
    highlights: HighlightHit[];
  } | null>(null);
  /** The matches being acted on in bulk, for the words searched: of one document, by its id, or of all of them. */
  const [acting, setActing] = useState<{ words: string; id: string } | null>(null);
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
          useLastSearch.setState({ query: parseQuery(q, project.tags).text });
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
  const groups: { title: string; docId?: string; options: Option[] }[] = shown
    ? [
        {
          title: 'Tagged passages',
          options: shown.highlights.map((hit) => ({
            id: `tagged-${hit.highlightId}`,
            go: close(() => showSource(hit.highlightId)),
            body: (
              <>
                <span className="page">p. {hit.page}</span>
                <span className="snippet">
                  {docName(hit.docId)}: {hit.text}
                </span>
              </>
            ),
          })),
        },
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
          docId: doc.id,
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
  const tags = project?.tags ?? [];
  const words = shown && parseQuery(shown.query, tags);
  // Bulk actions take plain words: a search by tag finds passages that are already highlights.
  const bulk = words && !words.picks.length && words.text && shown.docs.length ? words.text : null;
  const actingOn = acting && acting.words === bulk ? acting.id : null;
  const act = (id: string) => setActing(actingOn === id || !bulk ? null : { words: bulk, id });
  const listed = open && (shown || searching || (!q && tags.length > 0));
  /** Adds a tag to the search, or takes it out. */
  const toggleTag = (word: string) => {
    const term = `#${word}`.toLowerCase();
    const parts = query.trim().split(/\s+/).filter(Boolean);
    const next = parts.some((p) => p.toLowerCase() === term) ? parts.filter((p) => p.toLowerCase() !== term) : [...parts, `#${word}`];
    setQuery(next.join(' ') + (next.length ? ' ' : ''));
    input.current?.focus();
  };

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
          {tags.length > 0 && (
            <div className="search-tags" role="group" aria-label="Search by tag">
              {tags.map((t) => (
                <button
                  key={t.id}
                  className="tag-chip"
                  style={tagStyle(t)}
                  aria-pressed={q
                    .toLowerCase()
                    .split(/\s+/)
                    .includes(`#${tagWord(t)}`.toLowerCase())}
                  onClick={() => toggleTag(tagWord(t))}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {searching ? (
            <p className="none" role="status">
              Searching…
            </p>
          ) : (
            shown && !options.length && <p className="none">Nothing matches “{shown.query}”.</p>
          )}
          {bulk && (
            <div className="act-all">
              <button className="ghost" aria-expanded={actingOn === 'all'} onClick={() => act('all')}>
                <ListChecks size={15} /> Act on all matches
              </button>
              {actingOn === 'all' && <SearchActions key={bulk} query={bulk} onDone={() => (setOpen(false), setActing(null))} />}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.options[0]!.id} role="group" aria-label={g.title}>
              <h3 className={bulk && g.docId ? 'with-actions' : undefined}>
                <span>{g.title}</span>
                {bulk && g.docId && (
                  <button
                    className="icon"
                    aria-label={`Act on the matches in ${g.title}`}
                    title="Highlight, tag, excerpt or link every match in this document"
                    aria-expanded={actingOn === g.docId}
                    onClick={() => act(g.docId!)}
                  >
                    <ListChecks size={15} />
                  </button>
                )}
              </h3>
              {bulk && g.docId && actingOn === g.docId && <SearchActions key={bulk} query={bulk} docId={g.docId} onDone={() => (setOpen(false), setActing(null))} />}
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
