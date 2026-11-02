import { PDFDocument, PDFHexString, PDFString, type PDFPage } from 'pdf-lib';
import { outline, PAGE_PIXELS, PAPER } from '../ink';
import { getFile } from '../store/db';
import type { Project } from '../types';
import { loadDoc } from './pdfjs';

const HIGHLIGHT: Record<string, string> = {
  yellow: '#fde047',
  green: '#86efac',
  blue: '#93c5fd',
  pink: '#f9a8d4',
  purple: '#c4b5fd',
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const n = (v: number) => +v.toFixed(3);

/**
 * The document with its highlights and handwriting added as standard PDF annotations, so any
 * reader shows them and can edit them. Each carries its own appearance, as some readers do not
 * draw an annotation without one. An excerpt's comment becomes the highlight's note.
 */
export async function annotatedPdf(project: Project, docId: string) {
  const bytes = await getFile(docId);
  if (!bytes) throw new Error('This PDF is missing from this browser’s storage.');
  const pdf = await PDFDocument.load(await bytes.arrayBuffer(), { updateMetadata: false, ignoreEncryption: true });
  // pdf-lib cannot decrypt, and what it wrote into the still encrypted file would be unreadable.
  if (pdf.isEncrypted)
    throw new Error('it is password protected, and annotations cannot be written into a protected PDF. Save a copy without the password, add that, and export it.');
  const source = await loadDoc(docId, project.docs.find((d) => d.id === docId)?.password);
  const ctx = pdf.context;
  const multiply = ctx.obj({ Type: 'ExtGState', BM: 'Multiply' });

  // pdf.js knows each page's crop box and rotation, so it turns page fractions into PDF points.
  const toPdf = new Map<number, (fx: number, fy: number) => [number, number]>();
  const pointOf = async (page: number) => {
    let f = toPdf.get(page);
    if (!f) {
      const viewport = (await source.getPage(page)).getViewport({ scale: 1 });
      f = (fx, fy) => viewport.convertToPdfPoint(fx * viewport.width, fy * viewport.height) as [number, number];
      toPdf.set(page, f);
    }
    return f;
  };

  const add = (page: PDFPage, rect: number[], dict: Record<string, unknown>, drawing: string) => {
    const appearance = ctx.register(
      ctx.stream(drawing, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: rect,
        Resources: { ExtGState: { M: multiply } },
      }),
    );
    const annot = ctx.register(
      ctx.obj({
        Type: 'Annot',
        Rect: rect,
        F: 4,
        T: PDFString.of('Gloss'),
        M: PDFString.fromDate(new Date()),
        P: page.ref,
        AP: { N: appearance },
        ...dict,
      } as never),
    );
    page.node.addAnnot(annot);
  };
  const bounds = (pts: number[][]) => {
    const xs = pts.map((p) => p[0]!);
    const ys = pts.map((p) => p[1]!);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(n);
  };

  const comments = new Map(project.cards.flatMap((c) => (c.data.kind === 'excerpt' && c.data.comment?.trim() ? [[c.data.highlightId, c.data.comment.trim()]] : [])));
  for (const h of project.highlights.filter((x) => x.docId === docId)) {
    const color = rgb(HIGHLIGHT[h.color]!);
    for (const part of h.parts) {
      const at = await pointOf(part.page);
      // Corners in the order readers expect: top left, top right, bottom left, bottom right.
      const quads = part.rects.map(([x, y, w, hgt]) => [at(x, y), at(x + w, y), at(x, y + hgt), at(x + w, y + hgt)]);
      const rect = bounds(quads.flat());
      const fill = quads.map(([a, b, c, d]) => `${n(a![0])} ${n(a![1])} m ${n(b![0])} ${n(b![1])} l ${n(d![0])} ${n(d![1])} l ${n(c![0])} ${n(c![1])} l h f`).join('\n');
      add(
        pdf.getPage(part.page - 1),
        rect,
        {
          Subtype: 'Highlight',
          QuadPoints: quads.flat(2).map(n),
          C: color,
          ...(comments.has(h.id) ? { Contents: PDFHexString.fromText(comments.get(h.id)!) } : {}),
        },
        `/M gs ${color.join(' ')} rg\n${fill}`,
      );
    }
  }

  for (const ink of project.inks.filter((i) => i.docId === docId)) {
    const at = await pointOf(ink.page);
    const { width, height } = (await source.getPage(ink.page)).getViewport({
      scale: 1,
    });
    const scale = height / width;
    // Strokes are kept in fractions of the page's width and height; the outline is drawn in width units.
    const shape = outline(
      ink.points.map(([x, y, p]) => [x, y * scale, p]),
      ink.size,
      ink.pen,
      PAGE_PIXELS,
    ).map(([x, y]) => at(x, y / scale));
    if (shape.length < 3) continue;
    const line = ink.points.map(([x, y]) => at(x, y));
    const color = rgb(PAPER[ink.color]);
    const rect = bounds([...shape, ...line]);
    add(
      pdf.getPage(ink.page - 1),
      rect,
      {
        Subtype: 'Ink',
        InkList: [line.flat().map(n)],
        C: color,
        BS: { W: n(ink.size * width) },
      },
      `${color.join(' ')} rg\n${shape.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ')} h f`,
    );
  }

  pdf.setModificationDate(new Date());
  return new Blob([(await pdf.save()) as BlobPart], {
    type: 'application/pdf',
  });
}
