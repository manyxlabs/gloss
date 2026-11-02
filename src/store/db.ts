import { openDB, type DBSchema } from 'idb';
import type { Project } from '../types';

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

export const listProjects = async () => (await (await db).getAll('projects')).sort((a, b) => b.updatedAt - a.updatedAt);
export const getProject = async (id: string) => (await db).get('projects', id);
export const putProject = async (p: Project) => void (await db).put('projects', p);
export const getFile = async (docId: string) => (await db).get('files', docId);

export async function addFiles(files: [docId: string, blob: Blob][]) {
  const tx = (await db).transaction('files', 'readwrite');
  await Promise.all([...files.map(([id, blob]) => tx.store.put(blob, id)), tx.done]);
}

export async function deleteProject(p: Project) {
  const tx = (await db).transaction(['projects', 'files'], 'readwrite');
  await Promise.all([tx.objectStore('projects').delete(p.id), ...p.docs.map((d) => tx.objectStore('files').delete(d.id)), tx.done]);
}

export async function deleteFile(docId: string) {
  await (await db).delete('files', docId);
}
