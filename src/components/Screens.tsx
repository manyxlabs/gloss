import { Check, Copy, MonitorSmartphone, SquareArrowOutUpRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { encode } from 'uqr';
import { usePaneRoom } from '../panes';
import { paneCount, useStore } from '../store/project';
import { newScreens, shareLink } from '../sync/crypto';
import { joinScreens, setShow, shownNow, useLinked, useScreen, type Show } from '../sync/state';
import { radios } from './Segmented';
import { m } from '../i18n';

/** What this screen shows now; a pane that has closed gives way to all the documents. */
export function useShown(): Show {
  const shown = shownNow(
    useScreen((s) => s.show),
    useLinked(),
  );
  const room = usePaneRoom();
  const panes = useStore((s) => Math.min(paneCount(s), room));
  return typeof shown === 'number' && shown >= panes ? 'doc' : shown;
}

/** A link as a QR code, dark on light whatever the theme, as scanners expect. */
function Qr({ text }: { text: string }) {
  const { size, data } = encode(text, { ecc: 'M', border: 2 });
  const path = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={m.homeScreens.qr}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  );
}

/** Opens the Screens dialog from the Share dialog, as a phone's header has no room for its button. */
export const screens = { open: () => {} };

/** The Screens button and dialog: the link that opens this project as another screen, and what this one shows. */
export function Screens() {
  const id = useStore((s) => s.project?.id);
  const sync = useStore((s) => s.project?.sync);
  const room = usePaneRoom();
  const panes = useStore((s) => Math.min(paneCount(s), room));
  const { group, show } = useScreen();
  const linked = useLinked();
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    screens.open = () => {
      dialog.current?.showModal();
      // Rather than the link, which would show it selected: what this screen shows is its first choice.
      dialog.current?.querySelector<HTMLElement>(':checked')?.focus();
    };
  }, []);
  if (!id) return null;

  const link = sync && group ? shareLink(sync, group) : '';
  const start = () => {
    if (!group) joinScreens(id, newScreens());
    // The screens keep in step as a shared project's devices do.
    if (!sync) void import('../sync/session').then((e) => e.share());
  };
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button className={`icon screens${linked ? ' linked' : ''}`} aria-label={m.homeScreens.label(linked)} title={m.homeScreens.useAnother} onClick={() => screens.open()}>
        <MonitorSmartphone size={17} />
      </button>
      <dialog ref={dialog} className="sheet glass screens-dialog" aria-labelledby="screens-h" onClick={(e) => e.target === e.currentTarget && close()}>
        <h2 id="screens-h">{m.homeScreens.useAnother}</h2>
        <p>{m.homeScreens.intro}</p>
        {link ? (
          <div className="screen-link">
            <Qr text={link} />
            <div>
              <p className="fine">{m.homeScreens.scan}</p>
              <div className="share-link">
                <input readOnly value={link} aria-label={m.homeScreens.linkLabel} onFocus={(e) => e.currentTarget.select()} />
                <button className="primary" onClick={() => void copy()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? m.home.copied : m.home.copy}
                </button>
              </div>
              <button onClick={() => window.open(link, '_blank', 'popup,noopener')}>
                <SquareArrowOutUpRight size={16} /> {m.homeScreens.openWindow}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="fine">{sync ? m.homeScreens.viaSync : m.homeScreens.viaSyncShares}</p>
            <button className="primary" onClick={start}>
              <MonitorSmartphone size={16} /> {m.homeScreens.linkAnother}
            </button>
          </>
        )}
        <fieldset className="screen-show">
          <legend>{m.homeScreens.shows}</legend>
          {radios(
            m.homeScreens.shows,
            show,
            [
              ['both', m.homeScreens.both],
              ['doc', m.homeScreens.doc],
              ['canvas', m.homeScreens.canvas],
            ],
            (v) => setShow(id, v),
          )}
          {panes > 1 &&
            radios(
              m.homeScreens.onePane,
              show,
              Array.from({ length: panes }, (_, i) => [i as Show, m.homeScreens.pane(i + 1)]),
              (v) => setShow(id, v),
            )}
        </fieldset>
        <p className="fine" role="status">
          {linked ? m.homeScreens.linked(linked) : m.homeScreens.alone}
        </p>
        <footer>
          <button onClick={close}>{m.home.done}</button>
        </footer>
      </dialog>
    </>
  );
}
