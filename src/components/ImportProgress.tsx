import { useProgress } from '../store/progress';

/** How far an import of many files has got, such as a folder's. */
export function ImportProgress() {
  const at = useProgress((s) => s.at);
  if (!at) return null;
  return (
    <div className="toast glass import-progress" role="status">
      <span>{at.total === undefined ? 'Finding the files…' : `Adding files: ${at.done} of ${at.total}`}</span>
      <progress aria-label="Files added" value={at.total === undefined ? undefined : at.done} max={at.total || 1} />
    </div>
  );
}
