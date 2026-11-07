import { COLORS, HUES, type Color } from './types';

/** Each hue's light fill, deep fill and edge, as Tailwind's 300, 400 and 600 shades. `purple` is violet, as it was when there were five. */
const SHADES: Record<(typeof HUES)[number], [string, string, string]> = {
  red: ['#fca5a5', '#f87171', '#dc2626'],
  orange: ['#fdba74', '#fb923c', '#ea580c'],
  amber: ['#fcd34d', '#fbbf24', '#d97706'],
  yellow: ['#fde047', '#facc15', '#ca8a04'],
  lime: ['#bef264', '#a3e635', '#65a30d'],
  green: ['#86efac', '#4ade80', '#16a34a'],
  teal: ['#5eead4', '#2dd4bf', '#0d9488'],
  cyan: ['#67e8f9', '#22d3ee', '#0891b2'],
  sky: ['#7dd3fc', '#38bdf8', '#0284c7'],
  blue: ['#93c5fd', '#60a5fa', '#2563eb'],
  indigo: ['#a5b4fc', '#818cf8', '#4f46e5'],
  purple: ['#c4b5fd', '#a78bfa', '#7c3aed'],
  fuchsia: ['#f0abfc', '#e879f9', '#c026d3'],
  pink: ['#f9a8d4', '#f472b6', '#db2777'],
  rose: ['#fda4af', '#fb7185', '#e11d48'],
  gray: ['#d4d4d8', '#a1a1aa', '#52525b'],
};

/** `fill` paints a highlight; `edge` outlines it on paper, and stands for it in lines and borders on a light screen. */
export type Swatch = { name: string; fill: string; edge: string };

export const hueOf = (c: Color) => (c.startsWith('deep-') ? c.slice(5) : c) as (typeof HUES)[number];
export const SWATCHES = Object.fromEntries(
  COLORS.map((c) => {
    const [light, deep, edge] = SHADES[hueOf(c)];
    const deepOne = c.startsWith('deep-');
    const name = `${deepOne ? 'deep ' : ''}${hueOf(c)}`;
    return [c, { name, fill: deepOne ? deep : light, edge }];
  }),
) as Record<Color, Swatch>;

export const isColor = (c: unknown): c is Color => typeof c === 'string' && c in SWATCHES;
/** A colour from another device or an older backup that this version does not know is shown as yellow. */
export const swatchOf = (c: string) => SWATCHES[isColor(c) ? c : 'yellow'];

/**
 * Every colour as CSS, so styles.css and the PDF export share these values. `--edge` is the fill
 * itself on a dark screen, where the deep edges would sink into the panel; inside a PDF page it is
 * always the paper edge, as the page stays white.
 */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

function css() {
  const vars = COLORS.map((c) => `--hl-${c}: ${SWATCHES[c].fill}; --edge-${c}: light-dark(${SWATCHES[c].edge}, ${SWATCHES[c].fill});`).join('\n');
  // The edges again as RGB channels, for a canvas whose accent, a channel token, is one of them.
  const channels = (shade: 'edge' | 'fill') => COLORS.map((c) => `--edge-${c}-rgb: ${rgb(SWATCHES[c][shade])};`).join('\n');
  const classes = COLORS.map((c) => `.hl-${c} { --hl: var(--hl-${c}); --edge: var(--edge-${c}); }\n.page .hl-${c} { --edge: ${SWATCHES[c].edge}; }`).join('\n');
  return `:root {\n${vars}\n}\n:root, .export-stage.light {\n${channels('edge')}\n}\n.dark {\n${channels('fill')}\n}\n${classes}`;
}

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.dataset.palette = '';
  style.textContent = css();
  document.head.append(style);
}
