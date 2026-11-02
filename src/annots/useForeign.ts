import { useEffect, useState } from 'react';
import { foreignAnnotations, type Foreign } from './read';

/** The annotations from other apps in a document's current version; empty until they are read, or if it cannot be. */
export function useForeign(docId: string, password: string | undefined, file: string | undefined) {
  const key = `${docId}@${file}`;
  const [state, setState] = useState<{ key: string; found: Foreign[] } | null>(null);
  useEffect(() => {
    let stale = false;
    foreignAnnotations(docId, password).then(
      (found) => !stale && setState({ key, found }),
      () => {},
    );
    return () => void (stale = true);
  }, [docId, password, key]);
  return state?.key === key ? state.found : null;
}
