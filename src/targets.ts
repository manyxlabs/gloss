import { quoted } from './links';
import { cardText } from './search';
import type { Project } from './types';

/** What a copied link leads to: a passage, a card, a comment, a canvas, a document or a bookmark. */
export const KINDS = { h: 'passage', c: 'card', m: 'comment', v: 'canvas', d: 'document', b: 'bookmark' } as const;
export type Kind = keyof typeof KINDS;
export type Target = { kind: Kind; id: string };

/**
 * A link to something in a project. A project kept on one device is named by its id; a shared one
 * by its room, which every device that has it knows, so the link works for the others too. The key
 * is not in it: only someone who has the project can follow it.
 */
export type GlossLink = Target & ({ project: string } | { room: string });

const PATH = /#\/(p|s)\/([\w-]+)\/([hcmvdb])\/([\w-]+)/;
/** Links in text, from any copy of Gloss: the address before the `#` may be another host's. */
export const IN_TEXT = /\bhttps?:\/\/[^\s#]+#\/[ps]\/[\w-]+\/[hcmvdb]\/[\w-]+/g;

export const hashOf = (l: GlossLink) => `#/${'room' in l ? `s/${l.room}` : `p/${l.project}`}/${l.kind}/${l.id}`;
export const linkTo = (p: Pick<Project, 'id' | 'sync'>, t: Target) =>
  `${location.origin}${location.pathname}${hashOf(p.sync ? { ...t, room: p.sync.room } : { ...t, project: p.id })}`;

export function parseLink(text: string): GlossLink | null {
  const m = PATH.exec(text);
  if (!m) return null;
  const target = { kind: m[3] as Kind, id: m[4]! };
  return m[1] === 'p' ? { ...target, project: m[2]! } : { ...target, room: m[2]! };
}

/** Whether a link is to something in this project, by its id or its room. */
export const isIn = (p: Pick<Project, 'id' | 'sync'>, l: GlossLink) => ('room' in l ? p.sync?.room === l.room : p.id === l.project);

/** A few words that say what a link leads to, or null when it is not in the project any more. */
export function snippetOf(p: Project, { kind, id }: Target): string | null {
  const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 69).trimEnd()}…` : s);
  if (kind === 'h') {
    const h = p.highlights.find((x) => x.id === id);
    return h ? clip(quoted(h) || 'Figure') : null;
  }
  if (kind === 'c') {
    const c = p.cards.find((x) => x.id === id);
    return c ? clip(cardText(p, c) || (c.data.kind === 'sketch' ? 'Ink box' : 'Handwriting')) : null;
  }
  if (kind === 'm') {
    const c = p.comments.find((x) => x.id === id);
    return c ? clip(c.text) : null;
  }
  if (kind === 'v') return p.canvases.find((x) => x.id === id)?.name ?? null;
  if (kind === 'b') return p.bookmarks.find((x) => x.id === id)?.name ?? null;
  return p.docs.find((x) => x.id === id)?.name ?? null;
}
