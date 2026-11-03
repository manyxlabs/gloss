// Page tools: rotating, moving, deleting, duplicating and inserting pages. Each edit writes a new
// version of the document's file with pdf-lib and moves everything anchored to its pages to match.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import type { Input } from '../convert';
import { addFiles, deleteVersion, fileKey, getFile } from '../store/db';
import { switchVersion, uid, useStore, without } from '../store/project';
import type { DocMeta, Fold, Point, Project, Rect } from '../types';
import { openPdf } from './pdfjs';

/** A page of the edited document: one of its own, turned clockwise by a multiple of 90 degrees, or the nth page added from other files. */
export type Sheet = { page: number; turn: number } | { added: number };
/** The edited document's pages, from how many it has and how many were added. */
export type Plan = (pages: number, added: number) => Sheet[];

export const PROTECTED = 'Page tools need an unprotected copy of this PDF. Save a copy without the password, add that, and edit its pages there.';

const same = (n: number): Sheet[] => Array.from({ length: n }, (_, i) => ({ page: i + 1, turn: 0 }));
const has = (pages: number[], s: Sheet) => 'page' in s && pages.includes(s.page);

export const rotate =
  (pages: number[], turn: number): Plan =>
  (n) =>
    same(n).map((s) => (has(pages, s) ? { ...s, turn } : s));
export const remove =
  (pages: number[]): Plan =>
  (n) =>
    same(n).filter((s) => !has(pages, s));
/** Each page followed by its copy. */
export const duplicate =
  (pages: number[]): Plan =>
  (n) =>
    same(n).flatMap((s) => (has(pages, s) ? [s, s] : [s]));
/** The pages, in order, before page `before` of the others, or after them all past the last page. */
export const move =
  (pages: number[], before: number): Plan =>
  (n) => {
    const rest = same(n).filter((s) => !has(pages, s));
    const at = rest.findIndex((s) => 'page' in s && s.page >= before);
    const i = at < 0 ? rest.length : at;
    return [...rest.slice(0, i), ...pages.map((page) => ({ page, turn: 0 })), ...rest.slice(i)];
  };
/** Pages from other files after the first `at` pages. */
export const insert =
  (at: number): Plan =>
  (n, added) => {
    const s = same(n);
    return [...s.slice(0, at), ...Array.from({ length: added }, (_, i) => ({ added: i })), ...s.slice(at)];
  };

/** What deleting these pages would delete with them: highlights wholly on them, the excerpts and comments of those, and handwriting. */
export function anchoredOn(p: Project, docId: string, pages: number[]) {
  const highlights = p.highlights.filter((h) => h.docId === docId && h.parts.every((part) => pages.includes(part.page)));
  const ids = new Set(highlights.map((h) => h.id));
  return {
    highlights: highlights.length,
    // A comment shared with a passage elsewhere stays; only those left with no passage go.
    comments: new Set(highlights.flatMap((h) => (h.commentId && p.highlights.every((o) => o.commentId !== h.commentId || ids.has(o.id)) ? [h.commentId] : []))).size,
    excerpts: p.cards.filter((c) => c.data.kind === 'excerpt' && ids.has(c.data.highlightId)).length,
    inks: p.inks.filter((i) => i.docId === docId && pages.includes(i.page)).length,
  };
}

const quarter = (t: number) => (((Math.round(t / 90) * 90) % 360) + 360) % 360;
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** A box in page fractions, on its page turned clockwise. */
function turnRect([x, y, w, h]: Rect, turn: number): Rect {
  const r: Rect = turn === 90 ? [1 - y - h, x, h, w] : turn === 180 ? [1 - x - w, 1 - y - h, w, h] : turn === 270 ? [y, 1 - x - w, h, w] : [x, y, w, h];
  return r.map(round) as Rect;
}

/**
 * A text box on its page turned clockwise, given the page's width over its height: its words stay
 * upright, so it keeps its size on screen, about where it was on the page.
 */
function turnBox(r: Rect, turn: number, ratio: number): Rect {
  const [x, y, w, h] = turnRect(r, turn);
  if (!(turn % 180)) return [x, y, w, h];
  const [bw, bh] = [r[2] * ratio, r[3] / ratio];
  const fit = (v: number, size: number) => round(Math.min(Math.max(0, v), Math.max(0, 1 - size)));
  return [fit(x + w / 2 - bw / 2, bw), fit(y + h / 2 - bh / 2, bh), round(bw), round(bh)];
}

function turnPoint([x, y, pressure]: Point, turn: number): Point {
  const [a, b] = turn === 90 ? [1 - y, x] : turn === 180 ? [1 - x, 1 - y] : turn === 270 ? [y, 1 - x] : [x, y];
  return [round(a), round(b), pressure];
}

/**
 * Moves what is anchored to a document's pages to where the pages went. A page that appears more
 * than once keeps its marks on the first. Highlights left with no page are deleted with their
 * excerpts; a squeeze is kept only where it still hides the same pages, unturned.
 * `ratios` are the old pages' widths over their heights, as handwriting is sized by the width.
 */
