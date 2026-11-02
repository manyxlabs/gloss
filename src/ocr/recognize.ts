import type { Line } from 'tesseract.js';
import { loadDoc } from '../pdf/pdfjs';

/** A recognised word in PDF space: its baseline starts `at` and runs `along` the word; `up` is one em up from the baseline. */
export type Placed = { text: string; at: [number, number]; along: [number, number]; up: [number, number] };
export type PageWords = { page: number; words: Placed[] };

/** About 300 dots per inch, the resolution Tesseract reads best, within what a phone can hold. */
const SCALE = 300 / 72;
const MAX_SIDE = 4200;
/** Words read with less confidence than this are mostly marks in pictures. */
const MIN_CONFIDENCE = 30;
/** How far up an em the tallest letters of a line reach, in most typefaces. */
const ASCENT = 0.75;

const ocrUrl = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href;

/**
 * Reads the text on pages of a document with Tesseract, in its own Web Worker with its WebAssembly
 * core and language data served from Gloss's origin. `progress` is told how far through the pages
 * it is, from 0 to 1. Aborting stops the worker at once.
 */
export async function recognize(docId: string, pages: number[], langs: string, progress: (done: number) => void, signal: AbortSignal): Promise<PageWords[]> {
  const [{ createWorker, OEM }, { simd }] = await Promise.all([import('tesseract.js'), import('wasm-feature-detect')]);
  const stopped = new Promise<never>((_, reject) => {
    const stop = () => reject(new DOMException('Text recognition was cancelled.', 'AbortError'));
    if (signal.aborted) stop();
    signal.addEventListener('abort', stop, { once: true });
  });
  stopped.catch(() => {});
  let at = 0;
  const starting = createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: ocrUrl('worker.min.js'),
    corePath: ocrUrl((await simd()) ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'),
    langPath: ocrUrl('lang'),
    // The service worker keeps the files; Tesseract's own copy in IndexedDB would store them twice.
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: (m) => m.status === 'recognizing text' && progress((at + m.progress) / pages.length),
  });
  const quit = () =>
    void starting.then(
      (w) => w.terminate(),
      () => {},
    );
  try {
    const worker = await Promise.race([starting, stopped]);
    const doc = await loadDoc(docId);
    const out: PageWords[] = [];
    for (const n of pages) {
      const page = await doc.getPage(n);
      const full = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(SCALE, MAX_SIDE / Math.max(full.width, full.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await Promise.race([page.render({ canvas, viewport }).promise, stopped]);
      const image = await new Promise<Blob | null>((done) => canvas.toBlob(done));
      canvas.width = canvas.height = 0;
      if (!image) throw new Error('The page could not be drawn for reading.');
      const { data } = await Promise.race([worker.recognize(image, {}, { blocks: true, text: false }), stopped]);
      const toPdf = (x: number, y: number) => viewport.convertToPdfPoint(x, y) as [number, number];
      const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      out.push({ page: n, words: lines.flatMap((line) => place(line, toPdf)) });
      progress(++at / pages.length);
    }
    return out;
  } finally {
    quit();
  }
}

/**
 * Where to write a line's words so that a reader's text layer puts each over its picture: the
 * words of one line share a size, from the line's tallest letters down to its baseline, so the
 * selection runs evenly along the line; each word is stretched to its own width.
 */
function place(line: Line, toPdf: (x: number, y: number) => [number, number]): Placed[] {
  const { baseline: b, bbox } = line;
  return line.words.flatMap((w) => {
    const text = w.text.trim();
    if (!text || w.confidence < MIN_CONFIDENCE) return [];
    const mid = (w.bbox.x0 + w.bbox.x1) / 2;
    const slope = b.x1 > b.x0 ? (b.y1 - b.y0) / (b.x1 - b.x0) : 0;
    // A baseline Tesseract could not fit sits at the bottom of the line.
    const fitted = b.y0 + slope * (mid - b.x0);
    const base = fitted > bbox.y0 && fitted <= bbox.y1 + 1 ? fitted : bbox.y1;
    const em = Math.max(1, (base - bbox.y0) / ASCENT);
    const at = toPdf(w.bbox.x0, base);
    const end = toPdf(w.bbox.x1, base);
    const top = toPdf(w.bbox.x0, base - em);
    return [{ text, at, along: [end[0] - at[0], end[1] - at[1]], up: [top[0] - at[0], top[1] - at[1]] }];
  });
}
