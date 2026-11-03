import { PANES, showCard, showPage, showSource, useStore } from '../store/project';
import { privateIds } from './privacy';
import { adopt, useScreen, type Jump, type Presence } from './state';

// A person's screens on one project follow each other's jumps: each shares its last jump in its
// presence, which the room relays encrypted like the rest of it.

type State = ReturnType<typeof useStore.getState>;

let following = false;
/** Each linked screen's last jump, by its peer number, as this screen last saw it. */
const seen = new Map<number, number>();
export const forgetScreen = (peer?: number) => (peer === undefined ? seen.clear() : seen.delete(peer));

/** The jump a change to the store makes, for the other screens: not one this screen is following, nor one into something kept on this device. */
export function hop(s: State, prev: State): Jump | undefined {
  if (following || !useScreen.getState().group || !s.project) return;
  const at = Date.now();
  let jump: Jump | undefined;
  if (s.jump && s.jump !== prev.jump) {
    const j = s.jump;
    const docId = s[PANES[j.pane]];
    if ('highlightId' in j) jump = { at, highlightId: j.highlightId };
    else if (docId) jump = { at, docId, page: j.page, y: j.y, dest: j.dest, query: j.query };
  } else if (s.focus && s.focus !== prev.focus) jump = { at, cardId: s.focus.cardId };
  if (!jump) return;
  return privateIds(s.project).has('highlightId' in jump ? jump.highlightId : 'cardId' in jump ? jump.cardId : jump.docId) ? undefined : jump;
}

/** Follows a jump on another of this person's screens. */
export function follow(peer: number, p: Presence) {
  const group = useScreen.getState().group;
  if (!group || p.screen !== group) return;
  adopt(p);
  const last = seen.get(peer);
  const j = p.jump;
  seen.set(peer, j?.at ?? 0);
  // A screen's last jump comes again with its presence as this screen connects, and is not taken then.
  if (last === undefined || !j || j.at === last) return;
  following = true;
  try {
    if ('highlightId' in j) showSource(j.highlightId);
    else if ('cardId' in j) showCard(j.cardId);
    else if (useStore.getState().project?.docs.some((d) => d.id === j.docId)) showPage(j.docId, j.page, { y: j.y, dest: j.dest, query: j.query });
  } finally {
    following = false;
  }
}
