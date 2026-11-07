import { Share, X } from 'lucide-react';
import { download, useUnsent } from '../download';
import { m } from '../i18n';

/** Offers to send a file whose share sheet could not open by itself (see useUnsent). */
export function Unsent() {
  const file = useUnsent((s) => s.file);
  if (!file) return null;
  const close = () => useUnsent.setState({ file: null });
  return (
    <div className="toast glass" role="status">
      <span>{m.homeUnsent.ready(file.name)}</span>
      <button
        className="primary"
        onClick={() => {
          close();
          // Refused a second time, by a setting or a policy, it is saved instead.
          navigator.share({ files: [file] }).catch((err: Error) => err.name !== 'AbortError' && download(file.name, file));
        }}
      >
        <Share size={15} /> {m.homeUnsent.send}
      </button>
      <button className="icon" aria-label={m.common.dismiss} onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
