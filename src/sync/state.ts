import { create } from 'zustand';

// What the interface shows of sync, apart from the engine (session.ts), which loads only for a shared project.

export const PALETTE = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3'];
export type Cursor = { canvasId: string; x: number; y: number };
export type Presence = { name: string; color: string; docId?: string; page?: number; cursor?: Cursor };
export type Status = 'offline' | 'syncing' | 'synced';

export const useSync = create<{ status: Status; peers: Record<number, Presence>; problem: string | null }>(() => ({ status: 'offline', peers: {}, problem: null }));

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
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
/** The name of someone who would rather not give one. */
export const GUEST = 'Guest';
/** How this person appears to the others in a shared project. */
export const useMe = create(() => ({ name: stored('gloss:name') ?? '', color: firstColor() }));
export const setName = (name: string) => {
  keep('gloss:name', name);
  useMe.setState({ name });
};

/** Presence comes from other devices, so only its expected shape is kept. */
export function asPresence(value: unknown): Presence | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const c = p.cursor as Record<string, unknown> | undefined;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  return {
    name: typeof p.name === 'string' ? p.name.slice(0, 40) : '',
    color: typeof p.color === 'string' && PALETTE.includes(p.color) ? p.color : PALETTE[0]!,
    ...(typeof p.docId === 'string' ? { docId: p.docId } : {}),
    ...(num(p.page) ? { page: p.page } : {}),
    ...(c && typeof c.canvasId === 'string' && num(c.x) && num(c.y) ? { cursor: { canvasId: c.canvasId, x: c.x, y: c.y } } : {}),
  };
}

/** Set by the running session: shares a change to this person's presence, such as their pointer. */
export const presence: { update: (p: Partial<Presence>) => void } = { update: () => {} };
