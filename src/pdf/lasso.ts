import { addHighlight, addInk, excerpt, type Drawn } from '../store/project';
import type { Color, Point, Rect } from '../types';
import { cleanText, mergeLines } from './anchor';
import { textIn } from './pdfjs';

/** A word on a page: its middle, and its box, in page fractions; `eol` when its line ends after it. */
type Word = { text: string; mid: [number, number]; box: Rect; eol: boolean };
const joined = (words: Word[]) => cleanText(words.map((w) => w.text + (w.eol ? '\n' : ' ')).join(''));

/** A stroke shorter than this, in screen pixels, or a loop narrower, is writing rather than a lasso. */
const MIN_LENGTH = 60;
const MIN_SIDE = 14;
/** Ends this close, as a share of the loop's size, close it. */
const CLOSE = 0.22;
/** A loop encloses at least this share of its bounds; a scribble that crosses itself encloses little. */
const FILLED = 0.35;
/** Words covering less of a loop than this are labels in a figure, which is kept as a picture. */
const WORDY = 0.12;

/** Inside a polygon, by the even-odd rule. */
function inside(poly: [number, number][], [x, y]: [number, number]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [poly[i]!, poly[j]!];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const area = (poly: [number, number][]) => Math.abs(poly.reduce((sum, [x, y], i) => sum + x * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * y, 0)) / 2;

/** The stroke as a closed loop in page fractions, or null when it is not one. `box` is the page on screen. */
export function loopOf(points: Point[], box: { width: number; height: number }): [number, number][] | null {
  const px = points.map(([x, y]) => [x * box.width, y * box.height] as [number, number]);
  const xs = px.map((p) => p[0]);
  const ys = px.map((p) => p[1]);
  const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const length = px.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - px[i - 1]![0], p[1] - px[i - 1]![1]) : 0), 0);
  const [first, last] = [px[0]!, px.at(-1)!];
  const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) <= CLOSE * Math.max(w, h);
  if (length < MIN_LENGTH || w < MIN_SIDE || h < MIN_SIDE || !closed || area(px) < FILLED * w * h) return null;
  return points.map(([x, y]) => [x, y]);
}

/**
 * The words of a page as its text layer places them, which is where the reader sees them and where
 * a selection of them would be. Null while the page's text layer is not drawn.
 */
function layerWords(root: HTMLElement, page: number): Word[] | null {
  const div = root.querySelector<HTMLElement>(`.page[data-page-number="${page}"]:not([data-copy])`);
  const layer = div?.querySelector('.textLayer');
  if (!div || !layer?.textContent?.trim()) return null;
  const box = div.getBoundingClientRect();
  const out: Word[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const matches = [...node.textContent!.matchAll(/\S+/g)];
    const eol = node.parentElement?.nextSibling?.nodeName === 'BR';
    matches.forEach((m, i) => {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const rect: Rect = [(r.left - box.left) / box.width, (r.top - box.top) / box.height, r.width / box.width, r.height / box.height];
      out.push({ text: m[0], mid: [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2], box: rect, eol: eol && i === matches.length - 1 });
    });
  }
  return out;
}

/**
 * Keeps a pen stroke on a page. A closed loop excerpts what it encloses: the words whose middles
 * are inside it, or where words are few, the region as a figure, as Snip would. Anything else is
 * handwriting, as is a highlighter's loop, which marks the words rather than taking them.
 */
export async function keepStroke(root: HTMLElement, docId: string, password: string | undefined, { page, box, ...drawn }: Drawn & { page: number; box: DOMRect }, color: Color) {
  const loop = drawn.nib !== 'marker' && loopOf(drawn.points, box);
  if (!loop) return addInk(docId, page, drawn);
  const fx = loop.map((p) => Math.min(1, Math.max(0, p[0])));
  const fy = loop.map((p) => Math.min(1, Math.max(0, p[1])));
  const bounds: Rect = [Math.min(...fx), Math.min(...fy), Math.max(...fx) - Math.min(...fx), Math.max(...fy) - Math.min(...fy)];
  const all = layerWords(root, page);
  // Without its text layer, the page's words cannot be placed closely enough to pick them out, so the loop is taken as a figure.
  if (!all) return excerpt(addHighlight(docId, [{ page: page, rects: [bounds] }], await textIn(docId, password, page, [bounds]).catch(() => ''), color, { area: true }).id);
  const words = all.filter((w) => inside(loop, w.mid));
  const covered = words.reduce((sum, w) => sum + w.box[2] * w.box[3] * box.width * box.height, 0);
  const figure = covered < WORDY * area(loop.map(([x, y]) => [x * box.width, y * box.height]));
  const h = figure
    ? addHighlight(docId, [{ page: page, rects: [bounds] }], joined(words), color, { area: true })
    : addHighlight(docId, [{ page: page, rects: mergeLines(words.map((w) => w.box)) }], joined(words), color);
  excerpt(h.id);
}
