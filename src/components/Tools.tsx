import { Eraser, Feather, Highlighter, MousePointer2, Pen, PenLine, PenTool, SquareDashed, Type } from 'lucide-react';
import { useState } from 'react';
import { PAPER, SCREEN, WIDTHS, type Width } from '../ink';
import { setInk, setTools, useStore, type DocTool } from '../store/project';
import { INKS, NIBS, type InkColor, type Nib } from '../types';
import { Menu } from './Menu';
import { m } from '../i18n';

const NIB_ICONS: Record<Nib, typeof PenLine> = { pressure: PenTool, ballpoint: Pen, calligraphy: Feather, marker: Highlighter };
/** How thick each width's button draws the nib. */
const THICKNESS: Record<Width, number> = { fine: 1.5, medium: 2, bold: 2.75 };

const TOOLS: [DocTool, typeof PenLine][] = [
  ['select', MousePointer2],
  ['pen', PenLine],
  ['eraser', Eraser],
  ['snip', SquareDashed],
  ['text', Type],
];
const TITLES: Partial<Record<DocTool, string>> = m.canvasTools.titles;

/** Select, pen and eraser, and on documents snip, which boxes a figure, and text boxes; with the pen's style while it is chosen. */
export function Tools({ side }: { side: 'docTool' | 'canvasTool' }) {
  const tool = useStore((s) => s[side]);
  return (
    <div className="tools" role="toolbar" aria-label={side === 'docTool' ? m.canvasTools.docTools : m.canvasTools.canvasTools}>
      {TOOLS.filter(([id]) => side === 'docTool' || (id !== 'snip' && id !== 'text')).map(([id, Icon]) => (
        <button
          key={id}
          className="icon"
          aria-pressed={tool === id}
          aria-label={m.canvasTools.tools[id]}
          title={TITLES[id] ?? m.canvasTools.tools[id]}
          onClick={() => setTools({ [side]: id })}
        >
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
  const Icon = NIB_ICONS[nib];
  return (
    <>
      <button
        className="icon"
        aria-label={m.canvasTools.inkStyle}
        title={m.canvasTools.inkStyleNow(m.canvasTools.inks[inkColor], m.canvasTools.nibs[nib], m.canvasTools.widths[width])}
        aria-expanded={!!anchor}
        style={{ color: SCREEN[inkColor] }}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Icon size={17} strokeWidth={THICKNESS[width]} />
      </button>
      {anchor && (
        <Menu anchor={anchor} label={m.canvasTools.inkStyle} role="dialog" onClose={() => setAnchor(null)}>
          <div className="style-panel">
            <h3>{m.canvasTools.colour}</h3>
            <div className="ink-colours" role="group" aria-label={m.canvasTools.colour}>
              {INKS.map((c) => (
                <button
                  key={c}
                  className="ink-swatch"
                  aria-pressed={inkColor === c}
                  aria-label={m.canvasTools.inks[c]}
                  title={m.canvasTools.inks[c]}
                  style={{ color: colours[c] }}
                  onClick={() => setInk({ inkColor: c })}
                />
              ))}
            </div>
            <h3>{m.canvasTools.nib}</h3>
            <div className="nibs" role="group" aria-label={m.canvasTools.nib}>
              {NIBS.map((n) => {
                const NibIcon = NIB_ICONS[n];
                return (
                  <button key={n} className="ghost default" aria-pressed={nib === n} onClick={() => setInk({ nib: n })}>
                    <NibIcon size={16} aria-hidden="true" /> {m.canvasTools.nibs[n]}
                  </button>
                );
              })}
            </div>
            <h3>{m.canvasTools.width}</h3>
            <div className="segmented" role="group" aria-label={m.canvasTools.width}>
              {(Object.keys(WIDTHS) as Width[]).map((w) => (
                <button key={w} aria-pressed={width === w} onClick={() => setInk({ inkWidth: w })}>
                  {m.canvasTools.widths[w]}
                </button>
              ))}
            </div>
            <p className="hint">{m.canvasTools.straightHint}</p>
          </div>
        </Menu>
      )}
    </>
  );
}
