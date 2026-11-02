import type * as Y from 'yjs';
import { quoted } from '../links';
import { cardText } from '../search';
import type { Project } from '../types';
import { PALETTE, PERSON, useActivity, useMe, type Activity, type Person } from './state';

// Who has been in a project and what they did, kept in the project's shared document beside it,
// so it travels encrypted like everything else and needs nothing new from the server.

/** Changes kept: a month of them, and no more than this many. */
const KEEP_MS = 30 * 24 * 3600_000;
const KEEP = 400;
/** The lists whose changes are worth telling the others about; moves, handwriting and squeezes are not. */
const TOLD = ['docs', 'highlights', 'cards', 'canvases', 'comments', 'passageLinks', 'cardLinks', 'links'] as const;
type Told = (typeof TOLD)[number];
type Entity = { id: string };

const people = (doc: Y.Doc) => doc.getMap<Person>('people');
const log = (doc: Y.Doc) => doc.getMap<Activity>('activity');

/** A few words for an entity in a project. */
function textOf(p: Project, list: Told, e: Entity): string {
  const clip = (s: string) => (s.length > 120 ? `${s.slice(0, 119)}…` : s);
  if (list === 'docs') return (e as Project['docs'][number]).name;
  if (list === 'highlights') return clip(quoted(e as Project['highlights'][number]));
  if (list === 'cards') return clip(cardText(p, e as Project['cards'][number]));
  if (list === 'canvases') return (e as Project['canvases'][number]).name;
  if (list === 'comments') return clip((e as Project['comments'][number]).text);
  return '';
}

/** What a card says, apart from where it is: a drag is not news. */
const content = (list: Told, e: Entity) => JSON.stringify(list === 'cards' ? (e as Project['cards'][number]).data : e);

/**
 * Notes what this person changed between two shareable versions of a project. Changes to one
 * thing by one person are one entry, so typing a note is not a hundred: the latest change, but
 * still "added" while it is new.
 */
export function record(doc: Y.Doc, prev: Record<Told, Entity[]>, next: Project) {
  const entries = log(doc);
  const now = Date.now();
  for (const list of TOLD) {
    if (prev[list] === next[list]) continue;
    const before = new Map<string, Entity>(prev[list].map((e) => [e.id, e]));
    const write = (e: Entity, op: Activity['op'], text: string) => {
      const key = `${PERSON} ${list} ${e.id}`;
      const was = entries.get(key);
      entries.set(key, { by: PERSON, at: now, list, id: e.id, op: was?.op === 'add' && op === 'edit' ? 'add' : op, text });
    };
    for (const e of next[list]) {
      const old = before.get(e.id);
      before.delete(e.id);
      if (!old) write(e, 'add', textOf(next, list, e));
      // A line between cards only changes as it is chosen, or re-routed.
      else if (old !== e && list !== 'links' && content(list, old) !== content(list, e)) write(e, 'edit', textOf(next, list, e));
    }
    for (const e of before.values()) write(e, 'remove', textOf(next, list, e));
  }
}

/** Writes how this person appears, for the others to mention. */
export function introduce(doc: Y.Doc) {
  const { name, color } = useMe.getState();
  const was = people(doc).get(PERSON);
  if (name && (was?.name !== name || was.color !== color)) people(doc).set(PERSON, { id: PERSON, name, color });
}

/** Drops entries older than a month, and the oldest past the limit. */
export function forget(doc: Y.Doc) {
  const entries = log(doc);
  const old = [...entries.entries()].sort(([, a], [, b]) => b.at - a.at).filter(([, e], i) => i >= KEEP || Date.now() - e.at > KEEP_MS);
  if (old.length) doc.transact(() => old.forEach(([key]) => entries.delete(key)));
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Shows the people and activity the shared document holds; what came from other devices is checked for its shape. */
export function publish(doc: Y.Doc) {
  const known: Person[] = [...people(doc).values()].flatMap((p) =>
    p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim()
      ? [{ id: p.id, name: str(p.name, 40), color: PALETTE.includes(p.color) ? p.color : PALETTE[0]! }]
      : [],
  );
  const activity: Activity[] = [...log(doc).values()]
    .flatMap((a) =>
      a && typeof a.by === 'string' && typeof a.id === 'string' && Number.isFinite(a.at) && ['add', 'edit', 'remove'].includes(a.op) && (TOLD as readonly string[]).includes(a.list)
        ? [{ by: a.by, at: a.at, list: a.list, id: a.id, op: a.op, text: str(a.text, 160) }]
        : [],
    )
    .sort((a, b) => b.at - a.at);
  useActivity.setState({ people: known, activity });
}
