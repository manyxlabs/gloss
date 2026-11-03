import { Eraser, Feather, Highlighter, MousePointer2, Pen, PenLine, PenTool, SquareDashed, Type } from 'lucide-react';
import { useState } from 'react';
import { PAPER, SCREEN, WIDTHS, type Width } from '../ink';
import { setInk, setTools, useStore, type DocTool } from '../store/project';
import { INKS, NIBS, type InkColor, type Nib } from '../types';
import { Menu } from './Menu';

const INK_NAMES: Record<InkColor, string> = { ink: 'Black ink', red: 'Red ink', blue: 'Blue ink', green: 'Green ink', yellow: 'Yellow ink' };
const NIB_NAMES: Record<Nib, [string, typeof PenLine]> = {
  pressure: ['Pressure', PenTool],
  ballpoint: ['Ballpoint', Pen],
  calligraphy: ['Calligraphy', Feather],
  marker: ['Highlighter', Highlighter],
};
/** Each width's name, and how thick its button draws the nib. */
const WIDTH_NAMES: Record<Width, [string, number]> = { fine: ['Fine', 1.5], medium: ['Medium', 2], bold: ['Bold', 2.75] };

const TOOLS: [DocTool, string, typeof PenLine][] = [
  ['select', 'Select', MousePointer2],
  ['pen', 'Pen', PenLine],
  ['eraser', 'Eraser', Eraser],
  ['snip', 'Snip', SquareDashed],
  ['text', 'Text box', Type],
];
const TITLES: Partial<Record<DocTool, string>> = { snip: 'Snip: draw a box around a figure or table', text: 'Text box: tap the page to type there' };

/** Select, pen and eraser, and on documents snip, which boxes a figure, and text boxes; with the pen's style while it is chosen. */
export function Tools({ side }: { side: 'docTool' | 'canvasTool' }) {
  const tool = useStore((s) => s[side]);
  return (
    <div className="tools" role="toolbar" aria-label={side === 'docTool' ? 'Document tools' : 'Canvas tools'}>
      {TOOLS.filter(([id]) => side === 'docTool' || (id !== 'snip' && id !== 'text')).map(([id, label, Icon]) => (
        <button key={id} className="icon" aria-pressed={tool === id} aria-label={label} title={TITLES[id] ?? label} onClick={() => setTools({ [side]: id })}>
          <Icon size={17} />
        </button>
      ))}
      {tool === 'pen' && <InkStyle colours={side === 'docTool' ? PAPER : SCREEN} />}
    </div>
  );
}

/**
 * The pen's nib in its colour, drawn as thick as it writes, opening its colours, nibs and widths. The
 * colours are as they show on paper, or on the canvas, where ink follows the theme.
 */
function InkStyle({ colours }: { colours: Record<InkColor, string> }) {
  const inkColor = useStore((s) => s.inkColor);
  const nib = useStore((s) => s.nib);
  const width = useStore((s) => s.inkWidth);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [nibName, Icon] = NIB_NAMES[nib];
  const [widthName, thickness] = WIDTH_NAMES[width];
  return (
    <>
      <button
        className="icon"
        aria-label="Ink style"
        title={`Ink style: ${INK_NAMES[inkColor]}, ${nibName}, ${widthName}`}
        aria-expanded={!!anchor}
        style={{ color: SCREEN[inkColor] }}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Icon size={17} strokeWidth={thickness} />
      </button>
      {anchor && (
        <Menu anchor={anchor} label="Ink style" role="dialog" onClose={() => setAnchor(null)}>
          <div className="style-panel">
            <h3>Colour</h3>
            <div className="ink-colours" role="group" aria-label="Colour">
              {INKS.map((c) => (
                <button
                  key={c}
                  className="ink-swatch"
                  aria-pressed={inkColor === c}
                  aria-label={INK_NAMES[c]}
                  title={INK_NAMES[c]}
                  style={{ color: colours[c] }}
                  onClick={() => setInk({ inkColor: c })}
                />
              ))}
            </div>
            <h3>Nib</h3>
            <div className="nibs" role="group" aria-label="Nib">
              {NIBS.map((n) => {
                const [name, NibIcon] = NIB_NAMES[n];
                return (
                  <button key={n} className="ghost default" aria-pressed={nib === n} onClick={() => setInk({ nib: n })}>
                    <NibIcon size={16} aria-hidden="true" /> {name}
                  </button>
                );
              })}
            </div>
            <h3>Width</h3>
            <div className="segmented" role="group" aria-label="Width">
              {(Object.keys(WIDTHS) as Width[]).map((w) => (
                <button key={w} aria-pressed={width === w} onClick={() => setInk({ inkWidth: w })}>
                  {WIDTH_NAMES[w][0]}
                </button>
              ))}
            </div>
            <p className="hint">Rest the pen at the end of a stroke, or hold Shift, for a straight line.</p>
          </div>
        </Menu>
      )}
    </>
  );
}
