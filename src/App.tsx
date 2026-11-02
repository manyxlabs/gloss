import { lazy, Suspense, useEffect, useState } from 'react';
import { Join } from './components/Join';
import { Library } from './components/Library';
import { Lost } from './components/Lost';
import { OpenShared } from './components/OpenLink';
import { AppUpdates } from './components/AppUpdates';
import { PasswordDialog } from './components/PasswordDialog';
import { parseLink } from './sync/crypto';

// pdf.js and the canvas are most of the app's weight, so the start page does not wait for them.
const Workspace = lazy(() => import('./components/Workspace').then((m) => ({ default: m.Workspace })));

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
  return (
    <>
      {joining ? (
        <Join binding={joining} />
      ) : broken ? (
        <Lost title="This share link is not complete">
          Part of the link is missing, so the project it shares cannot be opened. Ask for the link again, and copy all of it, up to the very end.
        </Lost>
      ) : room ? (
        <OpenShared key={room} room={room} />
      ) : projectId ? (
        <Suspense>
          <Workspace key={projectId} id={projectId} />
        </Suspense>
      ) : (
        <Library />
      )}
      <PasswordDialog />
      <AppUpdates />
    </>
  );
}
