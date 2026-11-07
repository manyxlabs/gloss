import { ArrowUp, ChevronRight, Paintbrush } from 'lucide-react';
import { useState } from 'react';
import { isLocalCanvas, pathTo } from '../canvases';
import { setCanvasLocal } from '../store/privacy';
import { setCanvasStyle } from '../store/cards';
import { setCanvas, useStore } from '../store/project';
import type { Background } from '../types';
import { PaletteGrid } from './ColorPicker';
import { CopyLink } from './LinkChips';
import { Menu } from './Menu';
import { PrivateSwitch } from './Private';
import { m } from '../i18n';

/** Where a nested canvas sits, from the top: each step opens that canvas, and Up the one it is in. */
export function CanvasPath() {
  const project = useStore((s) => s.project);
  const current = useStore((s) => s.canvasId);
  const path = project ? pathTo(project, current) : [];
  const parent = path.at(-2);
  if (!parent) return null;
  return (
    <nav className="canvas-path" aria-label={m.canvas.path}>
      <button className="icon" aria-label={m.canvas.upTo(parent.name)} title={m.canvas.upTo(parent.name)} onClick={() => setCanvas(parent.id)}>
        <ArrowUp size={16} />
      </button>
      <ol>
        {path.map((c, i) => (
          <li key={c.id}>
            {i < path.length - 1 ? (
              <>
                <button className="ghost" onClick={() => setCanvas(c.id)} title={c.name}>
                  <span>{c.name}</span>
                </button>
                <ChevronRight size={14} aria-hidden="true" />
              </>
            ) : (
              <span aria-current="page">{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const BACKGROUNDS: Background[] = ['dots', 'grid', 'lined', 'plain'];

/** How the canvas on show looks, with what else concerns the whole canvas below it. */
export function CanvasStyleMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button className="icon overflow" aria-label={m.canvas.style} title={m.canvas.style} aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <Paintbrush size={16} />
      </button>
      {anchor && <CanvasStylePanel anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
}

/** The canvas style itself, opened from its button or, where the canvas tools are short of room, from their More. */
export function CanvasStylePanel({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const canvas = useStore((s) => s.project?.canvases.find((c) => c.id === s.canvasId));
  const project = useStore((s) => s.project);
  if (!canvas) return null;
  const background = canvas.background ?? 'dots';
  const inherited = !!project && !canvas.local && isLocalCanvas(project, canvas.id);
  return (
    <Menu anchor={anchor} label={m.canvas.style} role="dialog" onClose={onClose}>
      <div className="style-panel">
        <h3>{m.canvas.background}</h3>
        <div className="segmented" role="group" aria-label={m.canvas.background}>
          {BACKGROUNDS.map((id) => (
            <button key={id} aria-pressed={background === id} onClick={() => setCanvasStyle(canvas.id, { background: id === 'dots' ? null : id })}>
              {m.canvas.backgrounds[id]}
            </button>
          ))}
        </div>
        <h3>{m.canvas.noteColour}</h3>
        <button className="ghost default" aria-pressed={!canvas.cardColor} onClick={() => setCanvasStyle(canvas.id, { cardColor: null })}>
          {m.canvas.plainNotes}
        </button>
        <PaletteGrid current={canvas.cardColor} label={m.canvas.notesColour} onPick={(cardColor) => setCanvasStyle(canvas.id, { cardColor })} />
        <h3>{m.canvas.accent}</h3>
        <button className="ghost default" aria-pressed={!canvas.accent} onClick={() => setCanvasStyle(canvas.id, { accent: null })}>
          {m.canvas.appAccent}
        </button>
        <PaletteGrid current={canvas.accent} label={m.canvas.accentColour} onPick={(accent) => setCanvasStyle(canvas.id, { accent })} />
        <h3>{m.canvas.privacy}</h3>
        <PrivateSwitch
          on={!!canvas.local || inherited}
          disabled={inherited}
          what={m.canvas.privateWhat(canvas.name)}
          onChange={(on) => setCanvasLocal(canvas.id, on)}
          note={inherited ? m.canvas.privateInherited : m.canvas.privateNote}
        />
        <CopyLink target={{ kind: 'v', id: canvas.id }} className="ghost default" text={m.canvas.copyLink} />
      </div>
    </Menu>
  );
}
