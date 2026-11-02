import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFPage } from 'pdf-lib';
import { outline, PAGE_PIXELS, PAPER } from '../ink';
import { cite, commentOf, endsOf } from '../links';
import { fileKey, getFile } from '../store/db';
import type { Project } from '../types';
import { loadDoc } from './pdfjs';

const HIGHLIGHT: Record<string, string> = {
  yellow: '#fde047',
  green: '#86efac',
  blue: '#93c5fd',
  pink: '#f9a8d4',
  purple: '#c4b5fd',
};
/** The darker shade each colour is outlined in, as on screen. */
const EDGE: Record<string, string> = {
  yellow: '#ca8a04',
  green: '#16a34a',
  blue: '#2563eb',
  pink: '#db2777',
  purple: '#7c3aed',
};
const BORDER = 1.5;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const n = (v: number) => +v.toFixed(3);

/**
 * The document with its highlights and handwriting added as standard PDF annotations, so any
 * reader shows them and can edit them. Each carries its own appearance, as some readers do not
 * draw an annotation without one. A boxed figure becomes a Square. The highlight's own comment,
 * its excerpt's comment and the passages linked to it become the annotation's note, and a link to
 * a passage in the same document is also a Link annotation over the passage that goes there.
 */
export async function annotatedPdf(project: Project, docId: string) {
  const doc = project.docs.find((d) => d.id === docId);
  const bytes = doc && (await getFile(fileKey(doc)));
  if (!bytes) throw new Error('This PDF is missing from this browser’s storage.');
  const pdf = await PDFDocument.load(await bytes.arrayBuffer(), { updateMetadata: false, ignoreEncryption: true });
  // pdf-lib cannot decrypt, and what it wrote into the still encrypted file would be unreadable.
  if (pdf.isEncrypted)
    throw new Error('it is password protected, and annotations cannot be written into a protected PDF. Save a copy without the password, add that, and export it.');
  const source = await loadDoc(docId, doc?.password);
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
    // The comment in the margin and the one on the excerpt's card, when there are both.
    const others = endsOf(project, h.id).flatMap((e) => ('highlight' in e ? [e.highlight] : []));
    const note = [commentOf(project, h)?.text, comments.get(h.id), ...others.map((o) => `Linked passage: ${cite(project, o)}`)].filter(Boolean).join('\n\n');
    const contents = note ? { Contents: PDFHexString.fromText(note) } : {};
    for (const o of others.filter((x) => x.docId === docId)) {
      const [from, to] = [h.parts[0], o.parts[0]];
      if (!from?.rects.length || !to?.rects[0]) continue;
      const [x, y] = (await pointOf(to.page))(to.rects[0][0], to.rects[0][1]);
      const at = await pointOf(from.page);
      const link = ctx.register(
        ctx.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: bounds(from.rects.flatMap(([rx, ry, w, hgt]) => [at(rx, ry), at(rx + w, ry + hgt)])),
          Border: [0, 0, 0],
          F: 4,
          // Lands with the passage's first line at the top of the view, at the reader's own zoom.
          A: { S: 'GoTo', D: [pdf.getPage(to.page - 1).ref, PDFName.of('XYZ'), n(x), n(y), null] },
        } as never),
      );
      pdf.getPage(from.page - 1).node.addAnnot(link);
    }
    for (const part of h.parts) {
      const at = await pointOf(part.page);
      // Corners in the order readers expect: top left, top right, bottom left, bottom right.
      const quads = part.rects.map(([x, y, w, hgt]) => [at(x, y), at(x + w, y), at(x, y + hgt), at(x + w, y + hgt)]);
      const rect = bounds(quads.flat());
      if (h.area) {
        const edge = rgb(EDGE[h.color]!);
        // A page turned by a multiple of 90 degrees keeps the box square to the PDF's axes, so its bounds are the box.
        // The stroke is drawn inside them, so it is not cut off at the edges.
        const inset = BORDER / 2;
        add(
          pdf.getPage(part.page - 1),
          rect,
          { Subtype: 'Square', C: edge, BS: { W: BORDER }, ...contents },
          `${edge.join(' ')} RG ${BORDER} w\n${n(rect[0]! + inset)} ${n(rect[1]! + inset)} ${n(rect[2]! - rect[0]! - BORDER)} ${n(rect[3]! - rect[1]! - BORDER)} re S`,
        );
        continue;
      }
      const fill = quads.map(([a, b, c, d]) => `${n(a![0])} ${n(a![1])} m ${n(b![0])} ${n(b![1])} l ${n(d![0])} ${n(d![1])} l ${n(c![0])} ${n(c![1])} l h f`).join('\n');
      add(
        pdf.getPage(part.page - 1),
        rect,
        {
          Subtype: 'Highlight',
          QuadPoints: quads.flat(2).map(n),
          C: color,
          ...contents,
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
