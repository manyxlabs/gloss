import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type RGB } from 'pdf-lib';
import { embeddable } from './image';

export type Run = { text: string; bold?: boolean; italic?: boolean; mono?: boolean; link?: boolean };
export type Block =
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'para'; runs: Run[]; muted?: boolean }
  | { kind: 'list'; ordered: boolean; start?: number; items: Block[][] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'code'; text: string }
  | { kind: 'image'; data: Blob }
  | { kind: 'table'; rows: { head: boolean; cells: Run[][] }[] }
  | { kind: 'rule' }
  | { kind: 'page' };

export type Size = [width: number, height: number];
export const A4: Size = [595.28, 841.89];

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.47);
const LINK = rgb(0.2, 0.24, 0.72);
const TINT = rgb(0.95, 0.95, 0.97);
const LINE = rgb(0.84, 0.84, 0.88);
const BODY = 11;
const HEADINGS = [22, 17, 14, 12.5, 11.5, 11];

const FACES = { r: 'NotoSans-Regular', b: 'NotoSans-Bold', i: 'NotoSans-Italic', bi: 'NotoSans-BoldItalic', m: 'NotoSansMono-Regular' } as const;
// List markers use a font of their own, or pdf.js would join them to the item's text and every excerpt of an item would start with its bullet.
type Face = keyof typeof FACES | 'marker';
const fontFiles = new Map<Face, Promise<ArrayBuffer>>();
export function fontFile(face: keyof typeof FACES) {
  let file = fontFiles.get(face);
  if (!file) {
    file = fetch(`${import.meta.env.BASE_URL}fonts/${FACES[face]}.ttf`).then((r) => {
      if (!r.ok) throw new Error('The fonts for typesetting could not be loaded.');
      return r.arrayBuffer();
    });
    file.catch(() => fontFiles.delete(face));
    fontFiles.set(face, file);
  }
  return file;
}

const UNSHAPED =
  'Some text uses a script Gloss cannot typeset yet (such as Devanagari, Arabic, Hebrew, Thai or Chinese), so it was added as a picture that cannot be selected or searched.';
const MISSING = 'Some characters in tables or code could not be shown and were replaced with “?”.';

/** y is measured down from the top of the page; for text it is the baseline. */
type Op =
  | { t: 'text'; x: number; y: number; text: string; font: PDFFont; size: number; color: RGB }
  | { t: 'image'; x: number; y: number; w: number; h: number; image: PDFImage }
  | { t: 'box'; x: number; y: number; w: number; h: number; color: RGB };
type Piece = { text: string; font: PDFFont; size: number; color: RGB };
type Style = { size: number; bold?: boolean; italic?: boolean; color?: RGB };

// Invisible characters that fonts lack glyphs for; controls other than line breaks are dropped too.
const clean = (s: string) =>
  s
    .normalize('NFC')
    .replace(/\t/g, '    ')
    .replace(/(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '');
const covers = new WeakMap<PDFFont, Set<number>>();
export const covered = (font: PDFFont, text: string) => {
  let set = covers.get(font);
  if (!set) covers.set(font, (set = new Set(font.getCharacterSet())));
  for (const ch of text) if (!/\s/.test(ch) && !set.has(ch.codePointAt(0)!)) return false;
  return true;
};
const widthOf = (p: Piece) => p.font.widthOfTextAtSize(p.text, p.size);

let lastBreath = 0;
/** Gives the browser a moment to paint and take input during a long conversion. */
async function breathe() {
  if (performance.now() - lastBreath < 30) return;
  await new Promise((r) => setTimeout(r));
  lastBreath = performance.now();
}

/** Follows a long layout page by page, and stops it. */
export type Watch = { signal?: AbortSignal; onPage?: (page: number) => void };

/** Lays out blocks as pages of drawing operations, and draws them into a PDF. */
export class Typesetter {
  readonly warnings = new Set<string>();
  watch: Watch = {};
  private fonts = new Map<Face, Promise<PDFFont>>();
  private images = new Map<Blob, Promise<PDFImage | null>>();

  private constructor(readonly pdf: PDFDocument) {}

  static async create(title: string) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(title);
    pdf.setCreator('Gloss');
    return new Typesetter(pdf);
  }

  font(face: Face) {
    let font = this.fonts.get(face);
    if (!font)
      this.fonts.set(face, (font = face === 'marker' ? this.pdf.embedFont(StandardFonts.Helvetica) : fontFile(face).then((bytes) => this.pdf.embedFont(bytes, { subset: true }))));
    return font;
  }

  /** The image ready to draw, or null with a warning when it cannot be decoded. */
  image(data: Blob) {
    let image = this.images.get(data);
    if (!image) {
      image = embeddable(data).then(
        ({ bytes, type }) => (type === 'png' ? this.pdf.embedPng(bytes) : this.pdf.embedJpg(bytes)),
        () => {
          this.warnings.add('An image in an unsupported format was left out.');
          return null;
        },
      );
      this.images.set(data, image);
    }
    return image;
  }

  /** `zoom` scales all type, `shrink` caps an image's height to that share of the page. */
  async layout(blocks: Block[], size: Size, margin: number, zoom = 1, shrink = 1) {
    const flow = new Flow(this, size, margin, zoom, shrink);
    await flow.blocks(blocks, margin, size[0] - 2 * margin, false);
    return flow.pages;
  }

  draw(pages: Op[][], [width, height]: Size) {
    for (const ops of pages) {
      const page = this.pdf.addPage([width, height]);
      for (const o of ops) {
        if (o.t === 'text') page.drawText(o.text, { x: o.x, y: height - o.y, size: o.size, font: o.font, color: o.color });
        else if (o.t === 'image') page.drawImage(o.image, { x: o.x, y: height - o.y - o.h, width: o.w, height: o.h });
        else page.drawRectangle({ x: o.x, y: height - o.y - o.h, width: o.w, height: o.h, color: o.color });
      }
    }
  }

  /** One page per image, each page the image's own shape. */
  async drawImage(data: Blob) {
    const image = await this.image(data);
    if (!image) return false;
    const k = A4[1] / Math.max(image.width, image.height);
    const [w, h] = [image.width * k, image.height * k];
    this.draw([[{ t: 'image', x: 0, y: 0, w, h, image }]], [w, h]);
    return true;
  }
}

