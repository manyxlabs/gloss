import { Globe } from 'lucide-react';
import { useRef, useState } from 'react';

/** Asks for a web page's address; `add` fetches it and reports its own problems. */
export function WebPicker({ big, add }: { big?: boolean; add: (url: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {big ? (
        <button className="big" disabled={busy} onClick={() => dialog.current!.showModal()}>
          <Globe size={16} /> Add from the web
        </button>
      ) : (
        <button className="icon" aria-label="Add from the web" title="Add a web page as a document" disabled={busy} onClick={() => dialog.current!.showModal()}>
          <Globe size={16} />
        </button>
      )}
      <dialog ref={dialog} className="web-dialog glass" aria-labelledby="web-h">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            try {
              await add(String(new FormData(form).get('url')).trim());
              form.reset();
              dialog.current!.close();
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id="web-h">Add a web page</h2>
          <input name="url" type="url" required placeholder="https://" aria-label="Web page address" autoComplete="url" />
          <p>Gloss fetches the page through its server, keeps the article, and saves it in this browser as a PDF.</p>
          <div className="actions">
            <button type="button" onClick={() => dialog.current!.close()}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add page'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
