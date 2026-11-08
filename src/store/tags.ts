import { create } from 'zustand';
import { cardTags } from '../tags';
import type { Card, Color, Highlight, Project, Tag } from '../types';
import { edit, useStore } from './project';
import { uid } from '../id';

/**
 * The tags the reader is filtering by, on the canvas and in the sidebar's highlights alike: what
 * carries any of them is shown, the rest is dimmed or left out. `managing` opens the tags manager.
 */
export const useTagView = create<{ filter: string[]; managing: boolean }>(() => ({ filter: [], managing: false }));

export const toggleFilter = (id: string) => useTagView.setState(({ filter }) => ({ filter: filter.includes(id) ? filter.filter((f) => f !== id) : [...filter, id] }));
export const clearFilter = () => useTagView.setState({ filter: [] });
export const manageTags = (managing = true) => useTagView.setState({ managing });

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The tag with this name, made if there is none yet. */
export function tagNamed(name: string, category?: string): Tag | undefined {
  const p = useStore.getState().project;
  const clean = name.trim().replace(/^#/, '');
  if (!p || !clean) return;
  const found = p.tags.find((t) => same(t.name, clean));
  if (found) return found;
  const tag: Tag = { id: uid(), name: clean, ...(category?.trim() ? { category: category.trim() } : {}) };
  edit((q) => ({ tags: [...q.tags, tag] }));
  return tag;
}

const changeTag = (id: string, change: (t: Tag) => Tag) => edit((p) => ({ tags: p.tags.map((t) => (t.id === id ? change(t) : t)) }));

/** False when another tag has the name already: merging is a separate, deliberate step. */
export function renameTag(id: string, name: string) {
  const p = useStore.getState().project;
  const clean = name.trim().replace(/^#/, '');
  if (!p || !clean || p.tags.some((t) => t.id !== id && same(t.name, clean))) return false;
  changeTag(id, (t) => ({ ...t, name: clean }));
  return true;
}

export const recolorTag = (id: string, color: Color | undefined) => changeTag(id, ({ color: _, ...t }) => (color ? { ...t, color } : t));

export const setCategory = (id: string, category: string | undefined) => changeTag(id, ({ category: _, ...t }) => (category?.trim() ? { ...t, category: category.trim() } : t));

/** Renames a category on every tag in it; to an existing category's name, the two become one. */
export const renameCategory = (from: string, to: string) => to.trim() && edit((p) => ({ tags: p.tags.map((t) => (t.category === from ? { ...t, category: to.trim() } : t)) }));

/** Takes a category away; its tags are kept, without one. */
export const removeCategory = (name: string) => edit((p) => ({ tags: p.tags.map((t) => (t.category === name ? (({ category: _, ...rest }) => rest)(t) : t)) }));

/** Rewrites the tag ids on every passage and card; `map` returns the ids to put in place of one. */
function retag(p: Project, map: (id: string) => string[]): Pick<Project, 'highlights' | 'cards'> {
  const fix = (ids: string[] | undefined) => {
    if (!ids?.length) return ids;
    const next = [...new Set(ids.flatMap(map))];
    return next.length === ids.length && next.every((id, i) => id === ids[i]) ? ids : next;
  };
  const highlights = p.highlights.map((h) => {
    const tags = fix(h.tags);
    if (tags === h.tags) return h;
    const { tags: _, ...rest } = h;
    return tags?.length ? { ...rest, tags } : rest;
  });
  const cards = p.cards.map((c) => {
    const tags = fix(c.data.tags);
    if (tags === c.data.tags) return c;
    const { tags: _, ...data } = c.data;
    return { ...c, data: tags?.length ? { ...data, tags } : data } as Card;
  });
  return { highlights, cards };
}

/** Takes a tag off everything and out of the project. */
export function deleteTag(id: string) {
  edit((p) => ({ ...retag(p, (t) => (t === id ? [] : [t])), tags: p.tags.filter((t) => t.id !== id) }));
  useTagView.setState(({ filter }) => ({ filter: filter.filter((f) => f !== id) }));
}

/** Folds tags into one: whatever carried any of them carries `into`. */
export function mergeTags(from: string[], into: string) {
  const gone = new Set(from.filter((id) => id !== into));
  if (!gone.size) return;
  edit((p) => ({ ...retag(p, (t) => (gone.has(t) ? [into] : [t])), tags: p.tags.filter((t) => !gone.has(t.id)) }));
  useTagView.setState(({ filter }) => ({ filter: [...new Set(filter.map((f) => (gone.has(f) ? into : f)))] }));
}

/** What a tag goes on: passages, and cards, whose excerpts pass it to their passages. */
export type Tagged = { highlights?: string[]; cards?: string[] };

const withTag = (ids: string[] | undefined, tag: string, on: boolean) => (on ? [...new Set([...(ids ?? []), tag])] : (ids ?? []).filter((t) => t !== tag));

/** Puts a tag on, or takes it off, everything given, as one step. */
export function setTag({ highlights = [], cards = [] }: Tagged, tag: string, on: boolean, undoable = true) {
  edit((p) => {
    const hs = new Set(highlights);
    const own = new Set<string>();
    for (const c of p.cards.filter((c) => cards.includes(c.id))) {
      if (c.data.kind === 'excerpt') hs.add(c.data.highlightId);
      else own.add(c.id);
    }
    const put = <T extends { tags?: string[] }>(x: T): T => {
      const tags = withTag(x.tags, tag, on);
      const { tags: _, ...rest } = x;
      return (tags.length ? { ...rest, tags } : rest) as T;
    };
    return {
      highlights: p.highlights.map((h) => (hs.has(h.id) ? put<Highlight>(h) : h)),
      cards: p.cards.map((c) => (own.has(c.id) ? ({ ...c, data: put(c.data) } as Card) : c)),
    };
  }, undoable);
}

/** The tags on everything given: those all of it carries, and those only some does. */
export function tagState(p: Project, { highlights = [], cards = [] }: Tagged) {
  const sets = [...p.highlights.filter((h) => highlights.includes(h.id)).map((h) => h.tags ?? []), ...p.cards.filter((c) => cards.includes(c.id)).map((c) => cardTags(p, c))];
  const all = p.tags.filter((t) => sets.length && sets.every((s) => s.includes(t.id))).map((t) => t.id);
  const some = p.tags.filter((t) => sets.some((s) => s.includes(t.id)) && !all.includes(t.id)).map((t) => t.id);
  return { all, some };
}

// A filter or an open manager belongs to the project it was set in.
useStore.subscribe((s, prev) => s.project?.id !== prev.project?.id && useTagView.setState({ filter: [], managing: false }));
