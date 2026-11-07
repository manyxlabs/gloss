import { Check, Copy, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/project';
import { shareLink } from '../sync/crypto';
import { useSync } from '../sync/state';
import { Notifications } from './Notifications';
import { keepName, NameField, Peers } from './Presence';
import { screens } from './Screens';
import { m } from '../i18n';
import { rich } from '../i18n/rich';

// The sync engine and Yjs load only once a project is shared.
const engine = () => import('../sync/session');

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
    void engine().then((e) => !gone && (stop = e.startSync(id, { room, key })));
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
      {rich(m.homeShare.another, {
        screens: (s) => (
          <button type="button" className="link" onClick={() => (close(), screens.open())}>
            {s}
          </button>
        ),
      })}
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
            {m.homeShare.status[status]}
          </span>
        </>
      )}
      <button className="share" onClick={() => dialog.current?.showModal()} title={m.homeShare.shareTitle}>
        <Users size={16} /> {m.homeShare.share}
      </button>
      {/* A click on the backdrop lands on the dialog itself, and closes it. */}
      <dialog ref={dialog} className="sheet glass" aria-labelledby="share-h" onClick={(e) => e.target === e.currentTarget && close()}>
        <h2 id="share-h">{sync ? m.homeShare.sharedHeading : m.homeShare.shareHeading}</h2>
        {sync ? (
          <>
            <p>{m.homeShare.anyone}</p>
            <div className="share-link">
              <input readOnly value={link} aria-label={m.homeShare.linkLabel} onFocus={(e) => e.currentTarget.select()} />
              <button className="primary" onClick={() => void copy()}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? m.home.copied : m.homeShare.copyLink}
              </button>
            </div>
            <p className="fine">{m.homeShare.keyNote}</p>
            <p className="fine">{rich(m.homeShare.privateNote, { b: (s) => <b>{s}</b> })}</p>
            {another}
            {problem && <p className="share-problem">{problem}</p>}
            <footer>
              <button
                className="ghost"
                onClick={() =>
                  void engine()
                    .then((e) => e.stopSharing())
                    .then(close)
                }
                title={m.homeShare.stopTitle}
              >
                {m.homeShare.stop}
              </button>
              <button onClick={close}>{m.home.done}</button>
            </footer>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              keepName(e.currentTarget);
              void engine().then((e) => e.share());
            }}
          >
            <p>{m.homeShare.intro}</p>
            <p>{m.homeShare.encrypted}</p>
            {another}
            <label className="name-field">
              <span>{m.homeShare.nameLabel}</span>
              <NameField />
            </label>
            <footer>
              <button type="button" onClick={close}>
                {m.home.cancel}
              </button>
              <button className="primary">{m.homeShare.create}</button>
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
}
