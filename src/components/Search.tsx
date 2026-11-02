import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { search, type CardHit, type DocHit } from '../search';
import { showCard, showMatch, useStore } from '../store/project';

export function Search() {
  const project = useStore((s) => s.project);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{
    query: string;
    docs: DocHit[];
    cards: CardHit[];
  } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !project) return;
    let stale = false;
    // Text is read from every PDF on the first search, so wait for typing to pause.
    const t = setTimeout(() => void search(project, q).then((r) => !stale && setResults({ query: q, ...r })), 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
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

  const docName = (id: string) => project?.docs.find((d) => d.id === id)?.name ?? '';
  const shown = query.trim().length >= 2 && results?.query === query.trim() ? results : null;

  return (
    <div className="search" ref={box}>
      <SearchIcon size={15} />
      <input
        ref={input}
        type="search"
        placeholder="Search"
        aria-label="Search documents and cards"
        value={query}
        onChange={(e) => (setQuery(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && (setOpen(false), input.current?.blur())}
      />
      {!query && <kbd>Ctrl K</kbd>}
      {open && shown && (
        <div className="results" role="listbox" aria-label="Search results">
          {!shown.docs.length && !shown.cards.length && <p className="none">Nothing matches “{shown.query}”.</p>}
          {shown.cards.length > 0 && <h3>On the canvas</h3>}
          {shown.cards.map((hit) => (
            <button key={hit.cardId} role="option" aria-selected={false} onClick={() => (setOpen(false), showCard(hit.cardId))}>
              <span className="snippet">{hit.text}</span>
            </button>
          ))}
          {project?.docs.map((doc) => {
            const hits = shown.docs.filter((h) => h.docId === doc.id);
            return (
              hits.length > 0 && (
                <div key={doc.id}>
                  <h3>{docName(doc.id)}</h3>
                  {hits.map((hit, i) => (
                    <button key={i} role="option" aria-selected={false} onClick={() => (setOpen(false), showMatch(doc.id, hit.page, shown.query))}>
                      <span className="page">p. {hit.page}</span>
                      <span className="snippet">
                        …{hit.before}
                        <mark>{hit.match}</mark>
                        {hit.after}…
                      </span>
                    </button>
                  ))}
                </div>
              )
            );
          })}
        </div>
      )}
    </div>
  );
}
