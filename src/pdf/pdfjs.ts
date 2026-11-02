import { getDocument, GlobalWorkerOptions, PasswordException, PasswordResponses, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getFile } from '../store/db';
import type { Rect } from '../types';
import { cleanText } from './anchor';

GlobalWorkerOptions.workerSrc = workerUrl;

const assets = (dir: string) => `${import.meta.env.BASE_URL}pdfjs/${dir}/`;

/** The PDF needs a password: none was given, or `wrong` when the one given did not open it. */
export class PdfPasswordError extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? 'The password is not right.' : 'The PDF needs a password.');
  }
}

/** An open PDF; `close` frees its worker. */
export type OpenPdf = { doc: PDFDocumentProxy; close: () => Promise<void> };

export async function openPdf(data: Blob, password?: string): Promise<OpenPdf> {
  // pdf.js hands the buffer to its worker, so each open gets its own copy.
  const task = getDocument({
    data: new Uint8Array(await data.arrayBuffer()),
    cMapUrl: assets('cmaps'),
    standardFontDataUrl: assets('standard_fonts'),
    wasmUrl: assets('wasm'),
    iccUrl: assets('iccs'),
    password,
  });
  try {
    return { doc: await task.promise, close: () => task.destroy() };
  } catch (err) {
    void task.destroy();
    if (err instanceof PasswordException) throw new PdfPasswordError(err.code === PasswordResponses.INCORRECT_PASSWORD);
    throw err;
  }
}

export const isPdf = async (file: Blob) => (await file.slice(0, 1024).text()).includes('%PDF-');

const open = new Map<string, Promise<OpenPdf>>();
const texts = new Map<string, Promise<string[]>>();
const images = new Map<string, Promise<string>>();

/** The open copy of a project document, shared by the viewer and search; `password` opens a protected one. */
export function loadDoc(docId: string, password?: string) {
  return opened(docId, password).then((o) => o.doc);
}

function opened(docId: string, password?: string) {
  let doc = open.get(docId);
  if (!doc) {
    doc = getFile(docId).then((blob) => {
      if (!blob) throw new Error('This PDF is missing from this browser’s storage.');
      return openPdf(blob, password);
    });
    // A failure must not stay cached, or the document could not be retried without a reload.
    doc.catch(() => open.delete(docId));
    open.set(docId, doc);
  }
  return doc;
}

/** Each page's text, joined the way it reads, for search. */
export function pageTexts(docId: string, password?: string) {
  let pages = texts.get(docId);
  if (!pages) {
    pages = loadDoc(docId, password).then(async (doc) => {
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

/** The text whose middle lies inside a box on a page, in reading order. */
export async function textIn(docId: string, password: string | undefined, pageNo: number, [x, y, w, h]: Rect) {
  const page = await (await loadDoc(docId, password)).getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  let text = '';
  for (const item of (await page.getTextContent()).items) {
    if (!('str' in item)) continue;
    // The run's middle in PDF space: half along its baseline, half up its height, whatever the rotation.
    const [a, b, c, d, e, f] = item.transform as number[];
    const along = Math.hypot(a!, b!) || 1;
    const [vx, vy] = viewport.convertToViewportPoint(e! + ((a! / along) * item.width + c!) / 2, f! + ((b! / along) * item.width + d!) / 2) as [number, number];
    const [fx, fy] = [vx / viewport.width, vy / viewport.height];
    if (fx >= x && fx <= x + w && fy >= y && fy <= y + h) text += item.str + (item.hasEOL ? '\n' : ' ');
  }
  return cleanText(text);
}

/**
 * A box of a page drawn as an image, at `scale` pixels per PDF point, as an object URL. Kept in
 * memory only: images are drawn again from the PDF after a reload rather than stored.
 */
export function regionImage(docId: string, password: string | undefined, pageNo: number, [x, y, w, h]: Rect, scale: number) {
  const key = `${docId}:${pageNo}:${x},${y},${w},${h}@${scale}`;
  let url = images.get(key);
  if (!url) {
    url = loadDoc(docId, password).then(async (doc) => {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * viewport.width));
      canvas.height = Math.max(1, Math.round(h * viewport.height));
      await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -x * viewport.width, -y * viewport.height] }).promise;
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done));
      if (!blob) throw new Error('The page could not be drawn.');
      return URL.createObjectURL(blob);
    });
    url.catch(() => images.delete(key));
    images.set(key, url);
  }
  return url;
}

export function closeDocs() {
  for (const doc of open.values())
    doc.then(
      (o) => o.close(),
      () => {},
    );
  for (const url of images.values()) url.then(URL.revokeObjectURL, () => {});
  open.clear();
  texts.clear();
  images.clear();
}
