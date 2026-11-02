import { canvasOf } from './store/project';
import type { Card, Link, Project } from './types';

/**
 * What a canvas shows: its cards, with those in a collapsed group hidden, and its links, with a
 * link to a hidden card ending on its group instead.
 */
export function canvasView(project: Project, canvasId: string): [Card[], Link[]] {
  const onCanvas = project.cards.filter((c) => canvasOf(project, c) === canvasId);
  const ids = new Set(onCanvas.map((c) => c.id));
  const folded = new Set(onCanvas.filter((c) => c.data.kind === 'group' && c.data.collapsed).map((c) => c.id));
  // Older projects asked React Flow to grow a group under a dragged card, which kept it from ever leaving; groups are fitted after a drag instead.
  const shown = onCanvas.map((c) => (c.parentId && folded.has(c.parentId) ? { ...c, hidden: true } : c.expandParent ? { ...c, expandParent: false } : c));
  const parentOf = new Map(shown.filter((c) => c.hidden).map((c) => [c.id, c.parentId!]));
  const seen = new Set<string>();
  const links = project.links.flatMap((l) => {
    if (!ids.has(l.source) || !ids.has(l.target)) return [];
    const source = parentOf.get(l.source) ?? l.source;
    const target = parentOf.get(l.target) ?? l.target;
    const key = [source, target].sort().join(' ');
    if (source === target || seen.has(key)) return [];
    seen.add(key);
    return [source === l.source && target === l.target ? l : { ...l, source, target, deletable: false, selectable: false }];
  });
  return [shown, links];
}
