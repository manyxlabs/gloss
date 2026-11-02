// Several documents of a project exported as one annotated PDF, each with an entry in its outline,
// and the canvas after them if wanted.
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import { bookmarksOf } from '../store/bookmarks';
import type { Project } from '../types';
import { annotatedPdf } from './annotate';
import { appendOutline, bookmarkEntries, type OutlineEntry } from './outline';

const DEST = PDFName.of('Dest');
const ACTION = PDFName.of('A');
const D = PDFName.of('D');

/** Every destination array of a page's annotations: links' own and their actions'. */
function destinations(pdf: PDFDocument, page: PDFDict) {
  return (page.lookupMaybe(PDFName.of('Annots'), PDFArray)?.asArray() ?? []).flatMap((ref) => {
    const annot = pdf.context.lookupMaybe(ref, PDFDict);
    if (!annot) return [];
    const own = annot.lookupMaybe(DEST, PDFArray);
    const action = annot.lookupMaybe(ACTION, PDFDict)?.lookupMaybe(D, PDFArray);
    return [{ annot, dest: own ?? action }];
  });
}

/**
 * Copies a document's pages to the end of `out`. Annotations name pages by reference, and copied
 * as they are, each would bring its page, and through the page the whole document, in again:
 * so their page is dropped, which readers do not need, and a link's page becomes its number
 * while copying, then the copied page.
 */
async function append(out: PDFDocument, src: PDFDocument) {
  const index = new Map(src.getPages().map((p, i) => [p.ref.tag, i]));
  for (const page of src.getPages())
    for (const { annot, dest } of destinations(src, page.node)) {
      annot.delete(PDFName.of('P'));
      const target = dest?.get(0);
      if (dest && target instanceof PDFRef && index.has(target.tag)) dest.set(0, PDFNumber.of(index.get(target.tag)!));
    }
  const offset = out.getPageCount();
  for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
  const pages = out.getPages();
  for (const page of pages.slice(offset))
    for (const { dest } of destinations(out, page.node)) {
      const n = dest?.get(0);
      const to = n instanceof PDFNumber ? pages[offset + n.asNumber()] : undefined;
      if (to) dest!.set(0, to.ref);
    }
  return offset;
}

/** The documents given, in order, as one PDF with their annotations, and the canvas given as a last page. Documents that cannot be exported are left out with a reason. */
export async function combinedPdf(project: Project, docIds: string[], canvasId: string | null) {
  const out = await PDFDocument.create();
  const outline: OutlineEntry[] = [];
  const problems: string[] = [];
  for (const id of docIds) {
    const doc = project.docs.find((d) => d.id === id);
    if (!doc) continue;
    try {
      const src = await PDFDocument.load(await (await annotatedPdf(project, id)).arrayBuffer(), { updateMetadata: false });
      const offset = await append(out, src);
      outline.push({ title: doc.name, page: out.getPage(offset), children: bookmarkEntries(out, bookmarksOf(project, id), offset) });
    } catch (err) {
      problems.push(`“${doc.name}” was left out: ${(err as Error).message}`);
    }
  }
  if (canvasId !== null) {
    // The canvas as the Export menu pictures it, on a page of its own size.
    const { canvasPng } = await import('../components/CanvasExport');
    const png = await canvasPng(project, canvasId);
    const title = project.canvases.find((c) => c.id === canvasId)?.name ?? 'Canvas';
    if (png) {
      const { picturePdf } = await import('../canvasPicture');
      const page = await PDFDocument.load(await (await picturePdf(await png.blob.arrayBuffer(), png.width, png.height, 'fit', title)).arrayBuffer());
      outline.push({ title, page: out.getPage(await append(out, page)) });
    }
  }
  if (!out.getPageCount()) throw new Error(problems.join(' ') || 'There was nothing to export.');
  appendOutline(out, outline);
  out.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  out.setTitle(project.name);
  out.setCreator('Gloss');
  return { blob: new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' }), problems };
}
