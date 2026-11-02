import { openDB, type DBSchema } from 'idb';
import type { Project } from '../types';

// Everything stays in this browser: projects as records, each PDF as its own blob so the
// project record stays small enough to rewrite on every edit.
interface Schema extends DBSchema {
  projects: { key: string; value: Project };
  files: { key: string; value: Blob };
  /** Files of documents taken out of a project, by document id, with the project's id: kept while undo may bring them back. */
  trash: { key: string; value: string };
}

const db = openDB<Schema>('gloss', 2, {
  upgrade(d, from) {
    if (from < 1) {
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('files');
    }
    if (from < 2) d.createObjectStore('trash');
  },
});

export const listProjects = async () => (await (await db).getAll('projects')).sort((a, b) => b.updatedAt - a.updatedAt);
export const getProject = async (id: string) => (await db).get('projects', id);
export const putProject = async (p: Project) => void (await db).put('projects', p);
export const getFile = async (docId: string) => (await db).get('files', docId);

export async function addFiles(files: [docId: string, blob: Blob][]) {
  const tx = (await db).transaction('files', 'readwrite');
  await Promise.all([...files.map(([id, blob]) => tx.store.put(blob, id)), tx.done]);
}

export async function deleteProject(p: Project) {
  const tx = (await db).transaction(['projects', 'files', 'trash'], 'readwrite');
  const trash = tx.objectStore('trash');
  const trashed: string[] = [];
  for (let c = await trash.openCursor(); c; c = await c.continue()) if (c.value === p.id) trashed.push(c.key);
  await Promise.all([
    tx.objectStore('projects').delete(p.id),
    ...[...p.docs.map((d) => d.id), ...trashed].flatMap((id) => [tx.objectStore('files').delete(id), trash.delete(id)]),
    tx.done,
  ]);
}

export async function deleteFile(docId: string) {
  await (await db).delete('files', docId);
}

/** Keeps a removed document's file until the project's undo history is gone. */
export const trashFile = async (docId: string, projectId: string) => void (await db).put('trash', projectId, docId);

/** Deletes the files of documents a project no longer has; called while it has no undo history that could bring them back. */
export async function emptyTrash(p: Project) {
  const tx = (await db).transaction(['files', 'trash'], 'readwrite');
  const trash = tx.objectStore('trash');
  const ops: Promise<unknown>[] = [];
  for (let c = await trash.openCursor(); c; c = await c.continue()) {
    if (c.value !== p.id) continue;
    if (!p.docs.some((d) => d.id === c.key)) ops.push(tx.objectStore('files').delete(c.key));
    ops.push(c.delete());
  }
  await Promise.all([...ops, tx.done]);
}
