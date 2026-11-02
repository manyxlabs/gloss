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

const MAX_IMAGE_SIDE = 4096;

// Keyed by the version of a document's file, so a document whose pages were edited opens afresh.
const open = new Map<string, Promise<OpenPdf>>();
const texts = new Map<string, Promise<string[]>>();
const images = new Map<string, Promise<string>>();

/** Where a document's current file is kept; the project store, which knows the documents, sets this. */
export const files = { key: (docId: string) => docId };

/** The open copy of a project document, shared by the viewer and search; `password` opens a protected one. */
export function loadDoc(docId: string, password?: string) {
  return opened(files.key(docId), password).then((o) => o.doc);
}

function opened(key: string, password?: string) {
  let doc = open.get(key);
  if (!doc) {
    doc = getFile(key).then((blob) => {
      if (!blob) throw new Error('This PDF is missing from this browser’s storage.');
      return openPdf(blob, password);
    });
    // A failure must not stay cached, or the document could not be retried without a reload.
    doc.catch(() => open.delete(key));
    open.set(key, doc);
  }
  return doc;
}

/** Each page's text, joined the way it reads, for search. */
export function pageTexts(docId: string, password?: string) {
  const key = files.key(docId);
  let pages = texts.get(key);
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
    pages.catch(() => texts.delete(key));
    texts.set(key, pages);
  }
  return pages;
}

let measure: OffscreenCanvasRenderingContext2D | null = null;

/**
 * Each word on a page with its middle as fractions of the page, in reading order, and whether a
 * line ends after it. pdf.js gives runs of text with their width; where each word of a run lies is
 * estimated from the widths of its letters in a similar font.
 */
async function wordsOn(docId: string, password: string | undefined, pageNo: number) {
  const page = await (await loadDoc(docId, password)).getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  const { items, styles } = await page.getTextContent();
  measure ??= new OffscreenCanvas(1, 1).getContext('2d')!;
  const words: { text: string; x: number; y: number; eol: boolean }[] = [];
  for (const item of items) {
    if (!('str' in item) || !item.str.trim()) continue;
    measure.font = `100px ${styles[item.fontName]?.fontFamily ?? 'sans-serif'}`;
    const scale = item.width / (measure.measureText(item.str).width || 1);
    const [a, b, c, d, e, f] = item.transform as number[];
    const along = Math.hypot(a!, b!) || 1;
    const found = [...item.str.matchAll(/\S+/g)];
    for (const [i, m] of found.entries()) {
      // Halfway along the word on its baseline, then half up its height, whatever the rotation.
      const mid = ((measure.measureText(item.str.slice(0, m.index)).width + measure.measureText(item.str.slice(0, m.index + m[0].length)).width) / 2) * scale;
      const [vx, vy] = viewport.convertToViewportPoint(e! + (a! / along) * mid + c! / 2, f! + (b! / along) * mid + d! / 2) as [number, number];
      words.push({ text: m[0], x: vx / viewport.width, y: vy / viewport.height, eol: i === found.length - 1 && item.hasEOL });
    }
  }
  return words;
}

/** The words whose middles lie inside any of the boxes on a page, in reading order. */
export async function textIn(docId: string, password: string | undefined, pageNo: number, rects: Rect[]) {
  const inside = (w: { x: number; y: number }) => rects.some(([x, y, rw, rh]) => w.x >= x && w.x <= x + rw && w.y >= y && w.y <= y + rh);
  const text = (await wordsOn(docId, password, pageNo))
    .filter(inside)
    .map((w) => w.text + (w.eol ? '\n' : ' '))
    .join('');
  return cleanText(text);
}

/**
 * A box of a page drawn as an image, at `scale` pixels per PDF point, as an object URL. Kept in
 * memory only: images are drawn again from the PDF after a reload rather than stored.
 */
export function regionImage(docId: string, password: string | undefined, pageNo: number, [x, y, w, h]: Rect, scale: number) {
  const key = `${files.key(docId)}:${pageNo}:${x},${y},${w},${h}@${scale}`;
  let url = images.get(key);
  if (!url) {
    url = loadDoc(docId, password).then(async (doc) => {
      const page = await doc.getPage(pageNo);
      const full = page.getViewport({ scale: 1 });
      // A whole page at a high resolution would take hundreds of megabytes on a phone.
      const viewport = page.getViewport({ scale: Math.min(scale, MAX_IMAGE_SIDE / Math.max(w * full.width, h * full.height)) });
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

/**
 * Closes a version of a file no longer kept. Its pictures stay: a card can still show one until it
 * redraws, and they are the same pixels as the current version's where its page did not change.
 */
export function forgetFile(key: string) {
  open.get(key)?.then(
    (o) => o.close(),
    () => {},
  );
  open.delete(key);
  texts.delete(key);
  for (const k of images.keys()) if (k.startsWith(`${key}:`)) images.delete(k);
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
