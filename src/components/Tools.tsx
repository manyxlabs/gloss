import { Eraser, MousePointer2, PenLine } from 'lucide-react';
import { PAPER, SCREEN } from '../ink';
import { setTools, useStore, type Tool } from '../store/project';
import { INKS } from '../types';

const TOOLS: [Tool, string, typeof PenLine][] = [
  ['select', 'Select', MousePointer2],
  ['pen', 'Pen', PenLine],
  ['eraser', 'Eraser', Eraser],
];

/** Select, pen and eraser, with the pen's colours while it is chosen: as they show on paper, or on the canvas, where ink follows the theme. */
export function Tools({ side }: { side: 'docTool' | 'canvasTool' }) {
  const tool = useStore((s) => s[side]);
  const ink = useStore((s) => s.inkColor);
  return (
    <div className="tools" role="toolbar" aria-label={side === 'docTool' ? 'Document tools' : 'Canvas tools'}>
      {TOOLS.map(([id, label, Icon]) => (
        <button key={id} className="icon" aria-pressed={tool === id} aria-label={label} title={label} onClick={() => setTools({ [side]: id })}>
          <Icon size={17} />
        </button>
      ))}
      {tool === 'pen' &&
        INKS.map((c) => (
          <button
            key={c}
            className="ink-swatch"
            aria-pressed={ink === c}
            aria-label={`${c} ink`}
            title={`${c} ink`}
            style={{ color: (side === 'docTool' ? PAPER : SCREEN)[c] }}
            onClick={() => setTools({ inkColor: c })}
          />
        ))}
    </div>
  );
}
