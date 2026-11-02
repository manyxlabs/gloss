import { openDB, type DBSchema } from 'idb';
import type { DocMeta, Folder, Project } from '../types';

// Everything stays in this browser: projects as records, each PDF as its own blob so the
// project record stays small enough to rewrite on every edit.
interface Schema extends DBSchema {
  projects: { key: string; value: Project };
  files: { key: string; value: Blob };
  folders: { key: string; value: Folder };
}

const db = openDB<Schema>('gloss', 2, {
  async upgrade(d, from, _to, tx) {
    if (from < 1) {
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('files');
    }
    if (from < 2) {
      d.createObjectStore('folders', { keyPath: 'id' });
      // The library sorts by when a project was last opened; until then, its last edit stands in.
      for (let c = await tx.objectStore('projects').openCursor(); c; c = await c.continue()) if (!c.value.openedAt) await c.update({ ...c.value, openedAt: c.value.updatedAt });
    }
  },
});

/** Where a document's file is kept: under its id until its pages are edited, then under the id and each version. */
export const fileKey = (d: Pick<DocMeta, 'id' | 'file'>) => (d.file ? `${d.id}@${d.file}` : d.id);
const versionsOf = (docId: string) => IDBKeyRange.bound(`${docId}@`, `${docId}@￿`);

const lastOpened = (p: Project) => p.openedAt ?? p.updatedAt;
export const listProjects = async () => (await (await db).getAll('projects')).sort((a, b) => lastOpened(b) - lastOpened(a));
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

export const listFolders = async () => (await (await db).getAll('folders')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
export const putFolder = async (f: Folder) => void (await db).put('folders', f);

/** Files a project in a folder, or at the top level with null, leaving the rest of its record as it is. */
export async function moveProject(projectId: string, folder: string | null) {
  const tx = (await db).transaction('projects', 'readwrite');
  const p = await tx.store.get(projectId);
  if (p) {
    const { folder: _, ...rest } = p;
    await tx.store.put(folder ? { ...rest, folder } : rest);
  }
  await tx.done;
}

/** Deletes a folder; the projects in it move to the top level and are kept. */
export async function deleteFolder(id: string) {
  const tx = (await db).transaction(['projects', 'folders'], 'readwrite');
  for (let c = await tx.objectStore('projects').openCursor(); c; c = await c.continue())
    if (c.value.folder === id) {
      const { folder: _, ...rest } = c.value;
      await c.update(rest);
    }
  await Promise.all([tx.objectStore('folders').delete(id), tx.done]);
}
