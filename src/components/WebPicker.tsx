import { Globe } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ConvertOptions } from '../convert';

/** An address typed without its scheme, such as example.com/page or example.com:8080, is taken as https. */
const normalized = (raw: string) => {
  const text = raw.trim();
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`).href;
  } catch {
    return null;
  }
};

/**
 * Asks for a web page's address; `add` fetches it, reports how far it has got and its own problems,
 * and stops when the reader cancels.
 */
export function WebPicker({ kind = 'icon', add }: { kind?: 'icon' | 'text' | 'big'; add: (url: string, how: ConvertOptions) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const work = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const open = () => dialog.current!.showModal();
  return (
    <>
      {kind === 'icon' ? (
        <button className="icon" aria-label="Add from the web" title="Add a web page as a document" disabled={!!stage} onClick={open}>
          <Globe size={16} />
        </button>
      ) : (
        <button className={kind === 'big' ? 'big' : undefined} disabled={!!stage} onClick={open}>
          <Globe size={16} /> Add from the web
        </button>
      )}
      {/* However it closes, Cancel or Escape, the work stops with it. */}
      <dialog ref={dialog} className="web-dialog glass" aria-labelledby="web-h" onClose={() => work.current?.abort()}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const field = form.elements.namedItem('url') as HTMLInputElement;
            const url = normalized(field.value);
            if (!url) {
              field.setCustomValidity('That is not a web address.');
              return void field.reportValidity();
            }
            const controller = new AbortController();
            work.current = controller;
            setStage('Starting…');
            try {
              await add(url, { signal: controller.signal, onProgress: setStage });
              form.reset();
              dialog.current!.close();
            } catch (err) {
              if (!controller.signal.aborted) throw err;
            } finally {
              if (work.current === controller) work.current = null;
              setStage(null);
            }
          }}
        >
          <h2 id="web-h">Add a web page</h2>
          <input
            name="url"
            type="text"
            inputMode="url"
            required
            placeholder="https://"
            aria-label="Web page address"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            readOnly={!!stage}
            onInput={(e) => e.currentTarget.setCustomValidity('')}
          />
          <p role="status">{stage ?? 'Gloss fetches the page through its server, keeps the article, and saves it in this browser as a PDF.'}</p>
          <div className="actions">
            <button type="button" onClick={() => dialog.current!.close()}>
              Cancel
            </button>
            <button className="primary" disabled={!!stage}>
              {stage ? 'Adding…' : 'Add page'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
