import { clip, endPath, PDFDocument, type PDFImage, popGraphicsState, pushGraphicsState, rectangle } from 'pdf-lib';

/** Space around the cards in a picture of the canvas, in canvas units. */
export const MARGIN = 32;
/** Beyond these a browser cannot make or encode the canvas, and a phone runs out of memory well before. */
const MAX_SIDE = 16384;
const MAX_PIXELS = 40_000_000;
/** CSS pixels are 1/96 inch and PDF points 1/72. */
const PT = 0.75;
const PAGE_MARGIN = 36;
const PAPERS = { a4: [595.28, 841.89], letter: [612, 792] } as const;
export type Paper = 'fit' | keyof typeof PAPERS;

/** The scale a picture `width` by `height` can be drawn at: the one asked for, or less where it would be too large. */
export const fitScale = (width: number, height: number, wanted: number) => Math.min(wanted, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));

/**
 * A PDF of a picture `width` by `height` CSS pixels: one page its size, or pages of a paper size,
 * turned to suit its shape, with the picture fitted to their width (never enlarged) and continued
 * from page to page.
 */
export async function picturePdf(png: ArrayBuffer, width: number, height: number, paper: Paper, title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const image = await pdf.embedPng(png);
  if (paper === 'fit') pdf.addPage([width * PT, height * PT]).drawImage(image, { x: 0, y: 0, width: width * PT, height: height * PT });
  else tile(pdf, image, width, height, PAPERS[paper]);
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
}

function tile(pdf: PDFDocument, image: PDFImage, width: number, height: number, [short, long]: readonly [number, number]) {
  const [pw, ph] = width > height ? [long, short] : [short, long];
  const [boxW, boxH] = [pw - 2 * PAGE_MARGIN, ph - 2 * PAGE_MARGIN];
  const scale = Math.min(PT, boxW / width);
  const [w, h] = [width * scale, height * scale];
  const x = PAGE_MARGIN + (boxW - w) / 2;
  // A hair over a page's worth of rounding must not start a page with nothing on it.
  const pages = Math.max(1, Math.ceil(h / boxH - 0.001));
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([pw, ph]);
    page.pushOperators(pushGraphicsState(), rectangle(PAGE_MARGIN, PAGE_MARGIN, boxW, boxH), clip(), endPath());
    page.drawImage(image, { x, y: ph - PAGE_MARGIN - h + i * boxH, width: w, height: h });
    page.pushOperators(popGraphicsState());
  }
}
