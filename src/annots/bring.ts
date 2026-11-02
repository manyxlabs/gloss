import { PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import { PAPER } from '../ink';
import { SWATCHES } from '../palette';
import { editable, rewrite, saveVersion } from '../pdf/pages';
import { loadDoc, textIn } from '../pdf/pdfjs';
import { canvasSpot, newCard, uid } from '../store/project';
import { COLORS, INKS, type Card, type Color, type Comment, type Highlight, type Ink, type Rect } from '../types';
import { foreignAnnotations, type Foreign } from './read';

export const LOCKED = 'Bringing in annotations needs an unprotected copy of this PDF. Save a copy without the password, add that, and bring them in there.';

/** A note further than this from any text, in points, is not about a passage: it goes on the canvas. */
const NEAR = 72;
/** A gap up or down counts for this much more than one across: a note in the margin is about the line beside it. */
const UPRIGHT = 4;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function nearest<K extends string>(keys: readonly K[], hex: (k: K) => string, color: [number, number, number] | null, fallback: K) {
  if (!color) return fallback;
  const distance = (k: K) => rgb(hex(k)).reduce((sum, v, i) => sum + (v - color[i]!) ** 2, 0);
  return keys.reduce((best, k) => (distance(k) < distance(best) ? k : best));
}

/** Runs of text on a page with their boxes in page fractions, for finding the passage a note is about. */
async function runs(docId: string, password: string | undefined, pageNo: number) {
  const page = await (await loadDoc(docId, password)).getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  return (await page.getTextContent()).items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [a, b, c, d, e, f] = item.transform as number[];
    const along = Math.hypot(a!, b!) || 1;
    const [dx, dy] = [(a! / along) * item.width, (b! / along) * item.width];
    const corners = [
      [e!, f!],
      [e! + dx, f! + dy],
      [e! + c!, f! + d!],
      [e! + dx + c!, f! + dy + d!],
    ].map(([x, y]) => viewport.convertToViewportPoint(x!, y!) as [number, number]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const box: Rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    return [{ text: item.str.trim(), box, size: [viewport.width, viewport.height] as const }];
  });
}

/** The run of text nearest a note's box, within reach, as its page fractions and text. */
async function passageNear(docId: string, password: string | undefined, page: number, [nx, ny, nw, nh]: Rect) {
  let best: { rect: Rect; text: string; gap: number } | null = null;
  for (const { text, box, size } of await runs(docId, password, page)) {
    const [w, h] = size;
    const [x, y, bw, bh] = box;
    const gapX = Math.max(0, x - (nx + nw) * w, nx * w - (x + bw));
    const gapY = Math.max(0, y - (ny + nh) * h, ny * h - (y + bh));
    const gap = gapX + gapY * UPRIGHT;
    if (Math.hypot(gapX, gapY) <= NEAR && (!best || gap < best.gap)) best = { rect: [x / w, y / h, bw / w, bh / h], text, gap };
  }
  return best;
}

const round = (r: Rect) => r.map((v) => Math.round(v * 1e5) / 1e5) as Rect;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Brings a document's highlights, notes and ink from other apps into Gloss: marked text becomes
 * highlights in the nearest Gloss colour, with the annotation's note as their comment; a note
 * becomes a comment on the passage nearest it, or a note on the canvas where there is no text near;
 * ink becomes handwriting. The originals are taken out of the file, in a new version of it, so
 * they are not drawn twice and the annotated export has each once. All of it is one step to undo.
 * Resolves with what to tell the reader.
 */
export const bringIn = (docId: string) => rewrite('The annotations could not be brought in.', () => convert(docId));

