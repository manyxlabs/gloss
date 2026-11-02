import { strFromU8, strToU8, unzip, zip, type Unzipped } from 'fflate';
import { addFiles, getFile, putProject } from './store/db';
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
    const blob = await getFile(doc.id);
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
 */
export async function restore(file: File): Promise<Project> {
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

  const ids = new Map(old.docs.map((d) => [d.id, crypto.randomUUID()]));
  const blobs: [string, Blob][] = old.docs.map((d) => {
    const bytes = entries[`files/${d.id}.pdf`];
    if (!bytes) throw new BackupError(`${file.name} is missing “${d.name}”.`);
    return [ids.get(d.id)!, new Blob([bytes as BlobPart], { type: 'application/pdf' })];
  });
  const doc = (id: string) => ids.get(id) ?? id;
  // A backup is a copy for this browser alone: any sharing it had stays with the original.
  const { sync, ...rest } = old as Project & { sync?: unknown };
  const project: Project = {
    ...rest,
    id: crypto.randomUUID(),
    updatedAt: Date.now(),
    docs: old.docs.map((d) => ({ ...d, id: doc(d.id) })),
    highlights: (old.highlights ?? []).map((h) => ({ ...h, docId: doc(h.docId) })),
    inks: (old.inks ?? []).map((i) => ({ ...i, docId: doc(i.docId) })),
    folds: (old.folds ?? []).map((f) => ({ ...f, docId: doc(f.docId) })),
    cards: old.cards ?? [],
    links: old.links ?? [],
    canvases: old.canvases ?? [{ id: 'main', name: 'Canvas' }],
  };
  await addFiles(blobs);
  await putProject(project);
  return project;
}
