import { FoldVertical, Highlighter, LayoutGrid, Link2, StickyNote, Tag } from 'lucide-react';
import { useState } from 'react';
import { actOnMatches, collapseAround, findAll, type Act } from '../store/bulk';
import { canvasOf, useStore } from '../store/project';
import { setTag } from '../store/tags';
import { cardText } from '../search';
import type { Color } from '../types';
import { ColorPicker } from './ColorPicker';
import { TagPicker } from './Tags';
import { m } from '../i18n';

/**
 * Acts on every match of a search, in one document or in all of them, as LiquidText does: highlight,
 * tag or excerpt them all, link them all to a card, or squeeze the documents down to them. Each is one
 * undo step. Matches are found afresh here, as the results list shows only the first of them.
 */
export function SearchActions({ query, docId, onDone }: { query: string; docId?: string; onDone: () => void }) {
  const docName = useStore((s) => s.project?.docs.find((d) => d.id === docId)?.name);
  const target = useStore((s) => {
    const p = s.project;
    return p?.cards.find((c) => c.selected && c.data.kind !== 'group' && canvasOf(p, c) === s.canvasId);
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<'tag' | 'link' | null>(null);
  /** Tags put on the matches from here, with the passages they went on, so a tag can be taken off again. */
  const [applied, setApplied] = useState<Record<string, string[]>>({});
  const docs = docId ? [docId] : undefined;

  const run = async (act: Act, done: (n: number) => string, undoable = true) => {
    setBusy(true);
    try {
      const ids = actOnMatches(await findAll(query, docs), query, act, undoable);
      setMessage(ids.length ? done(ids.length) : m.canvasPalette.none(query));
      return ids;
    } finally {
      setBusy(false);
    }
  };
  const highlight = (color: Color) => void run({ color }, m.canvasSearch.highlighted);
  const tag = async (id: string, on: boolean, fresh: boolean) => {
    if (!on) {
      setTag({ highlights: applied[id] ?? [] }, id, false);
      setApplied(({ [id]: _, ...rest }) => rest);
      return;
    }
    const name = useStore.getState().project?.tags.find((t) => t.id === id)?.name;
    const ids = await run({ color: 'yellow', tag: id }, (n) => m.canvasSearch.taggedAll(n, name ?? ''), !fresh);
    setApplied((a) => ({ ...a, [id]: ids }));
  };
  const excerpt = () => void run({ color: 'yellow', excerpt: true }, m.canvasSearch.excerpted).then(onDone);
  const link = (to: Act['link']) => void run({ color: 'yellow', link: to }, m.canvasSearch.linked).then(onDone);
  const collapse = async () => {
    setBusy(true);
    try {
      const ids = docs ?? useStore.getState().project?.docs.map((d) => d.id) ?? [];
      const n = await collapseAround(ids, { query }, 2);
      setMessage(n ? m.canvasSearch.squeezed(n) : m.canvasPalette.none(query));
      if (n) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-actions" role="group" aria-label={docName ? m.canvasSearch.actIn(docName) : m.canvasSearch.actAll} aria-busy={busy}>
      <div className="row">
        <span className="label">
          <Highlighter size={15} /> {m.canvasSearch.highlightAll}
        </span>
        <ColorPicker label={m.canvasSearch.highlightAllIn} onPick={(c) => !busy && highlight(c)} />
      </div>
      <div className="row">
        <button aria-expanded={open === 'tag'} disabled={busy} onClick={() => setOpen(open === 'tag' ? null : 'tag')}>
          <Tag size={15} /> {m.canvasSearch.tagAll}
        </button>
        <button disabled={busy} onClick={excerpt}>
          <LayoutGrid size={15} /> {m.canvasSearch.excerptAll}
        </button>
        <button aria-expanded={open === 'link'} disabled={busy} onClick={() => setOpen(open === 'link' ? null : 'link')}>
          <Link2 size={15} /> {m.canvasSearch.linkAll}
        </button>
        <button disabled={busy} onClick={() => void collapse()}>
          <FoldVertical size={15} /> {m.canvasSearch.squeezeAll}
        </button>
      </div>
      {open === 'tag' && <TagPicker on={Object.keys(applied)} onToggle={(id, on, fresh) => void tag(id, on, fresh)} onClose={() => setOpen(null)} />}
      {open === 'link' && (
        <div className="row links">
          <button disabled={busy} onClick={() => link('note')}>
            <StickyNote size={15} /> {m.canvasSearch.toNote}
          </button>
          {target ? (
            <button disabled={busy} onClick={() => link({ cardId: target.id })} title={cardText(useStore.getState().project!, target)}>
              <Link2 size={15} /> {m.canvasSearch.toCard}
            </button>
          ) : (
            <span className="hint">{m.canvasSearch.chooseCard}</span>
          )}
        </div>
      )}
      {message && (
        <p className="done" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
