import { before } from '../pdf/folds';
import type { Bookmark, Project } from '../types';
import { edit } from './project';
import { uid } from '../id';

/** A document's bookmarks in the reader's order. */
export const bookmarksOf = (p: Pick<Project, 'bookmarks'>, docId: string) => p.bookmarks.filter((b) => b.docId === docId).sort((a, b) => a.rank - b.rank);

/** The document's bookmarks ranked afresh in the order given. */
const ranked = (p: Project, order: Bookmark[]) => {
  const rank = new Map(order.map((b, i) => [b.id, i]));
  return p.bookmarks.map((b) => (rank.has(b.id) ? { ...b, rank: rank.get(b.id)! } : b));
};

/** Bookmarks a place, listed before the first bookmark that comes after it in the document. */
export function addBookmark(docId: string, page: number, y: number, name: string) {
  const bookmark: Bookmark = { id: uid(), docId, page, y, name, rank: 0 };
  edit((p) => {
    const order = bookmarksOf(p, docId);
    const at = order.findIndex((b) => before(bookmark, b));
    order.splice(at < 0 ? order.length : at, 0, bookmark);
    return { bookmarks: ranked({ ...p, bookmarks: [...p.bookmarks, bookmark] }, order) };
  });
  return bookmark;
}

export const renameBookmark = (id: string, name: string) => edit((p) => ({ bookmarks: p.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)) }));
export const removeBookmark = (id: string) => edit((p) => ({ bookmarks: p.bookmarks.filter((b) => b.id !== id) }));

/** Moves a bookmark before another of its document's, or to the end with null. */
export function moveBookmark(id: string, beforeId: string | null) {
  edit((p) => {
    const moving = p.bookmarks.find((b) => b.id === id);
    if (!moving) return {};
    const order = bookmarksOf(p, moving.docId).filter((b) => b.id !== id);
    const at = beforeId === null ? -1 : order.findIndex((b) => b.id === beforeId);
    order.splice(at < 0 ? order.length : at, 0, moving);
    return { bookmarks: ranked(p, order) };
  });
}
