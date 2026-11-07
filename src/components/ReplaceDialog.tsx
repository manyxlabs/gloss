import { FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT } from '../convert/formats';
import { quoted } from '../links';
import { replaceDoc, type Replaced } from '../pdf/replace';
import type { DocMeta } from '../types';
import { m } from '../i18n';

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
      setDone({ problems: [m.docReplace.unreadable] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="sheet glass replace-dialog" aria-labelledby="replace-h" onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form method="dialog">
        <h2 id="replace-h">{m.docReplace.heading(doc.name)}</h2>
        {!done ? (
          <>
            <p>{m.docReplace.intro}</p>
            <p className="fine">{m.docReplace.undo}</p>
          </>
        ) : 'placed' in done ? (
          <div role="status" className="replace-report">
            <p>
              {m.docReplace.placed(done.placed)}
              {done.byPage > 0 && ` ${m.docReplace.byPage(done.byPage)}`}
              {done.opened > 0 && ` ${m.docReplace.opened(done.opened)}`}
            </p>
            {done.unplaced.length > 0 && (
              <>
                <p>{m.docReplace.unplaced(done.unplaced.length)}</p>
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
              {m.docReplace.done}
            </button>
          ) : (
            <>
              <button type="submit" disabled={busy}>
                {m.doc.cancel}
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => input.current!.click()}>
                <FileUp size={16} /> {busy ? m.docReplace.replacing : m.docReplace.choose}
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
        aria-label={m.docReplace.newVersion}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void run(file);
        }}
      />
    </dialog>
  );
}
