import { useReactFlow, useStore as useFlow } from '@xyflow/react';
import { Group, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { group, useStore } from '../store/project';
import { setTag, tagState } from '../store/tags';
import type { Card, Link } from '../types';
import { TagPicker } from './Tags';
import { CanvasLinkButton } from './CardActions';
import { CopyLink } from './LinkChips';
import { m } from '../i18n';

/** Room kept between the bar and what it belongs to. */
const GAP = 10;
/** About the bar's height, and half its widest, to keep it on the canvas and clear of the canvas's tools. */
const HEIGHT = 44;
const HALF = 110;
const TOOLS_BOTTOM = 56;

/**
 * Floats above what is chosen on the canvas with what can be done to it, for touch screens and for
 * anyone who does not know the keys: delete it, and group several cards.
 */
export function SelectionBar({ cards, links }: { cards: Card[]; links: Link[] }) {
  const rf = useReactFlow<Card, Link>();
  const [x, y, zoom] = useFlow((s) => s.transform);
  const width = useFlow((s) => s.width);
  const nodes = cards.filter((c) => c.selected && !c.hidden);
  const edges = links.filter((l) => l.selected);
  const groupable = nodes.filter((c) => !c.parentId && c.data.kind !== 'group');
  const [tagging, setTagging] = useState(false);
  const project = useStore((s) => s.project);
  if (tagging && !nodes.length) setTagging(false);

  if ((!nodes.length && !edges.length) || cards.some((c) => c.dragging || c.resizing)) return null;
  // The box around what is chosen, on screen: cards by their own boxes, links by their middles.
  const boxes = [
    ...nodes.flatMap((c) => {
      const n = rf.getInternalNode(c.id);
      if (!n) return [];
      const { x: nx, y: ny } = n.internals.positionAbsolute;
      return [[nx, ny, nx + (n.measured.width ?? 0), ny + (n.measured.height ?? 0)]];
    }),
    ...edges.flatMap((l) => {
      const [a, b] = [rf.getInternalNode(l.source), rf.getInternalNode(l.target)];
      if (!a || !b) return [];
      const mid = (n: typeof a) => [n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2, n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2];
      const [[ax, ay], [bx, by]] = [mid(a), mid(b)] as [number[], number[]];
      return [[(ax! + bx!) / 2, (ay! + by!) / 2, (ax! + bx!) / 2, (ay! + by!) / 2]];
    }),
  ];
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b[0]!)) * zoom + x;
  const right = Math.max(...boxes.map((b) => b[2]!)) * zoom + x;
  const top = Math.min(...boxes.map((b) => b[1]!)) * zoom + y;
  const bottom = Math.max(...boxes.map((b) => b[3]!)) * zoom + y;
  // Above, unless that would put it under the canvas's own tools; then below.
  const above = top - HEIGHT - GAP > TOOLS_BOTTOM;
  const at = { left: Math.min(Math.max((left + right) / 2, HALF), width - HALF), top: above ? top - HEIGHT - GAP : bottom + GAP };

  const chosen = { cards: nodes.map((c) => c.id) };
  const tagged = project && tagging ? tagState(project, chosen) : null;
  const what = m.canvasTools.deleteWhat[nodes.length + edges.length > 1 ? 'selection' : !nodes[0] ? 'link' : nodes[0].data.kind === 'group' ? 'group' : 'card'];
  return (
    <div className="selection-bar nodrag nopan" role="toolbar" aria-label={m.canvasTools.chosen} style={at}>
      {groupable.length > 1 && (
        <button onClick={() => group(groupable.map((c) => c.id))}>
          <Group size={16} /> {m.canvasTools.group}
        </button>
      )}
      {nodes.length > 0 && (
        // An icon alone: the bar sits over what is chosen, and a wider one covers a group's own buttons.
        <button className="icon" aria-label={m.canvasTools.tag} title={m.canvasTools.tag} aria-expanded={tagging} onClick={() => setTagging(!tagging)}>
          <Tag size={16} />
        </button>
      )}
      {nodes.length === 1 && !edges.length && nodes[0]!.data.kind !== 'group' && <CanvasLinkButton card={nodes[0]!} />}
      {nodes.length === 1 && !edges.length && <CopyLink target={{ kind: 'c', id: nodes[0]!.id }} />}
      <button aria-label={what} title={what} onClick={() => void rf.deleteElements({ nodes, edges })}>
        <Trash2 size={16} /> {m.canvasTools.delete}
      </button>
      {tagged && (
        <div className={`popup tag-popup ${above ? 'under' : 'over'}`}>
          <TagPicker on={tagged.all} some={tagged.some} onToggle={(id, on, fresh) => setTag(chosen, id, on, !fresh)} onClose={() => setTagging(false)} />
        </div>
      )}
    </div>
  );
}
