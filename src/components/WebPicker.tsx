import { Link2 } from 'lucide-react';
import { useRef, useState } from 'react';

/** Asks for a link, to a web page or a file such as a cloud storage share link; `add` fetches it and reports its own problems. */
export function WebPicker({ big, add }: { big?: boolean; add: (url: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {big ? (
        <button className="big" disabled={busy} onClick={() => dialog.current!.showModal()}>
          <Link2 size={16} /> Add from a link
        </button>
      ) : (
        <button className="icon" aria-label="Add from a link" title="Add a web page, or a file from a share link" disabled={busy} onClick={() => dialog.current!.showModal()}>
          <Link2 size={16} />
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
          <h2 id="web-h">Add from a link</h2>
          <input name="url" type="url" required placeholder="https://" aria-label="Link" autoComplete="url" />
          <p>
            A web page is kept as its article. A share link from Google Drive, Dropbox, OneDrive or Box, or a link straight to a file, adds the file itself, so share it with{' '}
            <b>anyone with the link</b>. Gloss fetches links through its server and keeps what it adds in this browser.
          </p>
          <div className="actions">
            <button type="button" onClick={() => dialog.current!.close()}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
