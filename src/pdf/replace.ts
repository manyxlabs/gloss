// Replacing a document with a newer version of it. Every mark moves from the old text to the same
// words in the new one, found by its own words and the words around it, so it survives inserted
// paragraphs, edited sentences and pages that flow differently. Handwriting, figures, squeezes
// and bookmarks follow the words nearest them.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Input } from '../convert';
import { addFiles, deleteVersion, fileKey } from '../store/db';
import { openProtected, switchVersion, uid, useStore } from '../store/project';
import type { Highlight, Ink, Part, Point, Project, Rect } from '../types';
import { cleanText, mergeLines } from './anchor';
import { before as earlier } from './folds';
import { rewrite } from './pages';
import { loadDoc, pageWords } from './pdfjs';

type Box = { page: number; rect: Rect };
/** A word of a document, folded for comparing (lower case, letters and digits), with where it is; a word hyphenated across lines has a box on each. */
export type Word = { t: string; raw: string; boxes: Box[] };

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Every word of a document in reading order, with its box in page fractions. */
export async function wordsOf(doc: PDFDocumentProxy): Promise<Word[]> {
  const out: Word[] = [];
  // A word ending in a hyphen at the end of a line may go on at the start of the next.
  let broken: Word | null = null;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    for (const w of await pageWords(page)) {
      const box: Box = { page: n, rect: w.box.map(round) as Rect };
      const t = fold(w.text);
      if (broken && /^\p{Ll}/u.test(w.text)) {
        broken.t += t;
        broken.raw = broken.raw.slice(0, -1) + w.text;
        broken.boxes.push(box);
        broken = null;
        continue;
      }
      broken = null;
      if (!t) continue;
      const word = { t, raw: w.text, boxes: [box] };
      out.push(word);
      if (w.eol && /\p{L}-$/u.test(w.text)) broken = word;
    }
    page.cleanup();
  }
  return out;
}

const centre = (b: Box) => [b.rect[0] + b.rect[2] / 2, b.rect[1] + b.rect[3] / 2] as const;

/** The longest run of tokens the two lists share in order, as pairs of their indices. */
function align(a: number[], b: number[]): [number, number][] {
  const w = b.length + 1;
  const dp = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) i++;
    else j++;
  }
  return pairs;
}

/** How much of `a` appears, in order, in `b`; nothing to compare counts as half. */
const likeness = (a: number[], b: number[]) => (a.length ? align(a, b).length / a.length : 0.5);

const CONTEXT = 8;
/** Candidate places tried for each passage, fewer for long ones as each costs more. */
const CANDIDATES = 24;
/** Words this common in the new text do not suggest places on their own. */
const COMMON = 60;

type Hint = { page: number; y: number };
/** Where a run of old words is found in the new text: pairs of query and new word indices, and how well it matched. */
type Found = { pairs: [number, number][]; score: number };

/** The new document's text, indexed to find runs of words from the old one. */
class Finder {
  private vocab = new Map<string, number>();
  private index = new Map<number, number[]>();
  readonly ids: number[];

  constructor(readonly words: Word[]) {
    this.ids = words.map((w) => this.id(w.t));
    this.ids.forEach((id, j) => (this.index.get(id) ?? this.index.set(id, []).get(id)!).push(j));
  }

  id(t: string) {
    let id = this.vocab.get(t);
    if (id === undefined) this.vocab.set(t, (id = this.vocab.size));
    return id;
  }

  /**
   * The best place for a run of words with the words before and after it: each word votes for
   * where the run would start, the likeliest starts are aligned word by word, allowing for words
   * added, dropped or changed, and the surrounding words and the old page break ties.
   */
  find(query: number[], before: number[], after: number[], hint?: Hint): Found | null {
    const L = query.length;
    if (!L) return null;
    const votes = new Map<number, number>();
    const vote = (id: number, offset: number, weight: number) => {
      const at = this.index.get(id) ?? [];
      if (at.length > COMMON && L > 2) return;
      for (const j of at) votes.set(j - offset, (votes.get(j - offset) ?? 0) + weight);
    };
    query.forEach((id, i) => vote(id, i, 1));
    before.forEach((id, i) => vote(id, i - before.length, 0.5));
    after.forEach((id, i) => vote(id, L + i, 0.5));
    const slack = Math.max(3, Math.ceil(L / 2));
    const tried: number[] = [];
    for (const [start] of [...votes].sort((x, y) => y[1] - x[1])) {
      if (tried.length >= Math.max(3, CANDIDATES - Math.floor(L / 20))) break;
      if (!tried.some((s) => Math.abs(s - start) <= slack)) tried.push(start);
    }

    let best: (Found & { m: number; context: number }) | null = null;
    for (const start of tried) {
      const from = Math.max(0, start - slack);
      const window = this.ids.slice(from, start + L + slack);
      const pairs = align(query, window).map(([i, j]) => [i, j + from] as [number, number]);
      if (!pairs.length) continue;
      const [first, last] = [pairs[0]![1], pairs.at(-1)![1]];
      const m = pairs.length;
      // A run spread far wider than the passage is scattered words, not the passage.
      if (last - first + 1 > L * 1.6 + 3) continue;
      const context = (likeness(before, this.ids.slice(Math.max(0, first - CONTEXT), first)) + likeness(after, this.ids.slice(last + 1, last + 1 + CONTEXT))) / 2;
      const box = this.words[first]!.boxes[0]!;
      const away = hint ? 0.03 * Math.min(10, Math.abs(box.page - hint.page)) + (box.page === hint.page ? 0.02 * Math.abs(centre(box)[1] - hint.y) : 0) : 0;
      const score = m / L + 0.25 * context - away;
      if (!best || score > best.score) best = { pairs, score, m, context };
    }
    if (!best) return null;
    const q = best.m / L;
    const unique = (this.index.get(query[0]!)?.length ?? 0) === 1;
    const enough = L >= 4 ? q >= 0.6 : L >= 2 ? q === 1 || (L === 3 && best.m === 2 && best.context >= 0.5) : best.context >= 0.4 || unique;
    return enough ? best : null;
  }
}

