import { getStroke } from 'perfect-freehand';
import type { Handwriting, InkColor, Nib, Point } from './types';

/** Colours for paper (PDF pages and exported files) and for the canvas, where "ink" follows the theme. */
export const PAPER: Record<InkColor, string> = {
  ink: '#1f2937',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#eab308',
};
export const SCREEN: Record<InkColor, string> = {
  ...PAPER,
  ink: 'var(--text)',
};

/** How much of a highlighter's colour covers what is under it. */
export const MARKER_ALPHA = 0.4;
/** Pen widths, as multiples of a side's own; a highlighter is wider still, to cover a line of text. */
export const WIDTHS = { fine: 0.5, medium: 1, bold: 2 } as const;
export type Width = keyof typeof WIDTHS;
const MARKER_WIDTH = 4;
export const strokeSize = (base: number, width: Width, nib: Nib) => base * WIDTHS[width] * (nib === 'marker' ? MARKER_WIDTH : 1);

/** A calligraphy nib is held at 45 degrees: thinnest drawn along that slant, widest across it. */
const NIB_ANGLE = Math.PI / 4;
/** Neighbours either side a calligraphy stroke's direction is taken over, as single pointer steps jitter. */
const REACH = 2;

/** Pressure for a calligraphy stroke from its direction at each point, which perfect-freehand then turns into width. */
const slanted = (points: Point[]): Point[] =>
  points.map(([x, y], i) => {
    const [ax, ay] = points[Math.max(0, i - REACH)]!;
    const [bx, by] = points[Math.min(points.length - 1, i + REACH)]!;
    return [x, y, ax === bx && ay === by ? 0.5 : 0.1 + 0.9 * Math.abs(Math.sin(Math.atan2(by - ay, bx - ax) - NIB_ANGLE))];
  });

/**
 * The outline of a stroke, as a closed polygon. A finger or mouse has no pressure, so it is
 * guessed from speed; a pen's own pressure is used as is. A straight line is only its two ends, which
 * give no speed to guess from. perfect-freehand works in screen pixels (its speed and spacing rules
 * assume them), so a stroke kept in other units is drawn at `scale` pixels per unit and scaled back.
 */
export function outline(points: Point[], { size, pen, nib }: Pick<Handwriting, 'size' | 'pen' | 'nib'>, scale = 1): [number, number][] {
  const calligraphy = nib === 'calligraphy';
  const stroke = getStroke(
    (calligraphy ? slanted(points) : points).map(([x, y, p]) => [x * scale, y * scale, p]),
    {
      size: size * scale,
      thinning: nib === 'ballpoint' || nib === 'marker' ? 0 : calligraphy ? 0.85 : 0.55,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: !pen && !calligraphy && points.length > 2,
      last: true,
    },
  );
  return stroke.map(([x, y]) => [x! / scale, y! / scale]);
}

/** How a stroke is filled in SVG: a highlighter lets what is under it show through. */
export const fillOf = ({ color, nib }: Pick<Handwriting, 'color' | 'nib'>, colours: Record<InkColor, string>) => ({
  fill: colours[color],
  fillOpacity: nib === 'marker' ? MARKER_ALPHA : undefined,
});

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

/** Still for this long at the end of a stroke, a pen turns it into a straight line. */
const HOLD_MS = 500;
/** Moves within this many screen pixels count as holding still. */
const HOLD_SLOP = 4;

/**
 * Follows a stroke as it is drawn to tell when it is a straight line from where it started: while
 * Shift is held, or for good once the pen has rested at its end, after which the line still swings
 * to follow the pen until it lifts. `onSnap` redraws it when it snaps while the pen rests.
 */
export function ruler(onSnap: () => void) {
  let rest = { x: NaN, y: NaN };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  let shift = false;
  return {
    move(e: { clientX: number; clientY: number; shiftKey: boolean }) {
      shift = e.shiftKey;
      if (held || Math.hypot(e.clientX - rest.x, e.clientY - rest.y) < HOLD_SLOP) return;
      rest = { x: e.clientX, y: e.clientY };
      clearTimeout(timer);
      timer = setTimeout(() => ((held = true), onSnap()), HOLD_MS);
    },
    stop: () => clearTimeout(timer),
    /** The stroke's points, or its two ends while it is straight. */
    shape: (points: Point[]) => ((held || shift) && points.length > 1 ? [points[0]!, points.at(-1)!] : points),
  };
}
export type Ruler = ReturnType<typeof ruler>;
