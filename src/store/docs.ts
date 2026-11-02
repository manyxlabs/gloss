// Arranging a project's documents: pinned first, in an order of the reader's choosing, in folders.
import type { DocMeta, Project } from '../types';
import { edit, uid } from './project';

/** The documents as the tabs and the list show them: pinned first, then by rank, those without one keeping their place. */
export function orderedDocs(p: Pick<Project, 'docs'>) {
  const at = (d: DocMeta, i: number) => d.rank ?? i;
  return p.docs
    .map((d, i) => [d, at(d, i)] as const)
    .sort(([a, ra], [b, rb]) => Number(!!b.pinned) - Number(!!a.pinned) || ra - rb)
    .map(([d]) => d);
}

/** Where a document is put: in a folder (null for none), and pinned or not; what is left out stays as it is. */
export type Place = { folder?: string | null; pinned?: boolean };

/** A document put in a place, and nothing else changed. */
const placed = (d: DocMeta, { folder, pinned }: Place) => {
  const { folder: f, pinned: p, ...rest } = d;
  const inFolder = folder === undefined ? f : (folder ?? undefined);
  const isPinned = pinned === undefined ? p : pinned;
  return { ...rest, ...(inFolder ? { folder: inFolder } : {}), ...(isPinned ? { pinned: true } : {}) };
};

/** Moves a document before another, or to the end with null, into a place. Every document is ranked afresh, so the order is the same on every device. */
export function moveDoc(docId: string, beforeId: string | null, place: Place = {}) {
  edit((p) => {
    const order = orderedDocs(p).filter((d) => d.id !== docId);
    const moving = p.docs.find((d) => d.id === docId);
    if (!moving) return {};
    const at = beforeId === null ? order.length : order.findIndex((d) => d.id === beforeId);
    order.splice(at < 0 ? order.length : at, 0, moving);
    const rank = new Map(order.map((d, i) => [d.id, i]));
    return {
      docs: p.docs.map((d) => ({ ...(d.id === docId ? placed(d, place) : d), rank: rank.get(d.id)! })),
    };
  });
}

export const placeDoc = (docId: string, place: Place) => edit((p) => ({ docs: p.docs.map((d) => (d.id === docId ? placed(d, place) : d)) }));

export function addDocFolder(name: string) {
  const id = uid();
  edit((p) => ({ docFolders: [...p.docFolders, { id, name, rank: Math.max(0, ...p.docFolders.map((f) => f.rank + 1)) }] }));
  return id;
}

export const renameDocFolder = (id: string, name: string) => edit((p) => ({ docFolders: p.docFolders.map((f) => (f.id === id ? { ...f, name } : f)) }));

/** Deletes a folder; its documents stay, at the top. */
export const removeDocFolder = (id: string) =>
  edit((p) => ({
    docFolders: p.docFolders.filter((f) => f.id !== id),
    docs: p.docs.map((d) => (d.folder === id ? placed(d, { folder: null }) : d)),
  }));