export function remap(p: Project, docId: string, sheets: Sheet[], ratios: number[]): Partial<Project> {
  const to = new Map<number, { page: number; turn: number }>();
  sheets.forEach((s, i) => 'page' in s && !to.has(s.page) && to.set(s.page, { page: i + 1, turn: quarter(s.turn) }));

  const gone = new Set<string>();
  const highlights = p.highlights.map((h) => {
    if (h.docId !== docId) return h;
    const parts = h.parts
      .flatMap((part) => {
        const at = to.get(part.page);
        const ratio = ratios[part.page - 1] ?? 1;
        return at ? [{ page: at.page, rects: part.rects.map((r) => (h.typed ? turnBox(r, at.turn, ratio) : turnRect(r, at.turn))) }] : [];
      })
      .sort((a, b) => a.page - b.page);
    // An unplaced highlight had no page to lose.
    if (!parts.length && h.parts.length) gone.add(h.id);
    // A text box's letters are sized by the page's width, which a quarter turn changes.
    const first = h.parts[0];
    const turned = h.typed && first && (to.get(first.page)?.turn ?? 0) % 180;
    return { ...h, parts, ...(turned ? { typed: { size: round(h.typed!.size * (ratios[first.page - 1] ?? 1)) } } : {}) };
  });

  const inks = p.inks.flatMap((i) => {
    if (i.docId !== docId) return [i];
    const at = to.get(i.page);
    if (!at) return [];
    return [{ ...i, page: at.page, points: i.points.map((pt) => turnPoint(pt, at.turn)), size: at.turn % 180 ? i.size * (ratios[i.page - 1] ?? 1) : i.size }];
  });

  const keeps = (f: Fold) => {
    const a = to.get(f.from.page);
    const b = to.get(f.to.page);
    if (!a || !b) return false;
    for (let k = a.page; k <= b.page; k++) {
      const s = sheets[k - 1];
      if (!s || !('page' in s) || s.turn || s.page < f.from.page || s.page > f.to.page || to.get(s.page)?.page !== k) return false;
    }
    return a.page <= b.page;
  };
  const folds = p.folds.flatMap((f) =>
    f.docId !== docId ? [f] : keeps(f) ? [{ ...f, from: { ...f.from, page: to.get(f.from.page)!.page }, to: { ...f.to, page: to.get(f.to.page)!.page } }] : [],
  );

  const bookmarks = p.bookmarks.flatMap((b) => {
    if (b.docId !== docId) return [b];
    const at = to.get(b.page);
    return at ? [{ ...b, page: at.page, y: turnPoint([0, b.y, 0], at.turn)[1] }] : [];
  });

  const docs = p.docs.map((d) => (d.id === docId && d.lastPage ? { ...d, lastPage: to.get(d.lastPage)?.page ?? Math.min(d.lastPage, sheets.length) } : d));
  return { ...without({ ...p, highlights }, new Set(), gone), inks, folds, bookmarks, docs };
}

/** Deletes every object nothing in the document refers to any more, such as deleted pages, so the file shrinks with them. */
export function prune(pdf: PDFDocument) {
  const ctx = pdf.context;
  const reached = new Set<string>();
  const stack: (PDFObject | undefined)[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof PDFRef) {
      if (reached.has(o.tag)) continue;
      reached.add(o.tag);
      stack.push(ctx.lookup(o));
    } else if (o instanceof PDFDict) stack.push(...o.values());
    else if (o instanceof PDFArray) stack.push(...o.asArray());
    else if (o instanceof PDFStream) stack.push(o.dict);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!reached.has(ref.tag)) ctx.delete(ref);
}

const INHERITED = ['Resources', 'MediaBox', 'CropBox', 'Rotate'].map((n) => PDFName.of(n));

/**
 * The document with its pages as the sheets say. It is edited in place, so its contents, links,
 * forms and metadata stay: its page tree is laid flat in the new order, with what pages inherited
 * from the tree copied onto each page first.
 */
export function arrange(pdf: PDFDocument, sheets: Sheet[], added: PDFRef[]) {
  const ctx = pdf.context;
  const own = pdf.getPages();
  for (const { node } of own)
    for (const name of INHERITED) {
      const value = node.get(name) === undefined ? node.getInheritableAttribute(name) : undefined;
      if (value !== undefined) node.set(name, value);
    }
  const root = pdf.catalog.get(PDFName.of('Pages')) as PDFRef;
  const placed = new Set<number>();
  const kids = sheets.map((s) => {
    let ref: PDFRef;
    let node: PDFDict;
    if ('added' in s) {
      ref = added[s.added]!;
      node = ctx.lookup(ref, PDFDict);
    } else if (!placed.has(s.page)) {
      placed.add(s.page);
      ({ ref, node } = own[s.page - 1]!);
    } else {
      // A copy shares the page's content and resources; links and form fields belong to one page, so they stay with the first.
      node = own[s.page - 1]!.node.clone(ctx);
      node.delete(PDFName.of('Annots'));
      node.delete(PDFName.of('StructParents'));
      ref = ctx.register(node);
    }
    node.set(PDFName.of('Parent'), root);
    if ('turn' in s && s.turn) node.set(PDFName.of('Rotate'), PDFNumber.of(quarter((node.lookupMaybe(PDFName.of('Rotate'), PDFNumber)?.asNumber() ?? 0) + s.turn)));
    return ref;
  });
  const tree = ctx.lookup(root, PDFDict);
  tree.set(PDFName.of('Kids'), ctx.obj(kids));
  tree.set(PDFName.of('Count'), PDFNumber.of(kids.length));
}

