import { PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, type PDFDocument, type PDFPage } from 'pdf-lib';
import type { Bookmark } from '../types';

/** An entry of a PDF's outline (its bookmarks panel): a title going to a page, at `top` in PDF points or the page's top. */
export type OutlineEntry = { title: string; page: PDFPage; top?: number; children?: OutlineEntry[] };

/** How far down an unturned page a bookmark's place is, in PDF points; a turned page is opened at its top. */
export function topOf(page: PDFPage, y: number) {
  if (page.getRotation().angle % 360) return undefined;
  const box = page.getCropBox();
  return Math.round((box.y + box.height * (1 - y)) * 100) / 100;
}

/** A document's bookmarks as outline entries on its pages, `offset` pages into the PDF. */
export const bookmarkEntries = (pdf: PDFDocument, marks: Bookmark[], offset = 0): OutlineEntry[] =>
  marks.flatMap((b) => {
    const page = pdf.getPages()[offset + b.page - 1];
    return page ? [{ title: b.name, page, top: topOf(page, b.y) }] : [];
  });

function write(pdf: PDFDocument, parent: PDFRef, entries: OutlineEntry[]) {
  const ctx = pdf.context;
  const refs = entries.map(() => ctx.nextRef());
  entries.forEach((e, i) => {
    const item = PDFDict.withContext(ctx);
    item.set(PDFName.of('Title'), PDFHexString.fromText(e.title));
    item.set(PDFName.of('Parent'), parent);
    item.set(PDFName.of('Dest'), ctx.obj([e.page.ref, PDFName.of('XYZ'), PDFNull, e.top === undefined ? PDFNull : PDFNumber.of(e.top), PDFNull]));
    if (i > 0) item.set(PDFName.of('Prev'), refs[i - 1]!);
    if (i < refs.length - 1) item.set(PDFName.of('Next'), refs[i + 1]!);
    if (e.children?.length) {
      const [first, last] = write(pdf, refs[i]!, e.children);
      item.set(PDFName.of('First'), first);
      item.set(PDFName.of('Last'), last);
      item.set(PDFName.of('Count'), PDFNumber.of(e.children.length));
    }
    ctx.assign(refs[i]!, item);
  });
  return [refs[0]!, refs.at(-1)!] as const;
}

/** Adds entries at the end of a PDF's outline, making one if it has none, and keeps what was there. */
export function appendOutline(pdf: PDFDocument, entries: OutlineEntry[]) {
  if (!entries.length) return;
  const ctx = pdf.context;
  const raw = pdf.catalog.get(PDFName.of('Outlines'));
  const root = pdf.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict) ?? ctx.obj({ Type: 'Outlines' });
  const rootRef = raw instanceof PDFRef ? raw : ctx.register(root);
  const [first, last] = write(pdf, rootRef, entries);
  const before = root.get(PDFName.of('Last'));
  if (before instanceof PDFRef) {
    ctx.lookup(before, PDFDict).set(PDFName.of('Next'), first);
    ctx.lookup(first, PDFDict).set(PDFName.of('Prev'), before);
  } else root.set(PDFName.of('First'), first);
  root.set(PDFName.of('Last'), last);
  const count = root.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber() ?? 0;
  // A negative count is an outline shown closed, and stays so.
  root.set(PDFName.of('Count'), PDFNumber.of(count < 0 ? count - entries.length : count + entries.length));
  pdf.catalog.set(PDFName.of('Outlines'), rootRef);
}
