import { date, m } from '../i18n';
import { isPdf, ReaderError } from '../pdf/pdfjs';
import type { DocSource } from '../types';
import type { Problem } from '../../worker/problem';
import { kindOf } from './formats';
import { refusal } from './refusal';
import type { Block, Watch } from './typeset';

// The typesetter brings fonts and pdf-lib, so it loads only once something needs converting.
const typesetter = () => import('./typeset');
const html = () => import('./html');

/** A file to add, or a web page to fetch and add. */
export type Input = File | { url: string };
export type Converted = { name: string; data: Blob; source?: DocSource };
/** Lets a slow conversion, such as a long web page, be followed and stopped. */
export type ConvertOptions = { signal?: AbortSignal; onProgress?: (stage: string) => void };

const base = (name: string) => name.replace(/\.[^.]+$/, '') || name;
const asPdf = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });

async function decode(file: Blob) {
  const b = new Uint8Array(await file.arrayBuffer());
  const encoding = b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(b);
}

async function fromBlocks(name: string, blocks: Block[], source: DocSource, problems: string[], watch?: Watch): Promise<Converted> {
  const { bytes, warnings } = await (await typesetter()).typeset(name, blocks, watch);
  problems.push(...warnings.map((w) => m.engineConvert.warning(name, w)));
  return { name, data: asPdf(bytes), source };
}

async function fromDocx(file: File) {
  const { default: mammoth } = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return (await html()).htmlToBlocks(value);
}

async function fromPptx(file: File, problems: string[]): Promise<Converted> {
  const { readPptx } = await import('./pptx');
  const { size, slides } = readPptx(new Uint8Array(await file.arrayBuffer()));
  if (!slides.length) throw new ReaderError(m.engineConvert.noSlides);
  const name = base(file.name);
  const ts = await (await typesetter()).Typesetter.create(name);
  for (const slide of slides) {
    // Type shrinks until the slide fits on one page, as PowerPoint shrinks text to fit its box.
    let pages = await ts.layout(slide, size, 36, 1.6);
    for (const shrink of [0.85, 0.7, 0.55, 0.45]) {
      if (pages.length === 1) break;
      pages = await ts.layout(slide, size, 36, 1.6 * shrink, shrink);
    }
    ts.draw(pages, size);
  }
  problems.push(...[...ts.warnings].map((w) => m.engineConvert.warning(name, w)));
  return { name, data: asPdf(await ts.pdf.save()), source: { kind: 'pptx', name: file.name } };
}

async function fromImages(files: File[], problems: string[]): Promise<Converted | null> {
  const name = base(files[0]!.name);
  const ts = await (await typesetter()).Typesetter.create(name);
  for (const file of files) if (!(await ts.drawImage(file))) problems.push(m.engineConvert.notImage(file.name));
  if (!ts.pdf.getPageCount()) return null;
  return { name, data: asPdf(await ts.pdf.save()), source: { kind: 'image', name: files.map((f) => f.name).join(', ') } };
}

/** A file from a link, converted as if it had been opened here, remembering the link. */
async function fromLink(url: string, problems: string[], { signal, onProgress }: ConvertOptions): Promise<Converted[]> {
  const { fetchLinked } = await import('./link');
  onProgress?.(m.engineConvert.fetchingFile);
  const file = await fetchLinked(url, signal);
  onProgress?.(m.engineConvert.converting);
  const done = await convert([file], { signal });
  problems.push(...done.problems);
  return done.converted.map((c) => ({ ...c, source: { ...(c.source ?? { kind: 'link', name: file.name }), url } }));
}

/** A web page's article; null when the address is not a web page, as a link straight to a file. */
async function fromWeb(url: string, problems: string[], { signal, onProgress }: ConvertOptions): Promise<Converted | null> {
  onProgress?.(m.engineConvert.fetchingPage);
  const res = await fetch(`/api/page?url=${encodeURIComponent(url)}`, { signal });
  if (res.status === 415) return null;
  const page = (await res.json().catch((err: unknown) => (signal?.aborted ? Promise.reject(err) : null))) as {
    url: string;
    title: string;
    byline?: string;
    site?: string;
    html: string;
    error?: Problem;
  } | null;
  if (!res.ok || !page?.html) throw new ReaderError(page?.error ? (await import('./link')).told(page.error) : m.engineConvert.noPageServer);
  const by = [page.byline, page.site].filter(Boolean).join(' · ');
  const blocks: Block[] = [
    { kind: 'heading', level: 1, runs: [{ text: page.title }] },
    ...(by ? [{ kind: 'para', muted: true, runs: [{ text: by }] } satisfies Block] : []),
    { kind: 'para', muted: true, runs: [{ text: page.url, link: true }, { text: `\n${m.engineConvert.savedOn(date(new Date(), { dateStyle: 'long' }))}` }] },
    { kind: 'rule' },
    ...(await html()).htmlToBlocks(page.html),
  ];
  return fromBlocks(page.title, blocks, { kind: 'web', url: page.url }, problems, { signal, onPage: (n) => onProgress?.(m.engineConvert.convertingPage(n)) });
}

/**
 * Turns what was added into PDFs, since everything in Gloss is anchored to PDF pages: PDFs pass through,
 * images added together become one PDF in their order, and every other format is typeset with a real text layer.
 */
export async function convert(inputs: Input[], options: ConvertOptions = {}) {
  const converted: Converted[] = [];
  const problems: string[] = [];
  const kinds = await Promise.all(inputs.map(async (i) => ('url' in i ? 'web' : (await isPdf(i)) ? 'pdf' : kindOf(i))));
  const images = inputs.filter((_, i) => kinds[i] === 'image') as File[];
  for (const [i, input] of inputs.entries()) {
    const kind = kinds[i];
    try {
      if ('url' in input) {
        const { isFileLink } = await import('./link');
        const page = !isFileLink(input.url) && (await fromWeb(input.url, problems, options));
        converted.push(...(page ? [page] : await fromLink(input.url, problems, options)));
      } else if (kind === 'pdf') converted.push({ name: input.name.replace(/\.pdf$/i, ''), data: input });
      else if (kind === 'image') {
        const done = input === images[0] && (await fromImages(images, problems));
        if (done) converted.push(done);
      } else if (kind === 'pptx') converted.push(await fromPptx(input, problems));
      else if (kind === 'docx') converted.push(await fromBlocks(base(input.name), await fromDocx(input), { kind: 'docx', name: input.name }, problems));
      else if (kind === 'markdown' || kind === 'text') {
        const text = await decode(input);
        const { textToBlocks, markdownToBlocks } = await html();
        const blocks = kind === 'text' ? textToBlocks(text) : await markdownToBlocks(text);
        converted.push(await fromBlocks(base(input.name), blocks, { kind: 'text', name: input.name }, problems));
      } else problems.push(refusal(input.name));
    } catch (err) {
      if (options.signal?.aborted) throw err;
      const message = err instanceof ReaderError ? err.message : 'url' in input ? m.engineConvert.unreachable : m.engineConvert.unreadable;
      problems.push(m.engineConvert.notAdded('url' in input ? input.url : input.name, message));
    }
  }
  return { converted, problems };
}