const unchanged = (sheets: Sheet[], pages: number) => sheets.length === pages && sheets.every((s, i) => 'page' in s && s.page === i + 1 && !s.turn);

/** A document's current file, loaded to be rewritten, or why it cannot be: `locked` says so for a protected PDF. */
export async function editable(docId: string, locked: string): Promise<{ doc: DocMeta; pdf: PDFDocument } | string> {
  const doc = useStore.getState().project?.docs.find((d) => d.id === docId);
  if (!doc) return 'The document is no longer in this project.';
  if (doc.password) return locked;
  const blob = await getFile(fileKey(doc));
  if (!blob) return 'This PDF is missing from this browser’s storage.';
  const pdf = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
  // pdf-lib cannot decrypt, and what it wrote into a still encrypted file would be unreadable.
  return pdf.isEncrypted ? locked : { doc, pdf };
}

/**
 * Saves a rewritten file as a new version of the document and switches to it, moving what is
 * anchored to its pages with `remap`, as one step to undo. Returns a problem, or null.
 */
export async function saveVersion(doc: DocMeta, pdf: PDFDocument, remap: (p: Project) => Partial<Project>): Promise<string | null> {
  prune(pdf);
  const out = new Blob([(await pdf.save({ addDefaultPage: false, updateFieldAppearances: false })) as BlobPart], { type: 'application/pdf' });
  // Checked with the reader that will show it before anything switches to it.
  const check = await openPdf(out);
  const count = check.doc.numPages;
  await check.close();
  // pdf-lib's own page count is not updated when the page tree is rewritten in place.
  if (count !== pdf.catalog.Pages().Count().asNumber()) throw new Error('The rewritten PDF did not come out whole.');

  // Stored beside the current version, which stays until neither the project nor undo needs it.
  const file = uid();
  const key = fileKey({ id: doc.id, file });
  await addFiles([[key, out]]);
  if (switchVersion(doc.id, doc.file, { file, pages: count, size: out.size }, remap)) return null;
  await deleteVersion(key);
  return 'The document changed while it was being rewritten. Try again.';
}

async function apply(docId: string, plan: Plan, add: Input[]): Promise<string[]> {
  const open = await editable(docId, PROTECTED);
  if (typeof open === 'string') return [open];
  const { pdf } = open;

  const problems: string[] = [];
  const added: PDFRef[] = [];
  if (add.length) {
    const { convert } = await import('../convert');
    const { converted, problems: failed } = await convert(add);
    problems.push(...failed);
    for (const c of converted) {
      const other = await PDFDocument.load(await c.data.arrayBuffer(), { ignoreEncryption: true }).catch(() => null);
      if (!other) problems.push(`${c.name} could not be read as a PDF.`);
      else if (other.isEncrypted) problems.push(`${c.name} is password protected. Page tools need an unprotected copy.`);
      else added.push(...(await pdf.copyPages(other, other.getPageIndices())).map((page) => page.ref));
    }
    if (!added.length) return problems;
  }

  const own = pdf.getPages();
  const sheets = plan(own.length, added.length);
  if (!sheets.length) return ['A document needs at least one page.'];
  if (unchanged(sheets, own.length)) return problems;
  const ratios = own.map((page) => {
    const { width, height } = page.getCropBox();
    return page.getRotation().angle % 180 ? height / width : width / height;
  });
  arrange(pdf, sheets, added);
  const failed = await saveVersion(open.doc, pdf, (p) => remap(p, docId, sheets, ratios));
  return failed ? [...problems, failed] : problems;
}

let queue = Promise.resolve();

/**
 * Runs rewrites of documents' files one at a time, as each starts from the version the last one
 * made. Resolves with the problems to show, if any; `failure` begins the message for an error.
 */
export function rewrite(failure: string, edit: () => Promise<string[]>): Promise<string[]> {
  const run = queue.then(() =>
    edit().catch((err: unknown) => [
      `${failure} ${err instanceof Error && /^[A-Z].*\.$/.test(err.message) ? err.message : 'The PDF may be damaged, or in a form Gloss cannot rewrite.'}`,
    ]),
  );
  queue = run.then(() => {});
  return run;
}

/** Edits a document's pages. Resolves with the problems to show, if any. */
export const editPages = (docId: string, plan: Plan, add: Input[] = []) => rewrite('The pages could not be edited.', () => apply(docId, plan, add));
