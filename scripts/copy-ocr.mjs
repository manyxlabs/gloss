// Text recognition runs on this device: tesseract.js's worker, its WebAssembly core and the
// language data are served from Gloss's own origin rather than a CDN, so scans never leave the
// browser and recognition works offline once these have been fetched.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const out = 'public/ocr';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/lang`, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
// The core finds its .wasm beside the worker script. Only the LSTM engine is used.
for (const core of ['tesseract-core-simd-lstm', 'tesseract-core-lstm'])
  for (const ext of ['js', 'wasm']) cpSync(`node_modules/tesseract.js-core/${core}.${ext}`, `${out}/${core}.${ext}`);
for (const lang of ['eng', 'hin']) cpSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${out}/lang/${lang}.traineddata.gz`);
cpSync('node_modules/tesseract.js-core/LICENSE', `${out}/LICENSE`);
// Recognised Devanagari is written into PDFs in this font (SIL Open Font License).
cpSync('node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff', `${out}/NotoSansDevanagari.woff`);
