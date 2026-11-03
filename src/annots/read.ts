import { files, loadDoc } from '../pdf/pdfjs';
import type { Rect } from '../types';

/** Marked text: highlighted, underlined, struck out or squiggled. */
const MARKS = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly']);

/** Annotation flags that keep an annotation from being shown. */
const HIDDEN = 0b10 | 0b100000;

type Common = { id: string; page: number; color: [number, number, number] | null; text: string; author: string; popup: string | null };
/**
 * An annotation another app wrote into the PDF, in page fractions: marked `rects`, a sticky note's
 * box, text typed onto the page in a box with its letters' `size` as a fraction of the page's
 * width, or ink `strokes` with their width as a fraction of the page's width.
 */
export type Foreign = Common &
  (
    | { kind: 'mark'; rects: Rect[] }
    | { kind: 'note'; box: Rect }
    | { kind: 'box'; box: Rect; size: number }
    | { kind: 'ink'; strokes: [number, number][][]; width: number }
    | { kind: 'reply'; to: string }
  );

type Data = {
  id: string;
  subtype: string;
  annotationFlags: number;
  rect: number[];
  color: Uint8ClampedArray | null;
  contentsObj?: { str: string };
  titleObj?: { str: string };
  popupRef?: string | null;
  inReplyTo?: string | null;
  quadPoints?: Float32Array | null;
  inkLists?: Float32Array[];
  borderStyle?: { width: number };
  defaultAppearanceData?: { fontSize: number };
};

// Keyed by the version of the file, as bringing them in writes a version without them.
const read = new Map<string, Promise<Foreign[]>>();

/** The highlights, notes, text boxes and ink in a document that Gloss can bring in as its own. */
export function foreignAnnotations(docId: string, password?: string) {
  const key = files.key(docId);
  let found = read.get(key);
  if (!found) {
    found = loadDoc(docId, password).then(async (doc) => {
      const out: Foreign[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const at = (x: number, y: number) => {
          const [vx, vy] = viewport.convertToViewportPoint(x, y) as [number, number];
          return [vx / viewport.width, vy / viewport.height] as [number, number];
        };
        /** The box around PDF points, as page fractions. */
        const box = (pts: number[]): Rect => {
          const corners = pts.flatMap((_, i) => (i % 2 ? [] : [at(pts[i]!, pts[i + 1]!)]));
          const xs = corners.map((c) => c[0]);
          const ys = corners.map((c) => c[1]);
          return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
        };
        for (const a of (await page.getAnnotations({ intent: 'display' })) as Data[]) {
          if (a.annotationFlags & HIDDEN || !(MARKS.has(a.subtype) || ['Text', 'FreeText', 'Ink'].includes(a.subtype))) continue;
          const common: Common = {
            id: a.id,
            page: n,
            color: a.color && a.color.length === 3 ? [a.color[0]!, a.color[1]!, a.color[2]!] : null,
            text: a.contentsObj?.str.trim() ?? '',
            author: a.titleObj?.str.trim() ?? '',
            popup: a.popupRef ?? null,
          };
          if (a.inReplyTo) out.push({ ...common, kind: 'reply', to: a.inReplyTo });
          else if (MARKS.has(a.subtype)) {
            const quads = a.quadPoints ? [...a.quadPoints] : a.rect;
            out.push({ ...common, kind: 'mark', rects: Array.from({ length: Math.max(1, quads.length / 8) }, (_, i) => box(quads.slice(i * 8, i * 8 + 8))) });
          } else if (a.subtype === 'Text') out.push({ ...common, kind: 'note', box: box(a.rect) });
          else if (a.subtype === 'FreeText') out.push({ ...common, kind: 'box', box: box(a.rect), size: (a.defaultAppearanceData?.fontSize || 10) / viewport.width });
          else if (a.inkLists?.length)
            out.push({
              ...common,
              kind: 'ink',
              strokes: a.inkLists.map((l) => [...l].flatMap((_, i) => (i % 2 ? [] : [at(l[i]!, l[i + 1]!)]))),
              width: (a.borderStyle?.width ?? 1) / viewport.width,
            });
        }
        page.cleanup();
      }
      return out;
    });
    found.catch(() => read.delete(key));
    read.set(key, found);
  }
  return found;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** What a document holds, as the question asks it: "12 highlights, 3 notes, 2 text boxes and 1 drawing". */
export function summary(found: Foreign[]) {
  const count = (kind: Foreign['kind']) => found.filter((f) => f.kind === kind).length;
  const parts = [
    ...(count('mark') ? [plural(count('mark'), 'highlight')] : []),
    ...(count('note') ? [plural(count('note'), 'note')] : []),
    ...(count('box') ? [plural(count('box'), 'text box', 'text boxes')] : []),
    ...(count('ink') ? [plural(count('ink'), 'drawing')] : []),
  ];
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
