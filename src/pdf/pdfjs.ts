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

/** A word on a page: its middle, and its box from below the line to the top of its letters, in page fractions. */
export type Word = { text: string; mid: [number, number]; box: Rect; eol: boolean };

/** The words of a page in reading order. A run is often a whole line; words are placed along it by their share of its characters. */
export async function wordsOn(docId: string, password: string | undefined, pageNo: number): Promise<Word[]> {
  const page = await (await loadDoc(docId, password)).getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  const at = (px: number, py: number) => {
    const [vx, vy] = viewport.convertToViewportPoint(px, py) as [number, number];
    return [vx / viewport.width, vy / viewport.height] as [number, number];
  };
  const out: Word[] = [];
  for (const item of (await page.getTextContent()).items) {
    if (!('str' in item)) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    const along = Math.hypot(a!, b!) || 1;
    const [ux, uy] = [((a! / along) * item.width) / (item.str.length || 1), ((b! / along) * item.width) / (item.str.length || 1)];
    const words = [...item.str.matchAll(/\S+/g)];
    words.forEach((m, i) => {
      const [from, to, mid] = [m.index, m.index + m[0].length, m.index + m[0].length / 2];
      // A quarter of the type size below the line holds descenders, as the text layer's own boxes do.
      const corners = [from, to].flatMap((k) => [at(e! + ux * k - c! / 4, f! + uy * k - d! / 4), at(e! + ux * k + c!, f! + uy * k + d!)]);
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const [left, top] = [Math.min(...xs), Math.min(...ys)];
      out.push({
        text: m[0],
        mid: at(e! + ux * mid + c! / 2, f! + uy * mid + d! / 2),
        box: [left, top, Math.max(...xs) - left, Math.max(...ys) - top],
        eol: !!item.hasEOL && i === words.length - 1,
      });
    });
  }
  return out;
}

/** Words as text, joined as they read. */
export const joined = (words: Word[]) => cleanText(words.map((w) => w.text + (w.eol ? '\n' : ' ')).join(''));

/** The text whose middle lies inside a box on a page, in reading order. */
export async function textIn(docId: string, password: string | undefined, pageNo: number, [x, y, w, h]: Rect) {
  return joined((await wordsOn(docId, password, pageNo)).filter(({ mid: [fx, fy] }) => fx >= x && fx <= x + w && fy >= y && fy <= y + h));
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
