import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import { covered, fontFile } from '../convert/typeset';
import { m } from '../i18n';
import { ReaderError } from '../pdf/pdfjs';
import type { PageWords } from './recognize';

const n = (v: number) => +v.toFixed(3);
const DEVANAGARI = /[ऀ-ॿ]/;

async function devanagari(pdf: PDFDocument) {
  const res = await fetch(`${import.meta.env.BASE_URL}ocr/NotoSansDevanagari.woff`);
  if (!res.ok) throw new ReaderError(m.engineOcr.noFont);
  const font = await pdf.embedFont(await res.arrayBuffer(), { subset: true });
  // pdf-lib lays text out with fontkit, whose Devanagari shaper fails. Invisible text needs no
  // shaping, only each letter mapped to a glyph in reading order, which a Latin layout gives:
  // readers then copy and search the letters as they were recognised.
  const embedded = (font as unknown as { embedder: { font: { layout: (text: string, features?: object, script?: string) => unknown } } }).embedder.font;
  const layout = embedded.layout.bind(embedded);
  embedded.layout = (text, features) => layout(text, features, 'latn');
  return font;
}

/**
 * Writes recognised words into the PDF as invisible text (render mode 3) over the picture of
 * each, so any reader can select, search and copy them while the page looks as it did. Each
 * word gets its own text matrix, stretched to the word's width. Returns how many words no font
 * here could write.
 */
export async function addTextLayer(pdf: PDFDocument, pages: PageWords[]) {
  pdf.registerFontkit(fontkit);
  const words = pages.flatMap((p) => p.words);
  const latin = await pdf.embedFont(await fontFile('r'), { subset: true });
  const deva = words.some((w) => DEVANAGARI.test(w.text)) ? await devanagari(pdf) : null;
  const fontFor = (text: string) => [latin, deva].find((f): f is PDFFont => !!f && covered(f, text));
  const ctx = pdf.context;
  let missed = 0;
  for (const { page, words } of pages) {
    const node = pdf.getPage(page - 1).node;
    const names = new Map<PDFFont, string>();
    const ops = words.flatMap(({ text, at, along, up }) => {
      const font = fontFor(text);
      const width = font?.widthOfTextAtSize(text, 1);
      if (!font || !width) return (missed++, []);
      let name = names.get(font);
      if (!name) names.set(font, (name = node.newFontDictionary('OCR', font.ref).toString()));
      return [`${name} 1 Tf ${n(along[0] / width)} ${n(along[1] / width)} ${n(up[0])} ${n(up[1])} ${n(at[0])} ${n(at[1])} Tm ${font.encodeText(text).toString()} Tj`];
    });
    if (!ops.length) continue;
    // The page's own content is closed in q and Q first, so whatever it leaves in the graphics state cannot move the words.
    node.wrapContentStreams(ctx.register(ctx.stream('q')), ctx.register(ctx.stream('Q')));
    node.addContentStream(ctx.register(ctx.flateStream(`BT 3 Tr\n${ops.join('\n')}\nET`)));
  }
  return missed;
}
