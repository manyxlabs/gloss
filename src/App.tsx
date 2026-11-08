import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Join } from './components/Join';
import { Library } from './components/Library';
import { Lost } from './components/Lost';
import { OpenShared } from './components/OpenLink';
import { AppUpdates } from './components/AppUpdates';
import { ProgressNotice } from './components/ProgressNotice';
import { Unsent } from './components/Unsent';
import { PasswordDialog } from './components/PasswordDialog';
import { Privacy } from './components/Privacy';
import { parseLink } from './sync/crypto';
import { m } from './i18n';
import { split } from './i18n/langs';

// pdf.js and the canvas are most of the app's weight, so the start page does not wait for them.
const Workspace = lazy(() => import('./components/Workspace').then((m) => ({ default: m.Workspace })));

/** Shows while the Workspace's chunk arrives, which on a slow phone network takes seconds. */
function Opening() {
  return (
    <main className="opening" role="status">
      <i />
      {m.library.opening}
    </main>
  );
}

/** The project to open, and maybe something in it to show; see targets.ts. */
const route = () => /^#\/p\/([\w-]+)(?:\/[hcmvdb]\/[\w-]+)?$/.exec(location.hash)?.[1] ?? null;
/** A link to something in a shared project, named by its room. */
const sharedRoute = () => /^#\/s\/([\w-]+)\/[hcmvdb]\/[\w-]+$/.exec(location.hash)?.[1] ?? null;
/** A share link with its key cut short or mangled, as happens when one is copied in part. */
const badLink = () => location.hash.startsWith('#/join/') && !parseLink(location.hash);

export function App() {
  const [projectId, setProjectId] = useState(route);
  const [joining, setJoining] = useState(() => parseLink(location.hash));
  const [broken, setBroken] = useState(badLink);
  const [room, setRoom] = useState(sharedRoute);
  useEffect(() => {
    const onHash = () => {
      setProjectId(route());
      setJoining(parseLink(location.hash));
      setBroken(badLink());
      setRoom(sharedRoute());
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  // The start page keeps room for the notices at its foot, so they never sit over its links: see .library in styles.css.
  const notices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = notices.current!;
    const sized = new ResizeObserver(() => document.documentElement.style.setProperty('--notices', `${el.offsetHeight}px`));
    sized.observe(el);
    return () => sized.disconnect();
  }, []);
  return (
    <>
      {split(location.pathname).rest === 'privacy' ? (
        <Privacy />
      ) : joining ? (
        <Join binding={joining} />
      ) : broken ? (
        <Lost title={m.app.brokenLinkTitle}>{m.app.brokenLink}</Lost>
      ) : room ? (
        <OpenShared key={room} room={room} />
      ) : projectId ? (
        <Suspense fallback={<Opening />}>
          <Workspace key={projectId} id={projectId} />
        </Suspense>
      ) : (
        <Library />
      )}
      <PasswordDialog />
      <div className="toasts" ref={notices}>
        <AppUpdates />
        <ProgressNotice />
        <Unsent />
      </div>
    </>
  );
}
