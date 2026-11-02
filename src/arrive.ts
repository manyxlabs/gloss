/**
 * Where to go once a project opens, set by the start page's search before it opens the project:
 * a page of a document (with the words to find there), a card, or a passage.
 */
export type Arrival = { projectId: string } & ({ docId: string; page: number; query?: string } | { cardId: string } | { highlightId: string });

let pending: Arrival | null = null;

export const arriveAt = (a: Arrival) => void (pending = a);

/** The place to go in a project just opened, once. */
export function takeArrival(projectId: string) {
  const a = pending;
  pending = null;
  return a?.projectId === projectId ? a : null;
}
