import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api';
import type { Rect } from '../types';
import { mergeLines } from './anchor';
import { loadDoc, runShare } from './pdfjs';

/** A match of a search in a document, as a highlight would hold it: page fractions, a box per line. */
export type Match = { page: number; rects: Rect[]; text: string };

/** Typed text as search compares it: spaces collapsed and lower case. */
export const normalise = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

type Page = { items: TextItem[]; styles: Record<string, TextStyle>; toPage: (x: number, y: number) => [number, number] };

async function readPage(page: PDFPageProxy): Promise<Page> {
  const viewport = page.getViewport({ scale: 1 });
  const { items, styles } = await page.getTextContent();
  return {
    items: items.filter((i): i is TextItem => 'str' in i),
    styles,
    toPage: (x, y) => {
      const [vx, vy] = viewport.convertToViewportPoint(x, y) as [number, number];
      return [vx / viewport.width, vy / viewport.height];
    },
  };
}

/** The box of characters `from` to `to` of a run, as page fractions, from its baseline, direction and font's ascent and descent. */
function boxOf({ items, styles, toPage }: Page, index: number, from: number, to: number): Rect {
  const item = items[index]!;
  const [a, b, c, d, e, f] = item.transform as number[];
  const style = styles[item.fontName];
  const size = Math.hypot(c!, d!) || Math.hypot(a!, b!) || 1;
  const along = Math.hypot(a!, b!) || 1;
  const [ux, uy] = [a! / along, b! / along];
  // Up the page, at right angles to the text.
  const [vx, vy] = [-uy, ux];
  // Padded to the height a selection of the same words has, which is the line box the browser draws.
  const ascent = (style?.ascent || 0.8) + 0.12;
  const descent = (style?.descent || -0.2) - 0.12;
  const [s0, s1] = [runShare(item.str, from, style?.fontFamily) * item.width, runShare(item.str, to, style?.fontFamily) * item.width];
  const corners = [
    [s0, descent],
    [s1, descent],
    [s0, ascent],
    [s1, ascent],
  ].map(([s, h]) => toPage(e! + ux * s! + vx * h! * size, f! + uy * s! + vy * h! * size));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  return [round(Math.min(...xs)), round(Math.min(...ys)), round(Math.max(...xs) - Math.min(...xs)), round(Math.max(...ys) - Math.min(...ys))];
}

/**
 * The page's text as search reads it, with where each character came from: runs joined, a space
 * at each line's end, spaces collapsed and in lower case. `at` holds each character's run and
 * offset in it, or -1 for a space put in at a line's end.
 */
function textOf(items: TextItem[]) {
  let text = '';
  const at: [number, number][] = [];
  const push = (ch: string, where: [number, number]) => {
    if (/\s/.test(ch)) {
      if (!text || text.endsWith(' ')) return;
      ch = ' ';
    }
    for (const lower of ch.toLowerCase()) {
      text += lower;
      at.push(where);
    }
  };
  items.forEach((item, i) => {
    [...item.str].forEach((ch, k) => push(ch, [i, k]));
    if (item.hasEOL) push(' ', [-1, -1]);
  });
  return { text, at };
}

/** A match's boxes: each run it covers gives the part of it matched, and runs on one line become one box. */
function boxesOf(page: Page, at: [number, number][], start: number, end: number) {
  const runs = new Map<number, [number, number]>();
  for (const [i, k] of at.slice(start, end)) {
    if (i < 0) continue;
    const [from, to] = runs.get(i) ?? [k, k];
    runs.set(i, [Math.min(from, k), Math.max(to, k)]);
  }
  // Offsets count UTF-16 units, as `slice` does; a character outside the BMP spans two.
  return mergeLines(
    [...runs].map(([i, [from, to]]) => {
      const str = page.items[i]!.str;
      const units = (n: number) => [...str].slice(0, n).join('').length;
      return boxOf(page, i, units(from), units(to + 1));
    }),
  );
}

/** Every match of `query` in a document, in page order, up to `limit`. */
export async function findMatches(docId: string, password: string | undefined, query: string, limit = 1000): Promise<Match[]> {
  const q = normalise(query);
  if (!q) return [];
  const doc = await loadDoc(docId, password);
  const out: Match[] = [];
  for (let n = 1; n <= doc.numPages && out.length < limit; n++) {
    const pdfPage = await doc.getPage(n);
    const page = await readPage(pdfPage);
    const { text, at } = textOf(page.items);
    for (let i = text.indexOf(q); i >= 0 && out.length < limit; i = text.indexOf(q, i + q.length)) {
      const rects = boxesOf(page, at, i, i + q.length);
      // The words as the document has them, with their capitals.
      const words = at
        .slice(i, i + q.length)
        .map(([r, k], j) => (r < 0 ? ' ' : ([...page.items[r]!.str][k] ?? text[i + j])))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (rects.length) out.push({ page: n, rects, text: words });
    }
  }
  return out;
}

/** The lines of text on a page, top to bottom, as page-fraction spans [top, bottom], for squeezing around passages with lines of context. */
export async function pageLines(docId: string, password: string | undefined, pageNo: number): Promise<[number, number][]> {
  const doc = await loadDoc(docId, password);
  const page = await readPage(await doc.getPage(pageNo));
  const boxes = page.items.flatMap((item, i) => (item.str.trim() ? [boxOf(page, i, 0, item.str.length)] : []));
  const lines: [number, number][] = [];
  for (const [, y, , h] of [...boxes].sort((a, b) => a[1] - b[1])) {
    const last = lines.at(-1);
    // Runs whose middles are within the other's height share a line.
    if (last && y + h / 2 < last[1] && y + h / 2 > last[0]) last[1] = Math.max(last[1], y + h);
    else lines.push([y, y + h]);
  }
  return lines;
}
