import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listProjects } from '../store/db';
import { useStore } from '../store/project';
import { reveal } from '../store/reveal';
import { parseLink } from '../targets';
import { m } from '../i18n';
import { Lost } from './Lost';

/** Opens a link to something in a shared project at this device's copy of it, which is found by its room. */
export function OpenShared({ room }: { room: string }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let stale = false;
    void listProjects().then((all) => {
      const p = all.find((x) => x.sync?.room === room);
      const l = parseLink(location.hash);
      if (stale) return;
      if (p && l) location.replace(`#/p/${p.id}/${l.kind}/${l.id}`);
      else setMissing(true);
    });
    return () => void (stale = true);
  }, [room]);
  return missing ? <Lost title={m.homeLinks.notHereTitle}>{m.homeLinks.notHere}</Lost> : null;
}

/**
 * Shows what the address names in the open project, once it is open, and whenever a link to
 * something else in it is followed; the address then names just the project again.
 */
export function useLinkTarget(onMissing: (problem: string) => void) {
  const id = useStore((s) => s.project?.id);
  const missing = useRef(onMissing);
  useLayoutEffect(() => {
    missing.current = onMissing;
  });
  useEffect(() => {
    if (!id) return;
    let frame = 0;
    const go = () => {
      const l = parseLink(location.hash);
      if (!l || !('project' in l) || l.project !== id) return;
      history.replaceState(history.state, '', `#/p/${id}`);
      // After the canvas and the documents have drawn what they hold, so they can scroll to it.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!reveal(l)) missing.current(m.homeLinks.missing[l.kind]);
      });
    };
    go();
    addEventListener('hashchange', go);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('hashchange', go);
    };
  }, [id]);
}
