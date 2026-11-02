import { useEffect } from 'react';
import { listProjects, putProject } from '../store/db';
import type { Binding } from '../sync/crypto';

// One join per room at a time, so a repeated effect cannot make two copies of the project.
const joins = new Map<string, Promise<string>>();

async function join(binding: Binding) {
  const bound = (await listProjects()).find((p) => p.sync?.room === binding.room);
  if (bound) return bound.id;
  // Loaded here rather than imported above, so pdf.js is not part of the start page.
  const { newProject } = await import('../store/project');
  const project = { ...newProject('Shared project'), sync: binding };
  await putProject(project);
  return project.id;
}

/** Opens the project a share link is for: the copy on this device, or a new one that fills in from the room. */
export function Join({ binding }: { binding: Binding }) {
  useEffect(() => {
    let pending = joins.get(binding.room);
    if (!pending) joins.set(binding.room, (pending = join(binding).finally(() => joins.delete(binding.room))));
    // Replaced rather than added, so the key does not stay in this tab's history.
    void pending.then((id) => location.replace(`#/p/${id}`));
  }, [binding]);
  return null;
}
