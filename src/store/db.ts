import { openDB, type DBSchema } from 'idb';
import type { DocMeta, Project } from '../types';

// Everything stays in this browser: projects as records, each PDF as its own blob so the
// project record stays small enough to rewrite on every edit.
interface Schema extends DBSchema {
  projects: { key: string; value: Project };
  files: { key: string; value: Blob };
}

const db = openDB<Schema>('gloss', 1, {
  upgrade(d) {
    d.createObjectStore('projects', { keyPath: 'id' });
    d.createObjectStore('files');
  },
});

/** Where a document's file is kept: under its id until its pages are edited, then under the id and each version. */
export const fileKey = (d: Pick<DocMeta, 'id' | 'file'>) => (d.file ? `${d.id}@${d.file}` : d.id);
const versionsOf = (docId: string) => IDBKeyRange.bound(`${docId}@`, `${docId}@￿`);

export const listProjects = async () => (await (await db).getAll('projects')).sort((a, b) => b.updatedAt - a.updatedAt);
export const getProject = async (id: string) => (await db).get('projects', id);
export const putProject = async (p: Project) => void (await db).put('projects', p);
export const getFile = async (key: string) => (await db).get('files', key);

export async function addFiles(files: [key: string, blob: Blob][]) {
  const tx = (await db).transaction('files', 'readwrite');
  await Promise.all([...files.map(([key, blob]) => tx.store.put(blob, key)), tx.done]);
}

export async function deleteProject(p: Project) {
  const tx = (await db).transaction(['projects', 'files'], 'readwrite');
  const files = tx.objectStore('files');
  await Promise.all([tx.objectStore('projects').delete(p.id), ...p.docs.flatMap((d) => [files.delete(d.id), files.delete(versionsOf(d.id))]), tx.done]);
}

/** Deletes a document's file with every version of it. */
export async function deleteFile(docId: string) {
  const tx = (await db).transaction('files', 'readwrite');
  await Promise.all([tx.store.delete(docId), tx.store.delete(versionsOf(docId)), tx.done]);
}

/** Deletes one version of a document's file. */
export const deleteVersion = async (key: string) => (await db).delete('files', key);

/** Deletes the versions of a document's file other than its current one: those left when the page closed before undo let go of them. */
export async function dropOldVersions(doc: DocMeta) {
  const tx = (await db).transaction('files', 'readwrite');
  const keys = [...(await tx.store.getAllKeys(versionsOf(doc.id))), ...(doc.file ? [doc.id] : [])].filter((k) => k !== fileKey(doc));
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}