const tokens = (finder: Finder, text: string) =>
  cleanText(text)
    .split(' ')
    .map(fold)
    .filter(Boolean)
    .map((t) => finder.id(t));

/** Where each of a document's marks goes in its new version, and what could not be placed. */
export type Placement = {
  highlights: Map<string, Highlight>;
  unplaced: Highlight[];
  /** Figures and handwriting with no words near them, kept at the same place on the same page. */
  byPage: number;
  /** Squeezes whose ends could not both be found, opened. */
  opened: number;
  /** Moves a spot on an old page to the new document, or keeps it on the same page when no words are near. */
  spot: (page: number, x: number, y: number) => { page: number; x: number; y: number; byWords: boolean };
};

/** Works out where everything on a document goes in its new version, from the words of both. */
export function place(p: Project, docId: string, old: Word[], next: Word[], pages: number): Placement {
  const finder = new Finder(next);
  const oldIds = old.map((w) => finder.id(w.t));
  const onPage = new Map<number, number[]>();
  old.forEach((w, i) => (onPage.get(w.boxes[0]!.page) ?? onPage.set(w.boxes[0]!.page, []).get(w.boxes[0]!.page)!).push(i));
  const around = (first: number, last: number) => [oldIds.slice(Math.max(0, first - CONTEXT), first), oldIds.slice(last + 1, last + 1 + CONTEXT)] as const;

  const spot: Placement['spot'] = (page, x, y) => {
    const near = onPage.get(page) ?? [];
    let i = -1;
    let d = Infinity;
    for (const k of near) {
      const [cx, cy] = centre(old[k]!.boxes[0]!);
      // Lines matter more than columns: the nearest line, then the nearest word on it.
      const dk = Math.hypot(cx - x, (cy - y) * 3);
      if (dk < d) [i, d] = [k, dk];
    }
    if (i >= 0) {
      const [lo, hi] = [Math.max(0, i - 4), Math.min(old.length, i + 5)];
      const [pre, post] = around(lo, hi - 1);
      const found = finder.find(oldIds.slice(lo, hi), pre, post, { page, y });
      const pair = found?.pairs.reduce((a, b) => (Math.abs(b[0] + lo - i) < Math.abs(a[0] + lo - i) ? b : a));
      if (pair) {
        const [ox, oy] = centre(old[pair[0] + lo]!.boxes[0]!);
        const box = next[pair[1]]!.boxes[0]!;
        const [nx, ny] = centre(box);
        return { page: box.page, x: clamp(x + nx - ox), y: clamp(y + ny - oy), byWords: true };
      }
    }
    return { page: Math.min(page, pages), x, y, byWords: false };
  };

  const highlights = new Map<string, Highlight>();
  const unplaced: Highlight[] = [];
  let byPage = 0;
  for (const h of p.highlights.filter((x) => x.docId === docId)) {
    const first = h.parts[0];
    if (h.area) {
      if (!first) continue;
      // A figure keeps its size and moves with the words nearest it.
      const [x, y, w, hgt] = first.rects[0]!;
      const to = spot(first.page, x + w / 2, y + hgt / 2);
      if (!to.byWords) byPage++;
      const rect = [clamp(to.x - w / 2), clamp(to.y - hgt / 2), w, hgt].map(round) as Rect;
      highlights.set(h.id, { ...h, parts: [{ page: to.page, rects: [rect] }] });
      continue;
    }
    const query = tokens(finder, h.text);
    // Its own words on the old pages give the words around it, for context.
    const inside = h.parts
      .flatMap((part) =>
        (onPage.get(part.page) ?? []).filter((i) =>
          part.rects.some(([x, y, rw, rh]) => {
            const [cx, cy] = centre(old[i]!.boxes[0]!);
            return cx >= x && cx <= x + rw && cy >= y && cy <= y + rh;
          }),
        ),
      )
      .sort((a, b) => a - b);
    const [pre, post] = inside.length ? around(inside[0]!, inside.at(-1)!) : [[], []];
    const hint = first && { page: first.page, y: first.rects[0]?.[1] ?? 0 };
    const found = finder.find(query, pre, post, hint);
    if (!found) {
      unplaced.push(h);
      continue;
    }
    const words = next.slice(found.pairs[0]![1], found.pairs.at(-1)![1] + 1);
    const byPart = new Map<number, Rect[]>();
    for (const b of words.flatMap((w) => w.boxes)) byPart.set(b.page, [...(byPart.get(b.page) ?? []), b.rect]);
    const parts: Part[] = [...byPart].sort(([a], [b]) => a - b).map(([page, rects]) => ({ page, rects: mergeLines(rects) }));
    highlights.set(h.id, { ...h, parts, text: cleanText(words.map((w) => w.raw).join(' ')) });
  }
  for (const i of p.inks.filter((x) => x.docId === docId)) {
    const xs = i.points.map((pt) => pt[0]);
    const ys = i.points.map((pt) => pt[1]);
    if (!spot(i.page, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2).byWords) byPage++;
  }
  const opened = p.folds.filter((f) => {
    if (f.docId !== docId) return false;
    const [a, b] = [spot(f.from.page, 0.5, f.from.y), spot(f.to.page, 0.5, f.to.y)];
    return !a.byWords || !b.byWords || !earlier({ page: a.page, y: a.y }, { page: b.page, y: b.y });
  }).length;
  return { highlights, unplaced, byPage, opened, spot };
}