/** Typesets blocks on A4 pages. */
export async function typeset(title: string, blocks: Block[], watch: Watch = {}) {
  const ts = await Typesetter.create(title);
  ts.watch = watch;
  ts.draw(await ts.layout(blocks, A4, 64), A4);
  return { bytes: await ts.pdf.save(), warnings: [...ts.warnings] };
}

class Flow {
  pages: Op[][] = [[]];
  y: number;

  constructor(
    private ts: Typesetter,
    private size: Size,
    private margin: number,
    private zoom: number,
    private shrink: number,
  ) {
    this.y = margin;
  }

  private get bottom() {
    return this.size[1] - this.margin;
  }
  private get ops() {
    return this.pages.at(-1)!;
  }
  private newPage() {
    this.pages.push([]);
    this.y = this.margin;
  }
  /** Starts a new page unless `h` fits, or the page is still empty and nothing would fit better. */
  private room(h: number) {
    if (this.y + h > this.bottom && this.y > this.margin) this.newPage();
  }
  private gap(h: number) {
    if (this.y > this.margin) this.y += h;
  }

  private async face(run: Partial<Run>, style: Style) {
    const bold = run.bold || style.bold;
    const italic = run.italic || style.italic;
    return this.ts.font(run.mono ? 'm' : bold && italic ? 'bi' : bold ? 'b' : italic ? 'i' : 'r');
  }

  /** Breaks runs into lines no wider than `width`. Words keep their trailing space so a line drawn piece by piece still reads with its spaces. */
  private async wrap(runs: Run[], style: Style, width: number, pre = false) {
    const words: (Piece[] | 'br')[] = [];
    let word: Piece[] = [];
    for (const run of runs) {
      const font = await this.face(run, style);
      const color = run.link ? LINK : (style.color ?? INK);
      for (const [text] of clean(run.text).matchAll(/\n|[^\s]+[^\S\n]*|[^\S\n]+/g)) {
        if (text === '\n') {
          if (word.length) words.push(word);
          words.push('br');
          word = [];
          continue;
        }
        word.push({ text, font, size: style.size, color });
        if (/\s$/.test(text)) {
          words.push(word);
          word = [];
        }
      }
    }
    if (word.length) words.push(word);

    const lines: Piece[][] = [];
    let line: Piece[] = [];
    let used = 0;
    const end = () => {
      lines.push(line);
      line = [];
      used = 0;
    };
    for (const w of words) {
      if (w === 'br') {
        end();
        continue;
      }
      const full = w.reduce((s, p) => s + widthOf(p), 0);
      const last = w.at(-1)!;
      const bare = full - widthOf(last) + widthOf({ ...last, text: last.text.trimEnd() });
      if (!line.length && !bare && !pre) continue;
      if (line.length && used + bare > width) end();
      if (bare <= width) {
        line.push(...w);
        used += full;
        continue;
      }
      // A word wider than the line, such as a long address, is broken between characters.
      for (const p of w)
        for (const ch of p.text) {
          const piece = { ...p, text: ch };
          if (used + widthOf(piece) > width && line.length) end();
          line.push(piece);
          used += widthOf(piece);
        }
    }
    if (line.length) end();
    // Neighbouring pieces in one style are drawn as one, so the text layer gets whole phrases.
    return lines.map((l) =>
      l.reduce<Piece[]>((out, p) => {
        const prev = out.at(-1);
        if (prev && prev.font === p.font && prev.color === p.color) prev.text += p.text;
        else out.push({ ...p });
        return out;
      }, []),
    );
  }

