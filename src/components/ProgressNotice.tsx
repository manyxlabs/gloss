import { useProgress } from '../store/progress';
import { m } from '../i18n';

/** How far slow work has got, such as importing a folder or making a PDF to export. */
export function ProgressNotice() {
  const at = useProgress((s) => s.at);
  if (!at) return null;
  return (
    <div className="toast glass progress-notice" role="status">
      <span>{at.total === undefined ? at.text : m.homeProgress.count(at.text, at.done ?? 0, at.total)}</span>
      <progress aria-label={at.text} value={at.total === undefined ? undefined : at.done} max={at.total || 1} />
    </div>
  );
}
