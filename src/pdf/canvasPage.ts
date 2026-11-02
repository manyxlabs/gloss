// A canvas drawn as one PDF page, in vectors: each card as a box with its text, figures as their
// pictures, handwriting as its strokes, and links as lines between cards. It is a plain drawing of
// the cards, not a picture of the canvas as styled on screen.
import fontkit from '@pdf-lib/fontkit';
import { rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { fontFile } from '../convert/typeset';
import { outline, PAPER, pathOf } from '../ink';
import { docName, where } from '../links';
import { canvasOf, CARD_WIDTH } from '../store/project';
import type { Card, Project } from '../types';
import { regionImage } from './pdfjs';

const MARGIN = 36;
/** The longest side of the page, in points; a larger canvas is scaled down to fit. */
const MAX_SIDE = 1600;
const PAD = 12;
const SIZE = 11;
const EDGES: Record<string, RGB> = {
  yellow: rgb(0.79, 0.54, 0.02),
  green: rgb(0.09, 0.64, 0.29),
  blue: rgb(0.15, 0.39, 0.92),
  pink: rgb(0.86, 0.15, 0.47),
  purple: rgb(0.49, 0.23, 0.93),
};
const TEXT = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.4, 0.4, 0.45);
const LINE = rgb(0.82, 0.83, 0.87);
const hex = (h: string) => rgb(...([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]));

/** Lines of text no wider than `width`, breaking between words, and inside a word too long for a line. */
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Adds a page showing a canvas's cards, where they are on it. Returns the page, or null for a canvas with no cards. */
export async function addCanvasPage(pdf: PDFDocument, project: Project, canvasId: string): Promise<PDFPage | null> {
  const cards = project.cards.filter((c) => canvasOf(project, c) === canvasId && !c.hidden);
  if (!cards.length) return null;
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await fontFile('r'), { subset: true });
  const bold = await pdf.embedFont(await fontFile('b'), { subset: true });

  // Cards in a group are placed from the group's corner.
  const byId = new Map(project.cards.map((c) => [c.id, c]));
  const box = (c: Card) => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return {
      x: c.position.x + (parent?.position.x ?? 0),
      y: c.position.y + (parent?.position.y ?? 0),
      w: c.measured?.width ?? c.width ?? CARD_WIDTH,
      h: c.measured?.height ?? c.height ?? 100,
    };
  };
  const boxes = new Map(cards.map((c) => [c.id, box(c)]));
  const all = [...boxes.values()];
  const [left, top] = [Math.min(...all.map((b) => b.x)), Math.min(...all.map((b) => b.y))];
  const [right, bottom] = [Math.max(...all.map((b) => b.x + b.w)), Math.max(...all.map((b) => b.y + b.h))];
  const s = Math.min(1, MAX_SIDE / Math.max(right - left, bottom - top));
  const page = pdf.addPage([(right - left) * s + 2 * MARGIN, (bottom - top) * s + 2 * MARGIN]);
  const H = page.getHeight();
  const X = (x: number) => MARGIN + (x - left) * s;
  const Y = (y: number) => H - MARGIN - (y - top) * s;

  for (const l of project.links) {
    const [a, b] = [boxes.get(l.source), boxes.get(l.target)];
    if (a && b) page.drawLine({ start: { x: X(a.x + a.w / 2), y: Y(a.y + a.h / 2) }, end: { x: X(b.x + b.w / 2), y: Y(b.y + b.h / 2) }, thickness: 1.2 * s, color: MUTED });
  }

  const text = (lines: string[], f: PDFFont, size: number, x: number, y: number, maxY: number, color = TEXT) => {
    let at = y;
    for (const line of lines) {
      if (at + size > maxY) break;
      page.drawText(line, { x: X(x), y: Y(at + size), size: size * s, font: f, color });
      at += size * 1.4;
    }
    return at;
  };

  // Groups first, so the cards in them are drawn over them.
  for (const c of [...cards].sort((a, b) => Number(b.data.kind === 'group') - Number(a.data.kind === 'group'))) {
    const b = boxes.get(c.id)!;
    const d = c.data;
    if (d.kind === 'ink') {
      page.drawSvgPath(pathOf(outline(d.points, d.size, d.pen)), { x: X(b.x), y: Y(b.y), scale: s, color: hex(PAPER[d.color]) });
      continue;
    }
    const edge = d.kind === 'excerpt' ? EDGES[project.highlights.find((h) => h.id === d.highlightId)?.color ?? ''] : undefined;
    page.drawRectangle({
      x: X(b.x),
      y: Y(b.y + b.h),
      width: b.w * s,
      height: b.h * s,
      color: d.kind === 'group' ? rgb(0.95, 0.95, 0.98) : rgb(1, 1, 1),
      borderColor: LINE,
      borderWidth: s,
    });
    if (edge) page.drawRectangle({ x: X(b.x), y: Y(b.y + b.h), width: 4 * s, height: b.h * s, color: edge });
    const inner = b.w - 2 * PAD;
    const end = b.y + b.h - PAD / 2;
    if (d.kind === 'group') text(wrap(d.title || 'Group', bold, SIZE + 1, inner).slice(0, 1), bold, SIZE + 1, b.x + PAD, b.y + PAD, end);
    else if (d.kind === 'note') text(wrap(d.text, font, SIZE, inner), font, SIZE, b.x + PAD, b.y + PAD, end);
    else if (d.kind === 'excerpt') {
      const h = project.highlights.find((x) => x.id === d.highlightId);
      if (!h) continue;
      let y = b.y + PAD;
      const part = h.parts[0];
      if (h.area && part?.rects[0]) {
        const doc = project.docs.find((x) => x.id === h.docId);
        const image = await regionImage(h.docId, doc?.password, part.page, part.rects[0], 2)
          .then(async (url) => pdf.embedPng(await (await fetch(url)).arrayBuffer()))
          .catch(() => null);
        if (image) {
          const w = Math.min(inner, image.width / 2);
          const ih = Math.min((w * image.height) / image.width, end - y - 2 * SIZE);
          page.drawImage(image, { x: X(b.x + PAD), y: Y(y + ih), width: (ih * image.width * s) / image.height, height: ih * s });
          y += ih + 6;
        }
      } else y = text(wrap(`“${h.text}”`, font, SIZE, inner), font, SIZE, b.x + PAD, y, end - SIZE * 1.6);
      if (d.comment) y = text(wrap(d.comment, font, SIZE, inner), font, SIZE, b.x + PAD, y + 4, end - SIZE * 1.6);
      text([`${docName(project, h.docId)} · ${where(h)}`], font, SIZE - 2, b.x + PAD, Math.max(y + 2, end - SIZE * 1.4), end + SIZE, MUTED);
    }
  }
  return page;
}