/** Everything on the document moved to its new version; what was added since the placement was worked out is unplaced. */
function remapped(p: Project, docId: string, placed: Placement): Partial<Project> {
  const ink = (i: Ink): Ink => {
    const xs = i.points.map((pt) => pt[0]);
    const ys = i.points.map((pt) => pt[1]);
    const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const to = placed.spot(i.page, cx, cy);
    return { ...i, page: to.page, points: i.points.map(([x, y, pr]): Point => [clamp(round(x + to.x - cx)), clamp(round(y + to.y - cy)), pr]) };
  };
  return {
    highlights: p.highlights.map((h) => (h.docId !== docId ? h : (placed.highlights.get(h.id) ?? { ...h, parts: [] }))),
    inks: p.inks.map((i) => (i.docId === docId ? ink(i) : i)),
    folds: p.folds.flatMap((f) => {
      if (f.docId !== docId) return [f];
      const [a, b] = [placed.spot(f.from.page, 0.5, f.from.y), placed.spot(f.to.page, 0.5, f.to.y)];
      const [from, to] = [
        { page: a.page, y: round(a.y) },
        { page: b.page, y: round(b.y) },
      ];
      return a.byWords && b.byWords && earlier(from, to) ? [{ ...f, from, to }] : [];
    }),
    bookmarks: p.bookmarks.map((b) => {
      if (b.docId !== docId) return b;
      const to = placed.spot(b.page, 0.5, b.y);
      return { ...b, page: to.page, y: round(to.y) };
    }),
  };
}

export type Replaced = { problems: string[]; placed: number; unplaced: Highlight[]; byPage: number; opened: number } | { problems: string[] };

/**
 * Replaces a document's file with a newer version, keeping its marks, as one step to undo. The new
 * file is stored as a version of the document, as a page edit is, so other devices fetch it.
 */
export async function replaceDoc(docId: string, input: Input): Promise<Replaced> {
  const name = useStore.getState().project?.docs.find((d) => d.id === docId)?.name;
  if (!name) return { problems: [] };
  const { convert } = await import('../convert');
  const { converted, problems } = await convert([input]);
  const data = converted[0]?.data;
  if (!data) return { problems };
  const opened = await openProtected(data, 'name' in input ? input.name : name).catch(() => undefined);
  if (opened === null) return { problems };
  if (!opened) return { problems: [...problems, 'The new version could not be read as a PDF.'] };
  let done: Replaced = { problems };
  // In turn with page edits, as each starts from the version the last one made.
  const failed = await rewrite('The document could not be replaced.', async () => {
    const doc = useStore.getState().project?.docs.find((d) => d.id === docId);
    if (!doc) return [];
    const [old, next] = await Promise.all([loadDoc(docId, doc.password).then(wordsOf), wordsOf(opened.doc)]);
    const pages = opened.doc.numPages;
    const placed = place(useStore.getState().project!, docId, old, next, pages);
    const file = uid();
    const key = fileKey({ id: docId, file });
    await addFiles([[key, data]]);
    const { password } = opened;
    const switched = switchVersion(docId, doc.file, { file, pages, size: data.size }, (p) => ({
      ...remapped(p, docId, placed),
      docs: p.docs.map((d) => {
        if (d.id !== docId) return d;
        const { password: _, ...rest } = d;
        return password === undefined ? rest : { ...rest, password };
      }),
    }));
    if (!switched) {
      await deleteVersion(key);
      return ['The document changed while it was being replaced. Try again.'];
    }
    const text = [...placed.highlights.values()].filter((h) => !h.area);
    done = { problems, placed: text.length, unplaced: placed.unplaced, byPage: placed.byPage, opened: placed.opened };
    return [];
  }).finally(() => opened.close());
  return { ...done, problems: [...done.problems, ...failed] };
}
