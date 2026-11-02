import { getDocument, GlobalWorkerOptions, PasswordException, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getFile } from '../store/db';

GlobalWorkerOptions.workerSrc = workerUrl;

const assets = (dir: string) => `${import.meta.env.BASE_URL}pdfjs/${dir}/`;

export class PdfPasswordError extends Error {}

/** An open PDF; `close` frees its worker. */
export type OpenPdf = { doc: PDFDocumentProxy; close: () => Promise<void> };

export async function openPdf(data: Blob): Promise<OpenPdf> {
  // pdf.js hands the buffer to its worker, so each open gets its own copy.
  const task = getDocument({
      data: new Uint8Array(await data.arrayBuffer()),
      cMapUrl: assets('cmaps'),
      standardFontDataUrl: assets('standard_fonts'),
      wasmUrl: assets('wasm'),
      iccUrl: assets('iccs'),
    });
  try {
    return { doc: await task.promise, close: () => task.destroy() };
  } catch (err) {
    void task.destroy();
    if (err instanceof PasswordException) throw new PdfPasswordError();
    throw err;
  }
}

export const isPdf = async (file: Blob) => (await file.slice(0, 1024).text()).includes('%PDF-');

const open = new Map<string, Promise<OpenPdf>>();
const texts = new Map<string, Promise<string[]>>();

/** The open copy of a project document, shared by the viewer and search. */
export function loadDoc(docId: string) {
  return opened(docId).then((o) => o.doc);
}

function opened(docId: string) {
  let doc = open.get(docId);
  if (!doc) {
    doc = getFile(docId).then((blob) => {
      if (!blob) throw new Error('This PDF is missing from this browser’s storage.');
      return openPdf(blob);
    });
    // A failure must not stay cached, or the document could not be retried without a reload.
    doc.catch(() => open.delete(docId));
    open.set(docId, doc);
  }
  return doc;
}

/** Each page's text, joined the way it reads, for search. */
export function pageTexts(docId: string) {
  let pages = texts.get(docId);
  if (!pages) {
    pages = loadDoc(docId).then(async (doc) => {
      const out: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const { items } = await page.getTextContent();
        out.push(items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : '')).join(''));
        page.cleanup();
      }
      return out;
    });
    pages.catch(() => texts.delete(docId));
    texts.set(docId, pages);
  }
  return pages;
}

export function closeDocs() {
  for (const doc of open.values()) doc.then((o) => o.close(), () => {});
  open.clear();
  texts.clear();
}
