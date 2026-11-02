import { lazy, Suspense, useEffect, useState } from 'react';
import { Library } from './components/Library';

// pdf.js and the canvas are most of the app's weight, so the start page does not wait for them.
const Workspace = lazy(() => import('./components/Workspace').then((m) => ({ default: m.Workspace })));

const route = () => /^#\/p\/([\w-]+)$/.exec(location.hash)?.[1] ?? null;

export function App() {
  const [projectId, setProjectId] = useState(route);
  useEffect(() => {
    const onHash = () => setProjectId(route());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  return projectId ? (
    <Suspense>
      <Workspace key={projectId} id={projectId} />
    </Suspense>
  ) : (
    <Library />
  );
}
