import { outline, PAPER, pathOf } from './ink';
import type { Stroke } from './types';

/** Handwriting from a card, as exports draw it where it cannot be text: its strokes in a box of its own size, in canvas units. */
export type InkImage = { strokes: Stroke[]; width: number; height: number };

const paths = ({ strokes }: InkImage) => strokes.map((s) => ({ d: pathOf(outline(s.points, s.size, s.pen)), fill: PAPER[s.color] }));

/** As SVG, for Markdown, which takes it inline as a data address. */
export function inkSvg(ink: InkImage) {
  const body = paths(ink)
    .map((p) => `<path d="${p.d}" fill="${p.fill}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(ink.width)}" height="${Math.ceil(ink.height)}" viewBox="0 0 ${ink.width} ${ink.height}">${body}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** As a PNG at twice its size, for the PDF and Word notes, which take pictures but not SVG. */
export async function inkPng(ink: InkImage, scale = 2) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(ink.width * scale)), Math.max(1, Math.ceil(ink.height * scale)));
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.scale(scale, scale);
  for (const p of paths(ink)) {
    g.fillStyle = p.fill;
    g.fill(new Path2D(p.d));
  }
  return canvas.convertToBlob({ type: 'image/png' });
}

/** The image of a card's handwriting: an ink box at its size, or a note's strokes to where they reach. */
export function inkOf(strokes: Stroke[] | undefined, width?: number, height?: number): InkImage | undefined {
  if (!strokes?.length) return undefined;
  const reach = (i: 0 | 1) => Math.max(...strokes.flatMap((s) => s.points.map((p) => p[i] + s.size)));
  return { strokes, width: width ?? reach(0), height: height ?? reach(1) };
}
