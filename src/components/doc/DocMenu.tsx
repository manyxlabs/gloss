import { EllipsisVertical, Lock } from 'lucide-react';
import { useState } from 'react';
import { privateWarning, setDocLocal } from '../../store/privacy';
import { useStore } from '../../store/project';
import type { DocMeta } from '../../types';
import { CopyLink } from '../LinkChips';
import { Menu } from '../Menu';

/** What else can be done with the document on show: copy a link to it, and keep it on this device only. */
export function DocMenu({ doc }: { doc: DocMeta }) {
  const [button, setButton] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        className="icon"
        aria-label="More for this document"
        title="More for this document"
        aria-haspopup="menu"
        aria-expanded={!!button}
        onClick={(e) => setButton(button ? null : e.currentTarget)}
      >
        <EllipsisVertical size={17} />
      </button>
      {button && (
        <Menu anchor={button} label="More for this document" onClose={() => setButton(null)}>
          <CopyLink target={{ kind: 'd', id: doc.id }} role="menuitem" className="" text="Copy link to this document" />
          <button
            role="menuitemcheckbox"
            aria-checked={!!doc.local}
            title="In a shared project, a document kept on this device is never sent, with everything on it, and the others’ copies are removed."
            onClick={() => {
              if (!doc.local && useStore.getState().project?.sync && !confirm(privateWarning(`“${doc.name}”`))) return;
              setButton(null);
              setDocLocal(doc.id, !doc.local);
            }}
          >
            <Lock size={16} /> Only on this device
          </button>
        </Menu>
      )}
    </>
  );
}
