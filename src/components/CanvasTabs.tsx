import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { addCanvas, canvasOf, removeCanvas, renameCanvas, setCanvas, useStore } from '../store/project';

/** The project's canvases, one per line of thought; double-click a name to rename it. */
export function CanvasTabs() {
  const canvases = useStore((s) => s.project?.canvases ?? []);
  const current = useStore((s) => s.canvasId);
  const [editing, setEditing] = useState<string | null>(null);

  const remove = (id: string, name: string) => {
    const { project } = useStore.getState();
    const cards = project ? project.cards.filter((c) => canvasOf(project, c) === id).length : 0;
    if (!cards || confirm(`Remove “${name}” and its ${cards} card${cards === 1 ? '' : 's'}? Undo brings them back.`)) removeCanvas(id);
  };

  return (
    <div className="tabs canvas-tabs" role="tablist" aria-label="Canvases">
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
            <button role="tab" aria-selected={c.id === current} onClick={() => setCanvas(c.id)} onDoubleClick={() => setEditing(c.id)} title="Double-click to rename">
              {c.name}
            </button>
          )}
          {canvases.length > 1 && (
            <button className="close" aria-label={`Remove ${c.name}`} onClick={() => remove(c.id, c.name)}>
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      <button className="add" aria-label="New canvas" title="New canvas" onClick={addCanvas}>
        <Plus size={15} />
      </button>
    </div>
  );
}
