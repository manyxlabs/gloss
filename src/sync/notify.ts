import type { Kind } from '../targets';
import type { Project } from '../types';
import type { Activity } from './state';

/** A change by someone else that concerns this person: a mention of them, or a reply to what they wrote. */
export type Notice = Activity & { why: 'mention' | 'reply' };

/** Where each kind of change leads, for those that lead somewhere. */
export const KIND_OF: Partial<Record<string, Kind>> = { highlights: 'h', cards: 'c', comments: 'm', canvases: 'v', docs: 'd' };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether some text mentions a name, as `@Name`, not as the start of a longer one. */
export const mentions = (text: string, name: string) => !!name.trim() && new RegExp(`@${escape(name.trim())}(?![\\p{L}\\p{N}_])`, 'iu').test(text);

/** What a comment or note says now. */
function textNow(p: Project, list: string, id: string) {
  if (list === 'comments') return p.comments.find((c) => c.id === id)?.text;
  const d = list === 'cards' ? p.cards.find((c) => c.id === id)?.data : undefined;
  return d?.kind === 'note' ? d.text : d?.kind === 'excerpt' ? d.comment : undefined;
}

/**
 * Mentions of this person in comments and notes, by whoever last changed them, and replies: someone
 * else changing a comment or note this person wrote, or commenting on a passage they marked.
 */
export function noticesFor(p: Project, activity: Activity[], me: string, name: string): Notice[] {
  const mine = new Set(activity.filter((a) => a.by === me && a.op === 'add').map((a) => `${a.list} ${a.id}`));
  return activity.flatMap((a): Notice[] => {
    if (a.by === me || a.op === 'remove' || (a.list !== 'comments' && a.list !== 'cards')) return [];
    const text = textNow(p, a.list, a.id);
    if (text === undefined) return [];
    if (mentions(text, name)) return [{ ...a, why: 'mention' }];
    const onMine = a.list === 'comments' && p.highlights.some((h) => h.commentId === a.id && mine.has(`highlights ${h.id}`));
    return mine.has(`${a.list} ${a.id}`) || onMine ? [{ ...a, why: 'reply' }] : [];
  });
}
