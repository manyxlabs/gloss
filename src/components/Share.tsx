import { Check, Copy, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/project';
import { shareLink } from '../sync/crypto';
import { useSync, type Status } from '../sync/state';
import { Notifications } from './Notifications';
import { keepName, NameField, Peers } from './Presence';
import { screens } from './Screens';

// The sync engine and Yjs load only once a project is shared.
const engine = () => import('../sync/session');

const LABEL: Record<Status, string> = { synced: 'Synced', syncing: 'Syncing', offline: 'Offline' };

/** The Share button and dialog, and while the project is shared: who is here and whether it is in sync. */
export function Share() {
  const id = useStore((s) => s.project?.id);
  const sync = useStore((s) => s.project?.sync);
  const status = useSync((s) => s.status);
  const problem = useSync((s) => s.problem);
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [room, key] = [sync?.room, sync?.key];

  useEffect(() => {
    if (!id || !room || !key) return;
    let stop: (() => void) | undefined;
    let gone = false;
    void engine().then((m) => !gone && (stop = m.startSync(id, { room, key })));
    return () => {
      gone = true;
      stop?.();
    };
  }, [id, room, key]);

  const link = sync ? shareLink(sync) : '';
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const close = () => dialog.current?.close();
  const another = (
    <p className="fine">
      To show this project on another of your own screens too, such as a tablet beside this one,{' '}
      <button type="button" className="link" onClick={() => (close(), screens.open())}>
        use another screen
      </button>
      .
    </p>
  );

  return (
    <>
      {sync && (
        <>
          <Notifications />
          <Peers />
          <span className={`sync-status ${status}`} role="status" title={problem ?? undefined}>
            <i aria-hidden="true" />
            {LABEL[status]}
          </span>
        </>
      )}
      <button className="share" onClick={() => dialog.current?.showModal()} title="Sync this project across devices and work on it together">
        <Users size={16} /> Share
      </button>
      {/* A click on the backdrop lands on the dialog itself, and closes it. */}
      <dialog ref={dialog} className="sheet glass" aria-labelledby="share-h" onClick={(e) => e.target === e.currentTarget && close()}>
        <h2 id="share-h">{sync ? 'This project is shared' : 'Share this project'}</h2>
        {sync ? (
          <>
            <p>Anyone with this link can open this project, read it and edit it, on any device, as you work.</p>
            <div className="share-link">
              <input readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
              <button className="primary" onClick={() => void copy()}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <p className="fine">The link is the key. Treat it like the PDFs themselves: give it only to people who may see them.</p>
            <p className="fine">
              To keep a document or a canvas to yourself, mark it <b>Only on this device</b>, from the lock in the document’s toolbar or in Canvas style. It and everything on it
              are then never sent, encrypted or not, and the copies on the other devices are removed.
            </p>
            {another}
            {problem && <p className="share-problem">{problem}</p>}
            <footer>
              <button
                className="ghost"
                onClick={() =>
                  void engine()
                    .then((m) => m.stopSharing())
                    .then(close)
                }
                title="Others keep the project; this copy stays here but stops getting their changes"
              >
                Stop syncing on this device
              </button>
              <button onClick={close}>Done</button>
            </footer>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              keepName(e.currentTarget);
              void engine().then((m) => m.share());
            }}
          >
            <p>
              Sharing keeps this project, its PDFs and its canvas in step across your devices and with anyone you give the link to. Changes appear for everyone as they are made,
              and edits made offline catch up later.
            </p>
            <p>
              Everything is scrambled on this device before it leaves. The key is part of the link and never reaches the server, which only stores scrambled data it cannot read.
              Anyone with the link can read and edit.
            </p>
            {another}
            <label className="name-field">
              <span>Your name, as the others will see it</span>
              <NameField />
            </label>
            <footer>
              <button type="button" onClick={close}>
                Cancel
              </button>
              <button className="primary">Create link</button>
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
}
