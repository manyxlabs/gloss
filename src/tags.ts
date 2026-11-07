import { locale } from './i18n';
import type { Card, Project, Tag } from './types';

/** A card's tags: an excerpt's are its passage's, so a passage and its card never disagree. */
export function cardTags(p: Pick<Project, 'highlights'>, c: Card) {
  const d = c.data;
  if (d.kind !== 'excerpt') return d.tags ?? [];
  return p.highlights.find((h) => h.id === d.highlightId)?.tags ?? [];
}

/** The tags named, as the project has them now, in the order of its list; ids of tags removed elsewhere are skipped. */
export const known = (p: Pick<Project, 'tags'>, ids: string[] | undefined) => (ids?.length ? p.tags.filter((t) => ids.includes(t.id)) : []);

export const passes = (ids: string[] | undefined, filter: string[]) => !filter.length || !!ids?.some((id) => filter.includes(id));

/** A tag's name as typed in search: spaces would end the term, so they become dashes. */
export const tagWord = (t: Tag) => t.name.trim().replace(/\s+/g, '-');

/** Tags by category, the uncategorised first, each in alphabetical order. */
export function byCategory(tags: Tag[]) {
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' }));
  const names = [...new Set(sorted.flatMap((t) => (t.category ? [t.category] : [])))].sort((a, b) => a.localeCompare(b, locale));
  return [
    ...(sorted.some((t) => !t.category) ? [{ category: undefined as string | undefined, tags: sorted.filter((t) => !t.category) }] : []),
    ...names.map((category) => ({ category: category as string | undefined, tags: sorted.filter((t) => t.category === category) })),
  ];
}
