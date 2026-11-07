import { useEffect } from 'react';
import { listProjects, putProject } from '../store/db';
import type { Binding } from '../sync/crypto';
import { joinScreens } from '../sync/state';
import { m } from '../i18n';

// One join per room at a time, so a repeated effect cannot make two copies of the project.
const joins = new Map<string, Promise<string>>();

async function join(binding: Binding) {
  const bound = (await listProjects()).find((p) => p.sync?.room === binding.room);
  if (bound) return bound.id;
  // Loaded here rather than imported above, so pdf.js is not part of the start page.
  const { newProject } = await import('../store/project');
  const project = { ...newProject(m.homeSync.sharedProject), sync: binding };
  await putProject(project);
  return project.id;
}

/** Opens the project a share link is for: the copy on this device, or a new one that fills in from the room; a link to another screen also links this one. */
export function Join({ binding: { room, key, screen } }: { binding: Binding & { screen?: string } }) {
  useEffect(() => {
    let pending = joins.get(room);
    if (!pending) joins.set(room, (pending = join({ room, key }).finally(() => joins.delete(room))));
    void pending.then((id) => {
      if (screen) joinScreens(id, screen);
      // Replaced rather than added, so the key does not stay in this tab's history.
      location.replace(`#/p/${id}`);
    });
  }, [room, key, screen]);
  return null;
}
