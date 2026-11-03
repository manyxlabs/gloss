import { create } from 'zustand';

// What the interface shows of sync, apart from the engine (session.ts), which loads only for a shared project.

export const PALETTE = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3'];
export type Cursor = { canvasId: string; x: number; y: number };
/** A jump on one screen, for this person's other screens to follow; `at` tells one jump from the next. */
export type Jump = { at: number } & ({ highlightId: string } | { cardId: string } | { docId: string; page: number; y?: number; dest?: unknown[]; query?: string });
/** `screen` is the group of screens a device is one of, and `jump` its last jump, for the others in the group. */
export type Presence = { name: string; color: string; docId?: string; page?: number; cursor?: Cursor; screen?: string; jump?: Jump };
export type Status = 'offline' | 'syncing' | 'synced';

export const useSync = create<{ status: Status; peers: Record<number, Presence>; problem: string | null }>(() => ({ status: 'offline', peers: {}, problem: null }));

type Area = 'localStorage' | 'sessionStorage';
const stored = (key: string, area: Area = 'localStorage') => {
  try {
    return globalThis[area].getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string, area: Area = 'localStorage') => {
  try {
    globalThis[area].setItem(key, value);
  } catch {
    // Storage can be blocked; the value then lasts for this visit.
  }
};
const firstColor = () => {
  const saved = stored('gloss:color');
  if (saved && PALETTE.includes(saved)) return saved;
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
  keep('gloss:color', color);
  return color;
};
/** Who this person is in every shared project, kept on this device: names can change, and two people can share one. */
export const PERSON = (() => {
  const saved = stored('gloss:person');
  if (saved) return saved;
  const id = crypto.randomUUID();
  keep('gloss:person', id);
  return id;
})();

/** Someone who has been in a shared project, as their device last wrote it. */
export type Person = { id: string; name: string; color: string };
/** Who added, changed or removed what, and when; `text` is a few words of it. */
export type Activity = { by: string; at: number; list: string; id: string; op: 'add' | 'edit' | 'remove'; text: string };
/** The open shared project's people and recent activity, as its shared document has them. */
export const useActivity = create<{ people: Person[]; activity: Activity[] }>(() => ({ people: [], activity: [] }));

/** The name of someone who would rather not give one. */
export const GUEST = 'Guest';
/** How this person appears to the others in a shared project. */
export const useMe = create(() => ({ name: stored('gloss:name') ?? '', color: firstColor() }));
export const setName = (name: string) => {
  keep('gloss:name', name);
  useMe.setState({ name });
};

/** A linked screen is the same person: one with no name yet takes theirs. */
export function adopt({ name, color }: Presence) {
  if (useMe.getState().name || !name) return;
  keep('gloss:color', color);
  useMe.setState({ color });
  setName(name);
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown): x is string => typeof x === 'string';
function asJump(value: unknown): Jump | undefined {
  const j = value as Record<string, unknown> | undefined;
  if (!j || !num(j.at)) return undefined;
  if (str(j.highlightId)) return { at: j.at, highlightId: j.highlightId };
  if (str(j.cardId)) return { at: j.at, cardId: j.cardId };
  if (!str(j.docId) || !num(j.page)) return undefined;
  return { at: j.at, docId: j.docId, page: j.page, y: num(j.y) ? j.y : undefined, dest: Array.isArray(j.dest) ? j.dest : undefined, query: str(j.query) ? j.query : undefined };
}

/** Presence comes from other devices, so only its expected shape is kept. */
export function asPresence(value: unknown): Presence | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const c = p.cursor as Record<string, unknown> | undefined;
  const jump = asJump(p.jump);
  return {
    name: typeof p.name === 'string' ? p.name.slice(0, 40) : '',
    color: typeof p.color === 'string' && PALETTE.includes(p.color) ? p.color : PALETTE[0]!,
    ...(typeof p.docId === 'string' ? { docId: p.docId } : {}),
    ...(num(p.page) ? { page: p.page } : {}),
    ...(c && typeof c.canvasId === 'string' && num(c.x) && num(c.y) ? { cursor: { canvasId: c.canvasId, x: c.x, y: c.y } } : {}),
    ...(str(p.screen) ? { screen: p.screen } : {}),
    ...(jump ? { jump } : {}),
  };
}

/** What a screen shows: everything, the documents, the canvas, or one document pane. */
export type Show = 'both' | 'doc' | 'canvas' | 0 | 1 | 2;
const SHOWS: Show[] = ['both', 'doc', 'canvas', 0, 1, 2];
const GROUP = (projectId: string) => `gloss:screens:${projectId}`;
const SHOW = (projectId: string) => `gloss:show:${projectId}`;

/**
 * This window as one of a person's screens on the open project: the group of screens it is linked
 * with, kept on this device, so every window here is one of them, and what it shows, kept for this
 * window alone.
 */
export const useScreen = create(() => ({ group: null as string | null, show: 'both' as Show }));
export const openScreen = (projectId: string) =>
  useScreen.setState({ group: stored(GROUP(projectId)), show: SHOWS.find((s) => String(s) === stored(SHOW(projectId), 'sessionStorage')) ?? 'both' });
export function setShow(projectId: string, show: Show) {
  keep(SHOW(projectId), String(show), 'sessionStorage');
  useScreen.setState({ show });
}
/** Links this device's screens on a project, as a group the link to another screen names. */
export function joinScreens(projectId: string, group: string) {
  keep(GROUP(projectId), group);
  useScreen.setState({ group });
}

const linkedTo = (peers: Record<number, Presence>, group: string | null) => (group ? Object.values(peers).filter((p) => p.screen === group).length : 0);
/** How many of this person's other screens are connected now. */
export const useLinked = () => {
  const group = useScreen((s) => s.group);
  return useSync((s) => linkedTo(s.peers, group));
};
/** What this screen shows: its choice while another screen is linked, and everything while it is alone, so nothing is out of reach. */
export const shownNow = (show: Show, linked: number): Show => (linked ? show : 'both');
export const screenShown = () => shownNow(useScreen.getState().show, linkedTo(useSync.getState().peers, useScreen.getState().group));

/** Set by the running session: shares a change to this person's presence, such as their pointer. */
export const presence: { update: (p: Partial<Presence>) => void } = { update: () => {} };
