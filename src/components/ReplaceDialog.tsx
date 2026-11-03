import { FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT } from '../convert/formats';
import { quoted } from '../links';
import { replaceDoc, type Replaced } from '../pdf/replace';
import type { DocMeta } from '../types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Replaces a document with a newer version of it, then says where its marks went and which could not be placed. */
export function ReplaceDialog({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Replaced | null>(null);
  useEffect(() => ref.current?.showModal(), []);

  const run = async (file: File) => {
    setBusy(true);
    try {
      setDone(await replaceDoc(doc.id, file));
    } catch {
      setDone({ problems: ['The new version could not be read. It may be damaged, or in a form Gloss does not read.'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="sheet glass replace-dialog" aria-labelledby="replace-h" onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form method="dialog">
        <h2 id="replace-h">Replace “{doc.name}”</h2>
        {!done ? (
          <>
            <p>
              Choose the newer version of this document. Highlights, comments, links, excerpts, handwriting, squeezes and bookmarks move to the same words in it, and anything whose
              words are gone is kept aside to place again.
            </p>
            <p className="fine">Undo puts the old version back.</p>
          </>
        ) : 'placed' in done ? (
          <div role="status" className="replace-report">
            <p>
              Replaced. {plural(done.placed, 'highlight is', 'highlights are')} on the same words in the new version.
              {done.byPage > 0 && ` ${plural(done.byPage, 'figure, text box or stroke', 'figures, text boxes and strokes')} with no words near stayed in place on the same page.`}
              {done.opened > 0 && ` ${plural(done.opened, 'squeeze was', 'squeezes were')} opened.`}
            </p>
            {done.unplaced.length > 0 && (
              <>
                <p>
                  {plural(done.unplaced.length, 'highlight', 'highlights')} could not be found. {done.unplaced.length === 1 ? 'It is' : 'They are'} listed as unplaced in the
                  sidebar’s Highlights tab, with {done.unplaced.length === 1 ? 'its' : 'their'} comments, links and excerpts, to place again or delete:
                </p>
                <ul className="unplaced-list">
                  {done.unplaced.map((h) => (
                    <li key={h.id}>{quoted(h)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
        {done?.problems.map((p) => (
          <p key={p} className="share-problem" role="alert">
            {p}
          </p>
        ))}
        <footer>
          {done && 'placed' in done ? (
            <button type="submit" className="primary">
              Done
            </button>
          ) : (
            <>
              <button type="submit" disabled={busy}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => input.current!.click()}>
                <FileUp size={16} /> {busy ? 'Replacing…' : 'Choose the new version'}
              </button>
            </>
          )}
        </footer>
      </form>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label="New version"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void run(file);
        }}
      />
    </dialog>
  );
}
