import { Check, Minus, Plus, Settings2, Tags as TagsIcon, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useStore } from '../store/project';
import { clearFilter, manageTags, tagNamed, toggleFilter, useTagView } from '../store/tags';
import { byCategory, known } from '../tags';
import type { Tag } from '../types';
import { Menu } from './Menu';

const NONE: Tag[] = [];

/** A tag's colour, for its dot and chip; uncoloured tags take the theme's border colour. */
export const tagStyle = (t: Tag) => ({ '--tag': t.color ? `var(--hl-${t.color})` : 'var(--border)' }) as CSSProperties;

/** The tags on a passage or card, by name. */
export function TagChips({ ids, className = '' }: { ids: string[] | undefined; className?: string }) {
  const all = useStore((s) => s.project?.tags);
  const tags = known({ tags: all ?? [] }, ids);
  if (!tags.length) return null;
  return (
    // Spans, as chips also sit inside buttons, which may hold only phrasing content.
    <span className={`tag-chips ${className}`} role="list" aria-label="Tags">
      {tags.map((t) => (
        <span key={t.id} role="listitem" className="tag-chip" style={tagStyle(t)}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

/**
 * Puts tags on or takes them off: a field that finds a tag or makes one, and the tags in their
 * categories. `on` are on everything being tagged, `some` on only part of it. `onToggle`'s `fresh`
 * says the tag was just made, so putting it on can join that step.
 */
export function TagPicker({
  on,
  some = [],
  onToggle,
  onClose,
}: {
  on: string[];
  some?: string[];
  onToggle: (id: string, on: boolean, fresh: boolean) => void;
  onClose: () => void;
}) {
  const tags = useStore((s) => s.project?.tags ?? NONE);
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // After any menu around it has focused its first item.
  useEffect(() => field.current?.focus({ preventScroll: true }), []);

  const q = query.trim().replace(/^#/, '').toLowerCase();
  const shown = tags.filter((t) => !q || t.name.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q));
  const exact = tags.find((t) => t.name.toLowerCase() === q);
  const make = () => {
    const tag = tagNamed(query);
    if (tag) onToggle(tag.id, true, true);
    setQuery('');
  };
  const toggle = (t: Tag) => onToggle(t.id, !on.includes(t.id), false);

  const step = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return onClose();
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [field.current!, ...list.current!.querySelectorAll<HTMLElement>('button')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className="tag-picker" role="group" aria-label="Tags" onKeyDown={step}>
      <input
        ref={field}
        aria-label="Find or make a tag"
        placeholder="Find or make a tag"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !q) return;
          e.preventDefault();
          if (exact) {
            toggle(exact);
            setQuery('');
          } else make();
        }}
      />
      <div className="tag-list" ref={list}>
        {q && !exact && (
          <button className="make" onClick={make}>
            <Plus size={15} /> Make tag “{query.trim().replace(/^#/, '')}”
          </button>
        )}
        {byCategory(shown).map((g) => (
          <div key={g.category ?? ''} role="group" aria-label={g.category ?? 'Tags'}>
            {g.category && <h4>{g.category}</h4>}
            {g.tags.map((t) => {
              const state = on.includes(t.id) ? true : some.includes(t.id) ? 'mixed' : false;
              return (
                <button key={t.id} role="menuitemcheckbox" aria-checked={state} onClick={() => toggle(t)}>
                  <span className="tag-dot" style={tagStyle(t)} />
                  <span className="tag-name">{t.name}</span>
                  {state === true ? <Check size={15} /> : state === 'mixed' ? <Minus size={15} /> : null}
                </button>
              );
            })}
          </div>
        ))}
        {!tags.length && !q && <p className="tag-none">No tags yet. Type a name to make one.</p>}
      </div>
      <footer>
        <button className="ghost" onClick={() => (onClose(), manageTags())}>
          <Settings2 size={15} /> Manage tags
        </button>
        <button className="ghost" onClick={onClose}>
          Done
        </button>
      </footer>
    </div>
  );
}

/** The tags on what is being written about, with a button that opens the picker below them. */
export function TagRow({ on, onToggle }: { on: string[]; onToggle: (id: string, on: boolean, fresh: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tag-row-edit">
      <div className="line">
        <TagChips ids={on} />
        <button type="button" className="ghost add-tag" aria-expanded={open} onClick={() => setOpen(!open)}>
          <TagsIcon size={15} /> {on.length ? 'Tags' : 'Add tags'}
        </button>
      </div>
      {open && <TagPicker on={on} onToggle={onToggle} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Shows only what carries the tags chosen: dims the rest of the canvas and leaves it out of the sidebar's highlights. */
export function TagFilter() {
  const tags = useStore((s) => s.project?.tags ?? NONE);
  const filter = useTagView((s) => s.filter);
  const [button, setButton] = useState<HTMLElement | null>(null);
  const active = known({ tags }, filter);
  return (
    <>
      <button
        className={`tag-filter${active.length ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={!!button}
        aria-label={active.length ? `Filtered by ${active.map((t) => t.name).join(', ')}` : 'Filter by tag'}
        title="Filter by tag"
        onClick={(e) => setButton(button ? null : e.currentTarget)}
      >
        <TagsIcon size={16} />
        <span className="label">{active.length ? active.map((t) => t.name).join(', ') : 'Tags'}</span>
      </button>
      {active.length > 0 && (
        <button className="icon clear-filter" aria-label="Clear the tag filter" title="Clear the tag filter" onClick={clearFilter}>
          <X size={15} />
        </button>
      )}
      {button && (
        <Menu anchor={button} label="Filter by tag" onClose={() => setButton(null)}>
          {byCategory(tags).map((g) => (
            <div key={g.category ?? ''} className="menu-group" role="group" aria-label={g.category ?? 'Tags'}>
              {g.category && <h4>{g.category}</h4>}
              {g.tags.map((t) => (
                <button key={t.id} role="menuitemcheckbox" aria-checked={filter.includes(t.id)} onClick={() => toggleFilter(t.id)}>
                  <span className="tag-dot" style={tagStyle(t)} /> {t.name}
                </button>
              ))}
            </div>
          ))}
          {!tags.length && <p className="tag-none">No tags yet. Tag a passage or a card from its toolbar.</p>}
          <hr />
          {filter.length > 0 && (
            <button role="menuitem" onClick={() => (clearFilter(), setButton(null))}>
              <X size={16} /> Show everything
            </button>
          )}
          <button role="menuitem" onClick={() => (setButton(null), manageTags())}>
            <Settings2 size={16} /> Manage tags…
          </button>
        </Menu>
      )}
    </>
  );
}