async function convert(docId: string): Promise<string[]> {
  const open = await editable(docId, LOCKED);
  if (typeof open === 'string') return [open];
  const { doc, pdf } = open;
  const found = await foreignAnnotations(docId);
  if (!found.length) return [];

  const highlights: Highlight[] = [];
  const comments: Comment[] = [];
  const inks: Ink[] = [];
  const cards: Card[] = [];
  const onCanvas: string[] = [];
  const replies = (f: Foreign) => found.flatMap((r) => (r.kind === 'reply' && r.to === f.id && r.text ? [`${r.author || 'Reply'}: ${r.text}`] : []));
  const said = (f: Foreign) => [f.text, ...replies(f)].filter(Boolean).join('\n\n');
  const commentOn = (f: Foreign) => {
    const text = said(f);
    if (!text) return {};
    const comment = { id: uid(), text };
    comments.push(comment);
    return { commentId: comment.id };
  };
  const color = (f: Foreign) => nearest<Color>(COLORS, (c) => SWATCHES[c].fill, f.color, 'yellow');

  for (const f of found) {
    if (f.kind === 'mark') {
      const rects = f.rects.map(round);
      const text = await textIn(docId, undefined, f.page, rects);
      // Marked over a picture, there are no words to quote, so it is kept as a box around a figure.
      highlights.push({ id: uid(), docId, parts: [{ page: f.page, rects }], text, color: color(f), ...(text ? {} : { area: true }), ...commentOn(f) });
    } else if (f.kind === 'note') {
      const near = await passageNear(docId, undefined, f.page, f.box);
      if (near) highlights.push({ id: uid(), docId, parts: [{ page: f.page, rects: [round(near.rect)] }], text: near.text, color: color(f), ...commentOn(f) });
      else if (said(f)) {
        const text = said(f);
        onCanvas.push(`p. ${f.page}`);
        const at = canvasSpot.next();
        cards.push({ ...newCard({ kind: 'note', text: `${text}\n\n(${doc.name}, p. ${f.page})` }, { x: at.x, y: at.y + cards.length * 140 }), selected: false });
      }
    } else if (f.kind === 'ink')
      inks.push(
        ...f.strokes
          .filter((s) => s.length > 1)
          .map((s) => ({
            id: uid(),
            docId,
            page: f.page,
            points: s.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5, 0.5] as [number, number, number]),
            color: nearest(INKS, (k) => PAPER[k], f.color, 'ink'),
            size: f.width,
            // Drawn at an even width, as a pen held at half pressure.
            pen: true,
          })),
      );
  }

  // The originals, their pop-up windows and replies come out of the file, so nothing is drawn twice.
  const taken = new Set(found.flatMap((f) => (f.kind === 'reply' ? [] : [f.id])));
  const gone = new Set(found.flatMap((f) => (f.kind !== 'reply' || taken.has(f.to) ? [f.id, ...(f.popup ? [f.popup] : [])] : [])));
  const tag = (ref: PDFRef) => `${ref.objectNumber}R${ref.generationNumber ? ref.generationNumber : ''}`;
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const kept = annots.asArray().filter((ref) => {
      if (!(ref instanceof PDFRef)) return true;
      if (gone.has(tag(ref))) return false;
      const parent = pdf.context.lookupMaybe(ref, PDFDict)?.get(PDFName.of('Parent'));
      return !(parent instanceof PDFRef && gone.has(tag(parent)));
    });
    if (kept.length === annots.size()) continue;
    if (kept.length) page.node.set(PDFName.of('Annots'), pdf.context.obj(kept) as PDFArray);
    else page.node.delete(PDFName.of('Annots'));
  }

  const failed = await saveVersion(doc, pdf, (p) => ({
    highlights: [...p.highlights, ...highlights],
    comments: [...p.comments, ...comments],
    inks: [...p.inks, ...inks],
    cards: [...p.cards, ...cards],
  }));
  if (failed) return [failed];
  return onCanvas.length
    ? [`${plural(onCanvas.length, 'note')} (${onCanvas.join(', ')}) had no text near ${onCanvas.length === 1 ? 'it, so it is a note' : 'them, so they are notes'} on the canvas.`]
    : [];
}
