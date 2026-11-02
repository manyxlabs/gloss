import { strFromU8, strToU8, unzip, zip, type Unzipped } from 'fflate';
import { addFiles, fileKey, getFile, listProjects, putProject } from './store/db';
import type { Project } from './types';

const FORMAT = 'gloss-backup';
const VERSION = 1;

/**
 * One file holding a project and its documents, to keep a copy or move it to another browser:
 * a zip with the project record and each PDF.
 */
export async function backupOf(project: Project): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const doc of project.docs) {
    const blob = await getFile(fileKey(doc));
    if (!blob) throw new Error(`“${doc.name}” is missing from this browser’s storage, so it cannot be backed up.`);
    files[`files/${doc.id}.pdf`] = new Uint8Array(await blob.arrayBuffer());
  }
  files['gloss.json'] = strToU8(JSON.stringify({ format: FORMAT, version: VERSION, project }));
  // PDFs are compressed already; storing them as they are keeps backing up fast.
  const bytes = await new Promise<Uint8Array>((ok, fail) => zip(files, { level: 0 }, (err, out) => (err ? fail(err) : ok(out))));
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

export const isBackup = (file: File) => /\.gloss$/i.test(file.name);

export class BackupError extends Error {}

/**
 * Adds the project in a backup as a new project. Its ids are all new, so restoring the same
 * backup twice, or next to the project it came from, never makes two projects share a file.
 * Before doing either, `again` is asked, with the project already here and whether it is the
 * original; null when it says no.
 */
export async function restore(file: File, again: (name: string, original: boolean) => boolean): Promise<Project | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Unzipped>((ok, fail) => unzip(bytes, (err, out) => (err ? fail(new BackupError(`${file.name} is not a Gloss backup.`)) : ok(out))));
  const manifest = entries['gloss.json'];
  let parsed: { format?: string; version?: number; project?: Project };
  try {
    parsed = manifest ? JSON.parse(strFromU8(manifest)) : {};
  } catch {
    parsed = {};
  }
  const old = parsed.project;
  if (parsed.format !== FORMAT || !old || !Array.isArray(old.docs)) throw new BackupError(`${file.name} is not a Gloss backup.`);
  if ((parsed.version ?? 0) > VERSION) throw new BackupError(`${file.name} was made by a newer version of Gloss. Reload the page to update, then try again.`);
  const from = `${old.id}@${old.updatedAt}`;
  const here = await listProjects();
  const copy = here.find((p) => p.restoredFrom === from);
  const original = here.find((p) => p.id === old.id);
  if (copy ? !again(copy.name, false) : original && !again(original.name, true)) return null;

  const ids = new Map(old.docs.map((d) => [d.id, crypto.randomUUID()]));
  const blobs: [string, Blob][] = old.docs.map((d) => {
    const bytes = entries[`files/${d.id}.pdf`];
    if (!bytes) throw new BackupError(`${file.name} is missing “${d.name}”.`);
    return [ids.get(d.id)!, new Blob([bytes as BlobPart], { type: 'application/pdf' })];
  });
  const doc = (id: string) => ids.get(id) ?? id;
  // A backup is a copy for this browser alone: any sharing it had stays with the original, and it starts at the top of the library.
  const { sync, folder, ...rest } = old;
  const project: Project = {
    ...rest,
    id: crypto.randomUUID(),
    restoredFrom: from,
    updatedAt: Date.now(),
    openedAt: Date.now(),
    // Each file is stored under its new id, whatever version of it was backed up.
    docs: old.docs.map(({ file, ...d }) => ({ ...d, id: doc(d.id) })),
    highlights: (old.highlights ?? []).map((h) => ({ ...h, docId: doc(h.docId) })),
    inks: (old.inks ?? []).map((i) => ({ ...i, docId: doc(i.docId) })),
    bookmarks: (old.bookmarks ?? []).map((b) => ({ ...b, docId: doc(b.docId) })),
    docFolders: old.docFolders ?? [],
    folds: (old.folds ?? []).map((f) => ({ ...f, docId: doc(f.docId) })),
    cards: old.cards ?? [],
    links: old.links ?? [],
    tags: old.tags ?? [],
    canvases: old.canvases ?? [{ id: 'main', name: 'Canvas' }],
  };
  await addFiles(blobs);
  await putProject(project);
  return project;
}
