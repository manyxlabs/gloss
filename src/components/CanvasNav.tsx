import { ArrowUp, ChevronRight, Paintbrush } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { isLocalCanvas, pathTo } from '../canvases';
import { setCanvasLocal } from '../store/privacy';
import { setCanvasStyle } from '../store/cards';
import { setCanvas, useStore } from '../store/project';
import type { Background } from '../types';
import { PaletteGrid } from './ColorPicker';
import { CopyLink } from './LinkChips';
import { Menu } from './Menu';
import { PrivateSwitch } from './Private';

/** Where a nested canvas sits, from the top: each step opens that canvas, and Up the one it is in. */
export function CanvasPath() {
  const project = useStore((s) => s.project);
  const current = useStore((s) => s.canvasId);
  const path = project ? pathTo(project, current) : [];
  const parent = path.at(-2);
  if (!parent) return null;
  return (
    <nav className="canvas-path" aria-label="Canvas path">
      <button className="icon" aria-label={`Up to ${parent.name}`} title={`Up to ${parent.name}`} onClick={() => setCanvas(parent.id)}>
        <ArrowUp size={16} />
      </button>
      <ol>
        {path.map((c, i) => (
          <li key={c.id}>
            {i < path.length - 1 ? (
              <>
                <button className="ghost" onClick={() => setCanvas(c.id)}>
                  {c.name}
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

const BACKGROUNDS: [Background, string][] = [
  ['dots', 'Dots'],
  ['grid', 'Grid'],
  ['plain', 'Plain'],
];

/** How the canvas on show looks, with what else concerns the whole canvas below it. */
export function CanvasStyleMenu({ children }: { children?: ReactNode }) {
  const canvas = useStore((s) => s.project?.canvases.find((c) => c.id === s.canvasId));
  const project = useStore((s) => s.project);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!canvas) return null;
  const background = canvas.background ?? 'dots';
  const inherited = !!project && !canvas.local && isLocalCanvas(project, canvas.id);
  return (
    <>
      <button className="icon" aria-label="Canvas style" title="Canvas style" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <Paintbrush size={16} />
      </button>
      {anchor && (
        <Menu anchor={anchor} label="Canvas style" role="dialog" onClose={() => setAnchor(null)}>
          <div className="canvas-style">
            <h3>Background</h3>
            <div className="segmented" role="group" aria-label="Background">
              {BACKGROUNDS.map(([id, label]) => (
                <button key={id} aria-pressed={background === id} onClick={() => setCanvasStyle(canvas.id, { background: id === 'dots' ? null : id })}>
                  {label}
                </button>
              ))}
            </div>
            <h3>Note colour</h3>
            <button className="ghost default" aria-pressed={!canvas.cardColor} onClick={() => setCanvasStyle(canvas.id, { cardColor: null })}>
              Plain notes
            </button>
            <PaletteGrid current={canvas.cardColor} label={(name) => `Notes ${name}`} onPick={(cardColor) => setCanvasStyle(canvas.id, { cardColor })} />
            <h3>Accent</h3>
            <button className="ghost default" aria-pressed={!canvas.accent} onClick={() => setCanvasStyle(canvas.id, { accent: null })}>
              The app’s accent
            </button>
            <PaletteGrid current={canvas.accent} label={(name) => `Accent ${name}`} onPick={(accent) => setCanvasStyle(canvas.id, { accent })} />
            <h3>Privacy</h3>
            <PrivateSwitch
              on={!!canvas.local || inherited}
              disabled={inherited}
              what={`the canvas “${canvas.name}”`}
              onChange={(on) => setCanvasLocal(canvas.id, on)}
              note={
                inherited
                  ? 'Kept on this device with the canvas it is in.'
                  : 'This canvas, its cards and the canvases in it stay on this device: in a shared project they are never sent, encrypted or not.'
              }
            />
            <CopyLink target={{ kind: 'v', id: canvas.id }} className="ghost default" text="Copy link to this canvas" />
            {children}
          </div>
        </Menu>
      )}
    </>
  );
}
