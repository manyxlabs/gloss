import { Share, X } from 'lucide-react';
import { download, useUnsent } from '../download';

/** Offers to send a file whose share sheet could not open by itself (see useUnsent). */
export function Unsent() {
  const file = useUnsent((s) => s.file);
  if (!file) return null;
  const close = () => useUnsent.setState({ file: null });
  return (
    <div className="toast glass" role="status">
      <span>“{file.name}” is ready.</span>
      <button
        className="primary"
        onClick={() => {
          close();
          // Refused a second time, by a setting or a policy, it is saved instead.
          navigator.share({ files: [file] }).catch((err: Error) => err.name !== 'AbortError' && download(file.name, file));
        }}
      >
        <Share size={15} /> Send
      </button>
      <button className="icon" aria-label="Dismiss" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
