import { ListCollapse } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import { collapseAround, expandAll, useLastSearch } from '../../store/bulk';
import { useStore } from '../../store/project';
import { TermsToggle } from './Terms';
import type { Color, Tag } from '../../types';
import { ColorPicker } from '../ColorPicker';

const NONE: Tag[] = [];

/** The document whose squeeze panel is open: from its button, or from the document's tab menu where a pane has no room for the button. */
export const useSqueeze = create<{ docId: string | null }>(() => ({ docId: null }));

/**
 * Squeezes a document down to its highlights (of a colour or with a tag, if chosen) or to the matches
 * of some words, with a chosen number of lines around each, as LiquidText's pinch to collapse does;
 * Expand all opens every squeeze again. Each is one undo step.
 */
export function Collapse({ docId }: { docId: string }) {
  const open = useSqueeze((s) => s.docId === docId);
  const setOpen = (on: boolean) => useSqueeze.setState({ docId: on ? docId : null });
  const last = useLastSearch((s) => s.query);
  const tags = useStore((s) => s.project?.tags ?? NONE);
  const folded = useStore((s) => s.project?.folds.some((f) => f.docId === docId) ?? false);
  const [mode, setMode] = useState<'highlights' | 'words'>('highlights');
  const [words, setWords] = useState('');
  const [color, setColor] = useState<Color | ''>('');
  const [tag, setTag] = useState('');
  const [context, setContext] = useState(2);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) && useSqueeze.setState({ docId: null });
    addEventListener('pointerdown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);

  const squeeze = async () => {
    setBusy(true);
    try {
      const query = (words || last).trim();
      const n = await collapseAround([docId], mode === 'words' ? { query } : { ...(color ? { color } : {}), ...(tag ? { tag } : {}) }, context);
      if (n) setOpen(false);
      else setMessage(mode === 'words' ? (query ? `Nothing here matches “${query}”.` : 'Type the words to squeeze around.') : 'No highlights here are of that kind.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="collapse-wrap" ref={root}>
      <button
        className="icon"
        aria-label="Squeeze around highlights or words"
        title="Squeeze to highlights or search matches, and defined terms"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (setOpen(!open), setMessage(null))}
      >
        <ListCollapse size={17} />
      </button>
      {open && (
        <form
          className="collapse-panel glass"
          role="dialog"
          aria-label="Squeeze the document"
          onSubmit={(e) => {
            e.preventDefault();
            void squeeze();
          }}
        >
          <div className="choice" role="radiogroup" aria-label="Squeeze around">
            <button type="button" role="radio" aria-checked={mode === 'highlights'} onClick={() => setMode('highlights')}>
              Highlights
            </button>
            <button type="button" role="radio" aria-checked={mode === 'words'} onClick={() => setMode('words')}>
              Search matches
            </button>
          </div>
          {mode === 'words' ? (
            <input aria-label="Words to squeeze around" placeholder={last || 'Words to find'} value={words} autoFocus onChange={(e) => setWords(e.target.value)} />
          ) : (
            <>
              <div className="colors" role="group" aria-label="Highlight colour">
                <button
                  type="button"
                  aria-pressed={!color}
                  className={`swatch none${color ? '' : ' current'}`}
                  aria-label="Any colour"
                  title="Any colour"
                  onClick={() => setColor('')}
                />
                <ColorPicker current={color || undefined} label={(name) => name} onPick={setColor} />
              </div>
              {tags.length > 0 && (
                <select aria-label="With the tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">Any tag or none</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <label className="context" htmlFor={id}>
            <span>
              {context} line{context === 1 ? '' : 's'} of context
            </span>
            <input id={id} type="range" min={0} max={10} value={context} onChange={(e) => setContext(Number(e.target.value))} />
          </label>
          {message && (
            <p className="collapse-message" role="status">
              {message}
            </p>
          )}
          <TermsToggle docId={docId} />
          <div className="row">
            <button type="button" disabled={!folded} onClick={() => (expandAll(docId), setOpen(false))}>
              Expand all
            </button>
            <button type="submit" className="primary" disabled={busy}>
              Squeeze
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
