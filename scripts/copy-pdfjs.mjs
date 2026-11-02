// pdf.js fetches these at runtime by URL (fonts a PDF does not embed, CJK character maps,
// JPEG 2000 and JBIG2 decoders, annotation icons), so they are served as plain files next to the app.
import { cpSync, readdirSync, rmSync } from 'node:fs';

rmSync('public/pdfjs', { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
// The icons pdf.js draws for sticky notes and other annotations without an appearance of their own.
for (const icon of readdirSync('node_modules/pdfjs-dist/web/images').filter((f) => f.startsWith('annotation-')))
  cpSync(`node_modules/pdfjs-dist/web/images/${icon}`, `public/pdfjs/images/${icon}`);