  private async text(runs: Run[], style: Style, x: number, width: number, leading = 1.45) {
    const lh = style.size * leading;
    if (!covered(await this.face({}, style), runs.map((r) => clean(r.text)).join(''))) return this.picture(runs, style, x, width, lh);
    for (const line of await this.wrap(runs, style, width)) {
      this.room(lh);
      let cx = x;
      line.forEach((p, i) => {
        this.ops.push({ t: 'text', x: cx, y: this.y + (lh + style.size * 0.7) / 2, ...p, text: i === line.length - 1 ? p.text.trimEnd() : p.text });
        cx += widthOf(p);
      });
      this.y += lh;
    }
  }

  /**
   * pdf-lib places glyphs one after another without shaping, which garbles scripts whose letters join or reorder.
   * The browser shapes them correctly on a canvas, so such a paragraph is drawn there and placed as an image, line by line.
   */
  private async picture(runs: Run[], style: Style, x: number, width: number, lh: number) {
    this.ts.warnings.add(UNSHAPED);
    const k = 3;
    const text = runs.map((r) => r.text).join('');
    const font = `${style.bold ? 'bold ' : ''}${style.size * k}px "Noto Sans", sans-serif`;
    const measure = new OffscreenCanvas(1, 1).getContext('2d')!;
    measure.font = font;
    const fits = (s: string) => measure.measureText(s).width / k <= width;
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(para)) {
        if (fits(line + segment) || !line) line += segment;
        else {
          lines.push(line.trimEnd());
          line = segment.trimStart();
        }
      }
      lines.push(line);
    }
    const rtl = /^[^\p{L}]*[֐-ࣿיִ-﷿ﹰ-ﻼ]/u.test(text);
    for (const line of lines) {
      this.room(lh);
      const canvas = new OffscreenCanvas(Math.ceil(width * k), Math.ceil(lh * k));
      const g = canvas.getContext('2d')!;
      g.font = font;
      g.fillStyle = '#1a1a1f';
      g.direction = rtl ? 'rtl' : 'ltr';
      g.fillText(line, rtl ? canvas.width : 0, ((lh + style.size * 0.7) / 2) * k);
      const image = await this.ts.image(await canvas.convertToBlob({ type: 'image/png' }));
      if (image) this.ops.push({ t: 'image', x, y: this.y, w: width, h: lh, image });
      this.y += lh;
    }
  }

  /** Text that must stay on its grid, in tables and code, swaps characters the font lacks for “?”. */
  private async plain(runs: Run[], style: Style) {
    const out: Run[] = [];
    for (const run of runs) {
      const font = await this.face(run, style);
      let text = '';
      for (const ch of clean(run.text)) text += covered(font, ch) ? ch : '?';
      if (text !== clean(run.text)) this.ts.warnings.add(MISSING);
      out.push({ ...run, text });
    }
    return out;
  }

  async blocks(blocks: Block[], x: number, width: number, tight: boolean) {
    for (const b of blocks) {
      await this.block(b, x, width, tight);
      await breathe();
      this.ts.watch.signal?.throwIfAborted();
      this.ts.watch.onPage?.(this.pages.length);
    }
  }

  private async block(b: Block, x: number, width: number, tight: boolean) {
    const z = this.zoom;
    const body = BODY * z;
    switch (b.kind) {
      case 'heading': {
        const size = HEADINGS[Math.min(Math.max(b.level, 1), 6) - 1]! * z;
        this.gap(size * 0.8);
        // Keeps a heading with the first lines under it.
        this.room(size * 1.3 + body * 3);
        await this.text(b.runs, { size, bold: true }, x, width, 1.3);
        this.y += size * 0.35;
        break;
      }
      case 'para':
        await this.text(b.runs, { size: b.muted ? body * 0.9 : body, color: b.muted ? MUTED : INK }, x, width);
        this.y += tight ? body * 0.2 : body * 0.7;
        break;
      case 'list': {
        const indent = 20 * z;
        const font = await this.ts.font('marker');
        let n = b.start ?? 1;
        for (const item of b.items) {
          const lh = body * 1.45;
          this.room(lh);
          const marker = b.ordered ? `${n++}.` : x > this.margin ? '–' : '•';
          const mw = font.widthOfTextAtSize(marker, body);
          this.ops.push({ t: 'text', x: x + indent - 6 * z - mw, y: this.y + (lh + body * 0.7) / 2, text: marker, font, size: body, color: INK });
          await this.blocks(item, x + indent, width - indent, true);
        }
        this.y += tight ? 0 : body * 0.5;
        break;
      }
      case 'quote': {
        const [page, top] = [this.pages.length - 1, this.y];
        await this.blocks(b.blocks, x + 14 * z, width - 14 * z, tight);
        // The bar runs down every page the quote spans.
        for (let p = page; p < this.pages.length; p++) {
          const from = p === page ? top : this.margin;
          const to = p === this.pages.length - 1 ? this.y - body * 0.6 : this.bottom;
          if (to > from) this.pages[p]!.push({ t: 'box', x, y: from, w: 2.5 * z, h: to - from, color: LINE });
        }
        break;
      }
      case 'code': {
        const size = body * 0.85;
        const lh = size * 1.5;
        const pad = 6 * z;
        const style = { size };
        const runs = await this.plain([{ text: b.text, mono: true }], style);
        const lines = await this.wrap(runs, style, width - 2 * pad, true);
        // Each line carries its own share of the tinted box, so the block can break across pages anywhere.
        lines.forEach((line, i) => {
          const h = lh + (i === 0 ? pad : 0) + (i === lines.length - 1 ? pad : 0);
          this.room(h);
          this.ops.push({ t: 'box', x, y: this.y, w: width, h, color: TINT });
          const top = this.y + (i === 0 ? pad : 0);
          const p = line[0];
          // Indentation becomes an offset, so the text layer's span starts where the code does.
          const indent = p ? widthOf({ ...p, text: /^ */.exec(p.text)![0] }) : 0;
          if (p?.text.trim()) this.ops.push({ t: 'text', x: x + pad + indent, y: top + (lh + size * 0.7) / 2, ...p, text: p.text.trim() });
          this.y += h;
        });
        this.y += body * 0.7;
        break;
      }
      case 'image': {
        const image = await this.ts.image(b.data);
        if (!image) break;
        const k = Math.min(1, width / image.width, ((this.bottom - this.margin) * this.shrink) / image.height);
        const [w, h] = [image.width * k, image.height * k];
        this.room(h);
        this.ops.push({ t: 'image', x: x + (width - w) / 2, y: this.y, w, h, image });
        this.y += h + body * 0.7;
        break;
      }
      case 'table': {
        const cols = Math.max(0, ...b.rows.map((r) => r.cells.length));
        if (!cols) break;
        const size = body * 0.88;
        const lh = size * 1.35;
        const pad = 4 * z;
        const cw = width / cols;
        this.gap(body * 0.2);
        for (const row of b.rows) {
          const style = { size, bold: row.head };
          const cells = await Promise.all(row.cells.map(async (c) => this.wrap(await this.plain(c, style), style, cw - 2 * pad)));
          const h = Math.max(1, ...cells.map((c) => c.length)) * lh + 2 * pad;
          this.room(h);
          if (row.head) this.ops.push({ t: 'box', x, y: this.y, w: width, h, color: TINT });
          cells.forEach((lines, i) =>
            lines.forEach((line, j) => {
              let cx = x + i * cw + pad;
              for (const p of line) {
                this.ops.push({ t: 'text', x: cx, y: this.y + pad + j * lh + (lh + size * 0.7) / 2, ...p });
                cx += widthOf(p);
              }
            }),
          );
          this.y += h;
          this.ops.push({ t: 'box', x, y: this.y - 0.5, w: width, h: 0.5, color: LINE });
        }
        this.y += body * 0.8;
        break;
      }
      case 'rule':
        this.gap(body * 0.4);
        this.room(body);
        this.ops.push({ t: 'box', x, y: this.y, w: width, h: 0.75, color: LINE });
        this.y += body;
        break;
      case 'page':
        if (this.y > this.margin) this.newPage();
    }
  }
}
