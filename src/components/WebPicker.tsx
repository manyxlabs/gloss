import { Link2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ConvertOptions } from '../convert';
import { m } from '../i18n';
import { rich } from '../i18n/rich';

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
 * Asks for a link, to a web page or a file such as a cloud storage share link; `add` fetches it,
 * reports how far it has got and its own problems, and stops when the reader cancels.
 */
export function WebPicker({ kind = 'icon', add }: { kind?: 'icon' | 'text' | 'big'; add: (url: string, how: ConvertOptions) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const work = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const open = () => dialog.current!.showModal();
  return (
    <>
      {kind === 'icon' ? (
        <button className="icon" aria-label={m.homeWeb.addFromLink} title={m.homeWeb.addTitle} disabled={!!stage} onClick={open}>
          <Link2 size={16} />
        </button>
      ) : (
        <button className={kind === 'big' ? 'big' : undefined} disabled={!!stage} onClick={open}>
          <Link2 size={16} /> {m.homeWeb.addFromLink}
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
              field.setCustomValidity(m.homeWeb.notAddress);
              return void field.reportValidity();
            }
            const controller = new AbortController();
            work.current = controller;
            setStage(m.homeWeb.starting);
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
          <h2 id="web-h">{m.homeWeb.addFromLink}</h2>
          <input
            name="url"
            type="text"
            inputMode="url"
            required
            placeholder="https://"
            aria-label={m.homeWeb.link}
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            readOnly={!!stage}
            onInput={(e) => e.currentTarget.setCustomValidity('')}
          />
          {stage ? <p role="status">{stage}</p> : <p>{rich(m.homeWeb.explain, { b: (s) => <b>{s}</b> })}</p>}
          <div className="actions">
            <button type="button" onClick={() => dialog.current!.close()}>
              {m.home.cancel}
            </button>
            <button className="primary" disabled={!!stage}>
              {stage ? m.home.adding : m.home.add}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
