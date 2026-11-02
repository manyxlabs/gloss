// pdf.js fetches these at runtime by URL (fonts a PDF does not embed, CJK character maps,
// JPEG 2000 and JBIG2 decoders), so they are served as plain files next to the app.
import { cpSync, rmSync } from 'node:fs';

rmSync('public/pdfjs', { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
