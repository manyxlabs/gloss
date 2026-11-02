import { SquareStack } from 'lucide-react';
import { useState } from 'react';
import { nestedIn } from '../canvases';
import { toggleCanvasLink } from '../store/cards';
import { useStore } from '../store/project';
import type { Card } from '../types';
import { Menu } from './Menu';

/** Links a card to other canvases, each then a chip on the card that opens it: every canvas, nested ones under the one they are in. */
export function CanvasLinkButton({ card }: { card: Card }) {
  const canvases = useStore((s) => s.project?.canvases ?? []);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const tree = canvases.filter((c) => !c.parentId).flatMap((canvas) => [{ canvas, depth: 0 }, ...nestedIn({ canvases }, canvas.id)]);
  const linked = card.data.canvasLinks ?? [];
  return (
    <>
      <button aria-label="Link to a canvas" title="Link this card to another canvas" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <SquareStack size={16} /> Canvas
      </button>
      {anchor && (
        <Menu anchor={anchor} label="Link to a canvas" onClose={() => setAnchor(null)}>
          {tree.map(({ canvas, depth }) => (
            <button
              key={canvas.id}
              role="menuitemcheckbox"
              aria-checked={linked.includes(canvas.id)}
              disabled={canvas.id === card.data.canvasId}
              style={{ paddingLeft: 12 + depth * 16 }}
              onClick={() => toggleCanvasLink(card.id, canvas.id)}
            >
              {canvas.name}
            </button>
          ))}
        </Menu>
      )}
    </>
  );
}
