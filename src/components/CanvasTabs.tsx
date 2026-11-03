import { ChevronDown, Lock, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { nestedIn, pathTo } from '../canvases';
import { addCanvas, canvasOf, removeCanvas, renameCanvas, setCanvas, useStore } from '../store/project';
import { Menu } from './Menu';
import { onTabKeys, revealTab, useRevealOnResize } from './tabs';

/**
 * The project's top-level canvases, one per line of thought; double-click a name to rename it. A
 * nested canvas shows as the canvas it is in, whose menu lists the canvases nested in it.
 */
export function CanvasTabs() {
  const all = useStore((s) => s.project?.canvases);
  const canvases = (all ?? []).filter((c) => !c.parentId);
  const open = useStore((s) => s.canvasId);
  const current = all ? (pathTo({ canvases: all }, open)[0]?.id ?? open) : open;
  const [editing, setEditing] = useState<string | null>(null);
  const [nested, setNested] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => revealTab(list.current), [current, canvases.length]);
  useRevealOnResize(list);

  const remove = (id: string, name: string) => {
    const { project } = useStore.getState();
    const inside = new Set([id, ...(project ? nestedIn(project, id).map((n) => n.canvas.id) : [])]);
    const cards = project ? project.cards.filter((c) => inside.has(canvasOf(project, c))).length : 0;
    if (!cards || confirm(`Remove “${name}” and its ${cards} card${cards === 1 ? '' : 's'}? Undo brings them back.`)) removeCanvas(id);
  };

  return (
    <div className="tabs canvas-tabs">
      <div className="tab-list" role="tablist" aria-label="Canvases" ref={list} onKeyDown={(e) => !editing && onTabKeys(e)}>
        {canvases.map((c) => (
          <div key={c.id} className={`tab${c.id === current ? ' active' : ''}`}>
            {editing === c.id ? (
              <input
                className="rename"
                aria-label="Canvas name"
                defaultValue={c.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onBlur={(e) => (e.target.value.trim() && renameCanvas(c.id, e.target.value.trim()), setEditing(null))}
                onKeyDown={(e) => (e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' && setEditing(null))}
              />
            ) : (
              <button
                role="tab"
                aria-selected={c.id === current}
                tabIndex={c.id === current ? 0 : -1}
                onClick={() => setCanvas(c.id)}
                onDoubleClick={() => setEditing(c.id)}
                title="Double-click to rename"
              >
                {c.local && <Lock size={12} aria-label="Only on this device" className="lock" />}
                {c.name}
              </button>
            )}
            {all?.some((x) => x.parentId === c.id) && (
              <button
                className="close nested"
                aria-label={`Canvases in ${c.name}`}
                aria-expanded={nested?.id === c.id}
                tabIndex={c.id === current ? 0 : -1}
                onClick={(e) => setNested(nested ? null : { id: c.id, anchor: e.currentTarget })}
              >
                <ChevronDown size={13} />
              </button>
            )}
            {canvases.length > 1 && (
              <button className="close" aria-label={`Remove ${c.name}`} tabIndex={c.id === current ? 0 : -1} onClick={() => remove(c.id, c.name)}>
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      {nested && all && (
        <Menu anchor={nested.anchor} label={`Canvases in ${all.find((c) => c.id === nested.id)?.name ?? ''}`} onClose={() => setNested(null)}>
          {[{ canvas: all.find((c) => c.id === nested.id)!, depth: 0 }, ...nestedIn({ canvases: all }, nested.id)].map(({ canvas, depth }) => (
            <button
              key={canvas.id}
              role="menuitemradio"
              aria-checked={canvas.id === open}
              style={{ paddingLeft: 12 + depth * 16 }}
              onClick={() => (setNested(null), setCanvas(canvas.id))}
            >
              {canvas.local && <Lock size={12} aria-label="Only on this device" className="lock" />}
              {canvas.name}
            </button>
          ))}
        </Menu>
      )}
      <button className="add" aria-label="New canvas" title="New canvas" onClick={addCanvas}>
        <Plus size={15} />
      </button>
    </div>
  );
}
