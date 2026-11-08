// Arranging a project's documents: pinned first, in an order of the reader's choosing, in folders.
import { groupBy, openable, type FolderFile } from '../convert/folder';
import { kindOf } from '../convert/formats';
import { m } from '../i18n';
import type { DocMeta, Project } from '../types';
import { withProgress } from './progress';
import { addImported, edit, importFiles } from './project';
import { uid } from '../id';

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

const nextRank = (p: Pick<Project, 'docFolders'>) => Math.max(0, ...p.docFolders.map((f) => f.rank + 1));

export function addDocFolder(name: string) {
  const id = uid();
  edit((p) => ({ docFolders: [...p.docFolders, { id, name, rank: nextRank(p) }] }));
  return id;
}

/**
 * Imports a folder's files into a project, each into the document folder its path names, made
 * where the project has none of that name. Files go in one at a time, so a large folder shows
 * its progress, except a folder's images, which become one PDF as images added together do.
 */
export async function importFolder(project: Project, files: FolderFile[], onProgress: (done: number) => void) {
  let next = project;
  let done = 0;
  const problems: string[] = [];
  for (const [name, group] of groupBy(files, (f) => f.path.join(' / '))) {
    let folder = name ? next.docFolders.find((f) => f.name === name) : undefined;
    if (name && !folder) {
      folder = { id: uid(), name, rank: nextRank(next) };
      next = { ...next, docFolders: [...next.docFolders, folder] };
    }
    const id = folder?.id;
    const images = group.filter((f) => kindOf(f.file) === 'image').map((f) => f.file);
    const batches = [...(images.length ? [images] : []), ...group.flatMap((f) => (kindOf(f.file) === 'image' ? [] : [[f.file]]))];
    for (const batch of batches) {
      const before = next.docs.length;
      const result = await importFiles(next, batch);
      problems.push(...result.problems);
      next = { ...result.project, docs: result.project.docs.map((d, i) => (id && i >= before ? { ...d, folder: id } : d)) };
      onProgress((done += batch.length));
    }
  }
  // A folder none of whose files could be added is not kept.
  const used = new Set(next.docs.map((d) => d.folder));
  return { project: { ...next, docFolders: next.docFolders.filter((f) => project.docFolders.includes(f) || used.has(f.id)) }, problems };
}

/** Adds what was dropped or chosen as a folder to the open project, in one step of undo. */
export async function addFolder(read: Promise<FolderFile[]>) {
  const { files, problems } = openable(await withProgress(m.library.findingFiles, () => read));
  return withProgress(m.library.addingFiles, async (step) => {
    step(0, files.length);
    return [...problems, ...(await addImported((p) => importFolder(p, files, (n) => step(n, files.length))))];
  });
}

export const renameDocFolder = (id: string, name: string) => edit((p) => ({ docFolders: p.docFolders.map((f) => (f.id === id ? { ...f, name } : f)) }));

/** Deletes a folder; its documents stay, at the top. */
export const removeDocFolder = (id: string) =>
  edit((p) => ({
    docFolders: p.docFolders.filter((f) => f.id !== id),
    docs: p.docs.map((d) => (d.folder === id ? placed(d, { folder: null }) : d)),
  }));
