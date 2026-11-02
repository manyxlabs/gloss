import type { Part, Rect } from '../types';

/**
 * The pages on screen with the stretch of each that is in view: pdf.js's own page divs, and
 * the copies that show the rest of a squeezed page. Each box is the whole page, wherever it
 * sits, so a point's fraction of the box is its place on the page.
 */
function pagesOf(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('.page[data-page-number]')].map((div) => ({
    page: Number(div.dataset.pageNumber),
    box: div.getBoundingClientRect(),
    from: Number(div.dataset.from ?? 0),
    to: Number(div.dataset.to ?? 1),
  }));
}

/** The page, and its box, under a point, skipping squeezed stretches. */
export function pageAt(root: HTMLElement, x: number, y: number) {
  return pagesOf(root).find(({ box, from, to }) => {
    const fy = (y - box.top) / box.height;
    return x >= box.left && x <= box.right && fy >= from && fy <= to;
  });
}

/** Where on screen a spot on a page is, or null while it is squeezed away. */
export function locate(root: HTMLElement, page: number, fx: number, fy: number) {
  const hit = pagesOf(root).find((p) => p.page === page && fy >= p.from && fy <= p.to);
  return hit
    ? {
        x: hit.box.left + fx * hit.box.width,
        y: hit.box.top + fy * hit.box.height,
      }
    : null;
}

/**
 * The boxes of the selected text only. A range's own client rects also include whole elements
 * it crosses, such as pdf.js's page-sized end-of-content marker, which would paint a page.
 */
export function textBoxes(range: Range) {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root.nodeType === Node.TEXT_NODE ? root.parentNode! : root, NodeFilter.SHOW_TEXT);
  const boxes: DOMRect[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || !node.parentElement?.closest('.textLayer')) continue;
    const r = document.createRange();
    r.selectNodeContents(node);
    if (node === range.startContainer) r.setStart(node, range.startOffset);
    if (node === range.endContainer) r.setEnd(node, range.endOffset);
    boxes.push(...[...r.getClientRects()].filter((b) => b.width > 0.5 && b.height > 0.5));
  }
  return boxes;
}

/** Joins the boxes of one line into a single bar, as pdf.js splits a line into many spans. */
function mergeLines(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const last = out.at(-1);
    const sameLine = last && Math.abs(last[1] + last[3] / 2 - (r[1] + r[3] / 2)) < Math.min(last[3], r[3]) / 2;
    if (last && sameLine && r[0] <= last[0] + last[2] + r[3]) {
      const x = Math.min(last[0], r[0]);
      const y = Math.min(last[1], r[1]);
      out[out.length - 1] = [x, y, Math.max(last[0] + last[2], r[0] + r[2]) - x, Math.max(last[1] + last[3], r[1] + r[3]) - y];
    } else out.push(r);
  }
  return out;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

export type Anchor = { parts: Part[]; text: string };

/** Where the current selection sits in the document, in page fractions, or null if nothing is selected in it. */
export function selectionAnchor(root: HTMLElement): Anchor | null {
  const selection = getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const pages = pagesOf(root);
  const byPage = new Map<number, Rect[]>();
  for (const b of textBoxes(range)) {
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const p = pages.find(({ box, from, to }) => cx >= box.left && cx <= box.right && (cy - box.top) / box.height >= from && (cy - box.top) / box.height <= to);
    if (!p) continue;
    const rect: Rect = [(b.left - p.box.left) / p.box.width, (b.top - p.box.top) / p.box.height, b.width / p.box.width, b.height / p.box.height];
    byPage.set(p.page, [...(byPage.get(p.page) ?? []), rect.map(round) as Rect]);
  }
  const parts = [...byPage].sort(([a], [b]) => a - b).map(([page, rects]) => ({ page, rects: mergeLines(rects) }));
  const text = cleanText(selection.toString());
  return parts.length && text ? { parts, text } : null;
}

/** PDF text as a sentence: words broken across lines are joined and line breaks become spaces. */
export const cleanText = (s: string) =>
  s
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

/** The page under a point and where on it, as fractions: pdf.js's text layer sits above the highlights and takes their clicks. */
export function pointOnPage(root: HTMLElement, x: number, y: number) {
  const hit = pageAt(root, x, y);
  return hit
    ? {
        page: hit.page,
        fx: (x - hit.box.left) / hit.box.width,
        fy: (y - hit.box.top) / hit.box.height,
      }
    : null;
}
