import { ChevronDown, ListCollapse, Lock } from 'lucide-react';
import { useState } from 'react';
import { privateWarning, setDocLocal } from '../../store/privacy';
import { useStore } from '../../store/project';
import type { DocMeta } from '../../types';
import { CopyLink } from '../LinkChips';
import { DocActions } from '../DocActions';
import { Menu } from '../Menu';
import { useSqueeze } from './Collapse';

/** The open document's tab menu: copy a link to it, keep it on this device only, and its own actions (see DocActions). */
export function DocMenu({ doc }: { doc: DocMeta }) {
  const [button, setButton] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        className="close nested"
        aria-label="More for this document"
        title="More for this document"
        aria-haspopup="menu"
        aria-expanded={!!button}
        onClick={(e) => setButton(button ? null : e.currentTarget)}
      >
        <ChevronDown size={13} />
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
          <button role="menuitem" onClick={() => (setButton(null), useSqueeze.setState({ docId: doc.id }))}>
            <ListCollapse size={16} /> Squeeze and defined terms…
          </button>
          <DocActions doc={doc} onClose={() => setButton(null)} />
        </Menu>
      )}
    </>
  );
}
