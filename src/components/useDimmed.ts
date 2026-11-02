import { useStore } from '../store/project';
import { useTagView } from '../store/tags';
import { cardTags, passes } from '../tags';

/** Whether a card is dimmed by the tag filter: it, or for a group any card inside, must carry a chosen tag. */
export function useDimmed(cardId: string) {
  const filter = useTagView((s) => s.filter);
  return useStore((s) => {
    const p = s.project;
    if (!filter.length || !p) return false;
    return !p.cards.some((c) => (c.id === cardId || c.parentId === cardId) && passes(cardTags(p, c), filter));
  });
}
