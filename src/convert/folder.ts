import { kindOf } from './formats';

/** A file from a folder, with the folders it is in, from the one dropped or chosen down. */
export type FolderFile = { file: File; path: string[] };

const hidden = (name: string) => name.startsWith('.');
const readBatch = (reader: FileSystemDirectoryReader) => new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));

async function walk(entry: FileSystemEntry, path: string[]): Promise<FolderFile[]> {
  if (hidden(entry.name)) return [];
  if (entry.isFile) return [{ file: await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail)), path }];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  // A read gives only the next batch, at most 100 in Chrome, until one comes back empty.
  for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) entries.push(...batch);
  return (await Promise.all(entries.map((e) => walk(e, [...path, entry.name])))).flat();
}

/** Everything dropped, from inside its folders too; null when no folder was dropped. Called during the drop, as the browser empties it afterwards. */
export function droppedFolder(data: DataTransfer): Promise<FolderFile[]> | null {
  const entries = [...data.items].flatMap((i) => i.webkitGetAsEntry() ?? []);
  return entries.some((e) => e.isDirectory) ? Promise.all(entries.map((e) => walk(e, []))).then((all) => all.flat()) : null;
}

/** Files chosen with a folder picker, which names each by its path from the folder chosen. */
export const chosenFolder = (files: File[]): FolderFile[] =>
  files.map((file) => ({ file, path: file.webkitRelativePath.split('/').slice(0, -1) })).filter((f) => !f.path.some(hidden) && !hidden(f.file.name));

const where = (f: FolderFile) => [...f.path, f.file.name].join('/');
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** The files Gloss opens, a folder's own before those of the folders inside it, and a problem naming the others. */
export function openable(all: FolderFile[]) {
  const files = all.filter((f) => kindOf(f.file)).sort((a, b) => byName(a.path.join('/'), b.path.join('/')) || byName(a.file.name, b.file.name));
  const skipped = all.filter((f) => !kindOf(f.file)).map(where);
  const list = skipped.slice(0, 10).join(', ') + (skipped.length > 10 ? ` and ${skipped.length - 10} more` : '');
  const problems = skipped.length ? [`Not added, as Gloss cannot open ${skipped.length === 1 ? 'it' : `these ${skipped.length}`}: ${list}.`] : [];
  return { files, problems: all.length ? problems : ['The folder is empty.'] };
}

/** Files grouped by a key, in the order the groups first appear. */
export function groupBy(files: FolderFile[], key: (f: FolderFile) => string) {
  const groups = new Map<string, FolderFile[]>();
  for (const f of files) {
    const k = key(f);
    const group = groups.get(k);
    if (group) group.push(f);
    else groups.set(k, [f]);
  }
  return groups;
}
