import { AnnotationMode, OPS, Util, type PDFPageProxy } from 'pdfjs-dist';
import type { Rect } from '../types';

/** Smaller than this share of the page, a picture is an icon or a rule, which reads fine turned with the page. */
const MIN_AREA = 0.002;
/** Larger, it is a scan or a page's background, whose text should turn light with the page. */
const MAX_AREA = 0.6;

type Matrix = [number, number, number, number, number, number];

/**
 * Where a page draws pictures, as boxes in fractions of the page, found by following the page's
 * drawing operations: each picture fills the unit square under the transform in force.
 */
export async function pictureBoxes(page: PDFPageProxy): Promise<Rect[]> {
  const { fnArray, argsArray } = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
  const viewport = page.getViewport({ scale: 1 });
  const stack: Matrix[] = [];
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const out: Rect[] = [];
  fnArray.forEach((fn, i) => {
    const args = argsArray[i];
    if (fn === OPS.save) stack.push(m);
    else if (fn === OPS.restore) m = stack.pop() ?? m;
    else if (fn === OPS.transform) m = Util.transform(m, args) as Matrix;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(m);
      if (args[0]) m = Util.transform(m, args[0]) as Matrix;
    } else if (fn === OPS.paintFormXObjectEnd) m = stack.pop() ?? m;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const corners = [0, 0, 1, 0, 0, 1, 1, 1];
      for (let p = 0; p < 8; p += 2) Util.applyTransform(corners, m, p);
      const points = [0, 2, 4, 6].map((p) => viewport.convertToViewportPoint(corners[p]!, corners[p + 1]!) as number[]);
      const xs = points.map(([x]) => x! / viewport.width);
      const ys = points.map(([, y]) => y! / viewport.height);
      const [left, top] = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys))];
      const [w, h] = [Math.min(1, Math.max(...xs)) - left, Math.min(1, Math.max(...ys)) - top];
      if (w * h >= MIN_AREA && w * h <= MAX_AREA) out.push([left, top, w, h]);
    }
  });
  return out;
}
