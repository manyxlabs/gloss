import { Eraser, MousePointer2, PenLine, SquareDashed } from 'lucide-react';
import { PAPER, SCREEN } from '../ink';
import { setTools, useStore, type DocTool } from '../store/project';
import { INKS, type InkColor } from '../types';

const INK_NAMES: Record<InkColor, string> = { ink: 'Black ink', red: 'Red ink', blue: 'Blue ink', green: 'Green ink' };

const TOOLS: [DocTool, string, typeof PenLine][] = [
  ['select', 'Select', MousePointer2],
  ['pen', 'Pen', PenLine],
  ['eraser', 'Eraser', Eraser],
  ['snip', 'Snip', SquareDashed],
];

/** Select, pen and eraser, and on documents snip, which boxes a figure; with the pen's colours while it is chosen: as they show on paper, or on the canvas, where ink follows the theme. */
export function Tools({ side }: { side: 'docTool' | 'canvasTool' }) {
  const tool = useStore((s) => s[side]);
  const ink = useStore((s) => s.inkColor);
  return (
    <div className="tools" role="toolbar" aria-label={side === 'docTool' ? 'Document tools' : 'Canvas tools'}>
      {TOOLS.filter(([id]) => id !== 'snip' || side === 'docTool').map(([id, label, Icon]) => (
        <button
          key={id}
          className="icon"
          aria-pressed={tool === id}
          aria-label={label}
          title={id === 'snip' ? 'Snip: draw a box around a figure or table' : label}
          onClick={() => setTools({ [side]: id })}
        >
          <Icon size={17} />
        </button>
      ))}
      {tool === 'pen' &&
        INKS.map((c) => (
          <button
            key={c}
            className="ink-swatch"
            aria-pressed={ink === c}
            aria-label={INK_NAMES[c]}
            title={INK_NAMES[c]}
            style={{ color: (side === 'docTool' ? PAPER : SCREEN)[c] }}
            onClick={() => setTools({ inkColor: c })}
          />
        ))}
    </div>
  );
}
