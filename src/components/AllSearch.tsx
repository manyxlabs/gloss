import { FileText, FolderOpen, MessageSquare, Search, StickyNote } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AllHit } from '../allSearch';
import { arriveAt } from '../arrive';

const ICONS = { project: FolderOpen, page: FileText, card: StickyNote, comment: MessageSquare } as const;

/** Opens a project at what was found in it. */
function open(hit: AllHit) {
  const projectId = hit.project.id;
  if (hit.kind === 'page') arriveAt({ projectId, docId: hit.docId, page: hit.page, query: hit.snippet?.match });
  else if (hit.kind === 'card') arriveAt({ projectId, cardId: hit.cardId });
  else if (hit.kind === 'comment') arriveAt({ projectId, highlightId: hit.highlightId });
  location.hash = `#/p/${projectId}`;
}

/**
 * Searches every project in this browser from the start page: names, the text of every document,
 * cards and comments. Documents are read once into an index of their own, which is said while it
 * happens, so later searches are quick.
 */
export function AllSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; hits: AllHit[] } | null>(null);
  const [indexing, setIndexing] = useState<[number, number] | null>(null);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let stale = false;
    const t = setTimeout(async () => {
      // Loaded on first use, as it brings pdf.js, which the start page otherwise does without.
      const { searchAll } = await import('../allSearch');
      const hits = await searchAll(q, (done, total) => !stale && setIndexing(done < total ? [done, total] : null));
      if (stale) return;
      setIndexing(null);
      setResults({ query: q, hits });
      setActive(-1);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const shown = q.length >= 2 && results?.query === q ? results.hits : null;
  const groups = shown ? [...new Set(shown.map((h) => h.project))].map((project) => ({ project, hits: shown.filter((h) => h.project === project) })) : [];
  const current = shown?.[active];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setQuery('');
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown?.length) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 && step < 0 ? shown.length - 1 : (a + step + shown.length) % shown.length));
    } else if (e.key === 'Enter' && shown?.length) {
      e.preventDefault();
      open(current ?? shown[0]!);
    }
  };

  return (
    <section className="all-search" aria-label="Search all projects">
      <div className="all-search-box glass">
        <Search size={17} />
        <input
          type="search"
          placeholder="Search all projects: names, documents, cards and comments"
          aria-label="Search all projects"
          aria-controls="all-results"
          aria-activedescendant={current ? current.id : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {q.length >= 2 && (
        <div className="all-results glass" id="all-results" role="listbox" aria-label="Results in all projects" aria-busy={!shown} ref={list}>
          {indexing ? (
            <p className="none" role="status">
              Reading documents for search, {indexing[0]} of {indexing[1]}. This happens once for each document.
            </p>
          ) : !shown ? (
            <p className="none" role="status">
              Searching…
            </p>
          ) : (
            !shown.length && <p className="none">Nothing in any project matches “{q}”.</p>
          )}
          {groups.map(({ project, hits }) => (
            <div key={project.id} role="group" aria-label={project.name}>
              <h3>{project.name}</h3>
              {hits.map((hit) => {
                const Icon = ICONS[hit.kind];
                return (
                  <button
                    key={hit.id}
                    id={hit.id}
                    role="option"
                    tabIndex={-1}
                    aria-selected={hit === current}
                    onClick={() => open(hit)}
                    onPointerMove={() => setActive(shown!.indexOf(hit))}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span className="snippet">
                      {hit.snippet ? (
                        <>
                          <span className="where">{hit.label}: </span>…{hit.snippet.before}
                          <mark>{hit.snippet.match}</mark>
                          {hit.snippet.after}…
                        </>
                      ) : (
                        hit.label
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
