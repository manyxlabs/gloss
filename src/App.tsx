import { lazy, Suspense, useEffect, useState } from 'react';
import { Join } from './components/Join';
import { Library } from './components/Library';
import { AppUpdates } from './components/AppUpdates';
import { PasswordDialog } from './components/PasswordDialog';
import { parseLink } from './sync/crypto';

// pdf.js and the canvas are most of the app's weight, so the start page does not wait for them.
const Workspace = lazy(() => import('./components/Workspace').then((m) => ({ default: m.Workspace })));

const route = () => /^#\/p\/([\w-]+)$/.exec(location.hash)?.[1] ?? null;

export function App() {
  const [projectId, setProjectId] = useState(route);
  const [joining, setJoining] = useState(() => parseLink(location.hash));
  useEffect(() => {
    const onHash = () => {
      setProjectId(route());
      setJoining(parseLink(location.hash));
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      {joining ? (
        <Join binding={joining} />
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
