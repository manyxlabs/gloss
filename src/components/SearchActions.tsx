import { FoldVertical, Highlighter, LayoutGrid, Link2, StickyNote, Tag } from 'lucide-react';
import { useState } from 'react';
import { actOnMatches, collapseAround, findAll, type Act } from '../store/bulk';
import { canvasOf, useStore } from '../store/project';
import { setTag } from '../store/tags';
import { cardText } from '../search';
import type { Color } from '../types';
import { ColorPicker } from './ColorPicker';
import { TagPicker } from './Tags';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
      setMessage(ids.length ? done(ids.length) : `Nothing matches “${query}”.`);
      return ids;
    } finally {
      setBusy(false);
    }
  };
  const highlight = (color: Color) => void run({ color }, (n) => `${plural(n, 'passage')} highlighted.`);
  const tag = async (id: string, on: boolean, fresh: boolean) => {
    if (!on) {
      setTag({ highlights: applied[id] ?? [] }, id, false);
      setApplied(({ [id]: _, ...rest }) => rest);
      return;
    }
    const name = useStore.getState().project?.tags.find((t) => t.id === id)?.name;
    const ids = await run({ color: 'yellow', tag: id }, (n) => `${plural(n, 'passage')} tagged ${name}.`, !fresh);
    setApplied((a) => ({ ...a, [id]: ids }));
  };
  const excerpt = () => void run({ color: 'yellow', excerpt: true }, (n) => `${plural(n, 'passage')} excerpted to the canvas.`).then(onDone);
  const link = (to: Act['link']) => void run({ color: 'yellow', link: to }, (n) => `${plural(n, 'passage')} linked.`).then(onDone);
  const collapse = async () => {
    setBusy(true);
    try {
      const ids = docs ?? useStore.getState().project?.docs.map((d) => d.id) ?? [];
      const n = await collapseAround(ids, { query }, 2);
      setMessage(n ? `Squeezed to ${plural(n, 'match')}, with two lines around each. Expand all from the document’s squeeze button.` : `Nothing matches “${query}”.`);
      if (n) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-actions" role="group" aria-label={docName ? `Act on the matches in ${docName}` : 'Act on all matches'} aria-busy={busy}>
      <div className="row">
        <span className="label">
          <Highlighter size={15} /> Highlight all
        </span>
        <ColorPicker label={(name) => `Highlight all ${name}`} onPick={(c) => !busy && highlight(c)} />
      </div>
      <div className="row">
        <button aria-expanded={open === 'tag'} disabled={busy} onClick={() => setOpen(open === 'tag' ? null : 'tag')}>
          <Tag size={15} /> Tag all
        </button>
        <button disabled={busy} onClick={excerpt}>
          <LayoutGrid size={15} /> Excerpt all
        </button>
        <button aria-expanded={open === 'link'} disabled={busy} onClick={() => setOpen(open === 'link' ? null : 'link')}>
          <Link2 size={15} /> Link all
        </button>
        <button disabled={busy} onClick={() => void collapse()}>
          <FoldVertical size={15} /> Squeeze to matches
        </button>
      </div>
      {open === 'tag' && <TagPicker on={Object.keys(applied)} onToggle={(id, on, fresh) => void tag(id, on, fresh)} onClose={() => setOpen(null)} />}
      {open === 'link' && (
        <div className="row links">
          <button disabled={busy} onClick={() => link('note')}>
            <StickyNote size={15} /> To a new note
          </button>
          {target ? (
            <button disabled={busy} onClick={() => link({ cardId: target.id })} title={cardText(useStore.getState().project!, target)}>
              <Link2 size={15} /> To the chosen card
            </button>
          ) : (
            <span className="hint">Or choose a card on the canvas to link them to it.</span>
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
