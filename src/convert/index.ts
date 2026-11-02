import { isPdf } from '../pdf/pdfjs';
import type { DocSource } from '../types';
import { kindOf } from './formats';
import type { Block } from './typeset';

// The typesetter brings fonts and pdf-lib, so it loads only once something needs converting.
const typesetter = () => import('./typeset');
const html = () => import('./html');

/** A file to add, or a web page to fetch and add. */
export type Input = File | { url: string };
export type Converted = { name: string; data: Blob; source?: DocSource };

const base = (name: string) => name.replace(/\.[^.]+$/, '') || name;
const asPdf = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });

async function decode(file: Blob) {
  const b = new Uint8Array(await file.arrayBuffer());
  const encoding = b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(b);
}

async function fromBlocks(name: string, blocks: Block[], source: DocSource, problems: string[]): Promise<Converted> {
  const { bytes, warnings } = await (await typesetter()).typeset(name, blocks);
  problems.push(...warnings.map((w) => `${name}: ${w}`));
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
  if (!slides.length) throw new Error('It has no slides.');
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
  problems.push(...[...ts.warnings].map((w) => `${name}: ${w}`));
  return { name, data: asPdf(await ts.pdf.save()), source: { kind: 'pptx', name: file.name } };
}

async function fromImages(files: File[], problems: string[]): Promise<Converted | null> {
  const name = base(files[0]!.name);
  const ts = await (await typesetter()).Typesetter.create(name);
  for (const file of files) if (!(await ts.drawImage(file))) problems.push(`${file.name} could not be read as an image.`);
  if (!ts.pdf.getPageCount()) return null;
  return { name, data: asPdf(await ts.pdf.save()), source: { kind: 'image', name: files.map((f) => f.name).join(', ') } };
}

async function fromWeb(url: string, problems: string[]): Promise<Converted> {
  const res = await fetch(`/api/page?url=${encodeURIComponent(url)}`);
  const page = (await res.json().catch(() => null)) as { url: string; title: string; byline?: string; site?: string; html: string; error?: string } | null;
  if (!res.ok || !page?.html) throw new Error(page?.error ?? 'Web pages can be added only where Gloss runs with its server.');
  const by = [page.byline, page.site].filter(Boolean).join(' · ');
  const blocks: Block[] = [
    { kind: 'heading', level: 1, runs: [{ text: page.title }] },
    ...(by ? [{ kind: 'para', muted: true, runs: [{ text: by }] } satisfies Block] : []),
    { kind: 'para', muted: true, runs: [{ text: page.url, link: true }, { text: `\nSaved on ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}` }] },
    { kind: 'rule' },
    ...(await html()).htmlToBlocks(page.html),
  ];
  return fromBlocks(page.title, blocks, { kind: 'web', url: page.url }, problems);
}

const refusal = (file: File) =>
  /\.(doc|ppt|rtf|odt|odp)$/i.test(file.name)
    ? `${file.name} is in an older or other office format. Save it as .docx or .pptx and add that.`
    : `${file.name} is not a file Gloss can open. Add PDFs, Word (.docx) or PowerPoint (.pptx) files, images, or text and Markdown files.`;

/**
 * Turns what was added into PDFs, since everything in Gloss is anchored to PDF pages: PDFs pass through,
 * images added together become one PDF in their order, and every other format is typeset with a real text layer.
 */
export async function convert(inputs: Input[]) {
  const converted: Converted[] = [];
  const problems: string[] = [];
  const kinds = await Promise.all(inputs.map(async (i) => ('url' in i ? 'web' : (await isPdf(i)) ? 'pdf' : kindOf(i))));
  const images = inputs.filter((_, i) => kinds[i] === 'image') as File[];
  for (const [i, input] of inputs.entries()) {
    const kind = kinds[i];
    try {
      if ('url' in input) converted.push(await fromWeb(input.url, problems));
      else if (kind === 'pdf') converted.push({ name: input.name.replace(/\.pdf$/i, ''), data: input });
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
      } else problems.push(refusal(input));
    } catch (err) {
      // Library errors are not written for readers; only our own sentences are shown.
      const message =
        err instanceof Error && /^[A-Z].*\.$/.test(err.message)
          ? err.message
          : 'url' in input
            ? 'Gloss could not reach its server to fetch it.'
            : 'It may be damaged, or in a form Gloss does not read.';
      problems.push(`${'url' in input ? input.url : input.name} could not be added. ${message}`);
    }
  }
  return { converted, problems };
}
