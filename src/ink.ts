import { getStroke } from 'perfect-freehand';
import type { InkColor, Point } from './types';

/** Colours for paper (PDF pages and exported files) and for the canvas, where "ink" follows the theme. */
export const PAPER: Record<InkColor, string> = {
  ink: '#1f2937',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
};
export const SCREEN: Record<InkColor, string> = {
  ...PAPER,
  ink: 'var(--text)',
};

/**
 * The outline of a stroke, as a closed polygon. A finger or mouse has no pressure, so it is
 * guessed from speed; a pen's own pressure is used as is. perfect-freehand works in screen
 * pixels (its speed and spacing rules assume them), so a stroke kept in other units is drawn
 * at `scale` pixels per unit and scaled back.
 */
export function outline(points: Point[], size: number, pen: boolean, scale = 1): [number, number][] {
  const stroke = getStroke(
    points.map(([x, y, p]) => [x * scale, y * scale, p]),
    { size: size * scale, thinning: 0.55, smoothing: 0.5, streamline: 0.45, simulatePressure: !pen, last: true },
  );
  return stroke.map(([x, y]) => [x! / scale, y! / scale]);
}

/** Page handwriting is kept in fractions of the page's width; it is shaped as if the page were this many pixels wide. */
export const PAGE_PIXELS = 800;

/** An SVG path for a polygon, smoothed through the midpoints of its edges. */
export function pathOf(poly: [number, number][]) {
  if (poly.length < 3) return '';
  const mid = (a: [number, number], b: [number, number]) => `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)}`;
  let d = `M${mid(poly[0]!, poly[1]!)} Q`;
  for (let i = 1; i < poly.length; i++) d += `${poly[i]![0].toFixed(2)},${poly[i]![1].toFixed(2)} ${mid(poly[i]!, poly[(i + 1) % poly.length]!)} `;
  return `${d}Z`;
}
