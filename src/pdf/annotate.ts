import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFFont, type PDFPage } from 'pdf-lib';
import { covered, fontFile } from '../convert/typeset';
import { outline, PAGE_PIXELS, PAPER } from '../ink';
import { cite, commentOf, endsOf } from '../links';
import { swatchOf } from '../palette';
import { fileKey, getFile } from '../store/db';
import { TEXT_LINE, TEXT_PAD } from '../store/project';
import type { Highlight, Project } from '../types';
import { bookmarksOf } from '../store/bookmarks';
import { appendOutline, bookmarkEntries } from './outline';
import { loadDoc } from './pdfjs';

const BORDER = 1.5;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const n = (v: number) => +v.toFixed(3);

/**
 * A text box's words in lines no wider than `width`, broken as the page shows them: at spaces, and
 * inside a word only where the word alone is wider.
 */
function wrap(text: string, width: number, measure: (s: string) => number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.match(/\S+\s*|\s+/g) ?? []) {
      if (line && measure((line + word).trimEnd()) > width) {
        lines.push(line.trimEnd());
        line = '';
      }
      let rest = [...word];
      while (!line && rest.length > 1 && measure(rest.join('').trimEnd()) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut).join('')) > width) cut--;
        lines.push(rest.slice(0, cut).join(''));
        rest = rest.slice(cut);
      }
      line += rest.join('');
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/**
 * The document with its highlights and handwriting added as standard PDF annotations, so any
 * reader shows them and can edit them. Each carries its own appearance, as some readers do not
 * draw an annotation without one. A boxed figure becomes a Square, and a text box a FreeText with
 * its words set in Noto Sans, upright however the page is turned. The highlight's own comment,
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

  const add = (page: PDFPage, rect: number[], dict: Record<string, unknown>, drawing: string, form: Record<string, unknown> = {}) => {
    const appearance = ctx.register(
      ctx.stream(drawing, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: rect,
        Resources: { ExtGState: { M: multiply } },
        ...form,
      } as never),
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

  let font: Promise<PDFFont> | undefined;
  const letters = rgb(PAPER.ink).map(n).join(' ');
  /** A text box as the page shows it: its words wrapped in its width, its height theirs. */
  const addTextBox = async (h: Highlight) => {
    const part = h.parts[0];
    const rect = part?.rects[0];
    if (!part || !rect) return;
    const [x, y, w] = rect;
    if (!font) pdf.registerFontkit(fontkit);
    const face = await (font ??= fontFile('r').then((bytes) => pdf.embedFont(bytes, { subset: true })));
    const { width: vw, height: vh } = (await source.getPage(part.page)).getViewport({ scale: 1 });
    const size = h.typed!.size * vw;
    const [padX, padY, lead] = [TEXT_PAD[0] * size, TEXT_PAD[1] * size, TEXT_LINE * size];
    const [width, text] = [w * vw, [...h.text].map((ch) => (/\s/.test(ch) || covered(face, ch) ? ch : '?')).join('')];
    const lines = wrap(text, width - 2 * padX, (s) => face.widthOfTextAtSize(s, size));
    const height = lines.length * lead + 2 * padY;
    // The baseline sits as CSS puts it: the line's spare height split above and below the font's own.
    const baseline = height - padY - (lead - face.heightAtSize(size)) / 2 - face.heightAtSize(size, { descender: false });
    const at = await pointOf(part.page);
    const [a, b, c] = [at(x, y + height / vh), at(x + w, y + height / vh), at(x, y)];
    // The form is drawn upright in the box's own units and turned onto the page, which may be turned itself.
    const matrix = [(b[0] - a[0]) / width, (b[1] - a[1]) / width, (c[0] - a[0]) / height, (c[1] - a[1]) / height, a[0], a[1]].map(n);
    const fill = rgb(swatchOf(h.color).fill);
    const words = lines.map((l, i) => `${i ? 'T* ' : ''}${face.encodeText(l).toString()} Tj`).join('\n');
    add(
      pdf.getPage(part.page - 1),
      bounds([a, b, c, at(x + w, y)]),
      { Subtype: 'FreeText', Contents: PDFHexString.fromText(h.text), DA: PDFString.of(`/F ${n(size)} Tf ${letters} rg`), C: fill, BS: { W: 0 } },
      `q /M gs ${fill.join(' ')} rg 0 0 ${n(width)} ${n(height)} re f Q\nBT /F ${n(size)} Tf ${letters} rg ${n(lead)} TL ${n(padX)} ${n(baseline)} Td\n${words}\nET`,
      { BBox: [0, 0, n(width), n(height)], Matrix: matrix, Resources: { ExtGState: { M: multiply }, Font: { F: face.ref } } },
    );
  };

  const comments = new Map(project.cards.flatMap((c) => (c.data.kind === 'excerpt' && c.data.comment?.trim() ? [[c.data.highlightId, c.data.comment.trim()]] : [])));
  for (const h of project.highlights.filter((x) => x.docId === docId)) {
    const color = rgb(swatchOf(h.color).fill);
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
    if (h.typed) {
      await addTextBox(h);
      continue;
    }
    for (const part of h.parts) {
      const at = await pointOf(part.page);
      // Corners in the order readers expect: top left, top right, bottom left, bottom right.
      const quads = part.rects.map(([x, y, w, hgt]) => [at(x, y), at(x + w, y), at(x, y + hgt), at(x + w, y + hgt)]);
      const rect = bounds(quads.flat());
      if (h.area) {
        const edge = rgb(swatchOf(h.color).edge);
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

  appendOutline(pdf, bookmarkEntries(pdf, bookmarksOf(project, docId)));
  pdf.setModificationDate(new Date());
  return new Blob([(await pdf.save()) as BlobPart], {
    type: 'application/pdf',
  });
}
