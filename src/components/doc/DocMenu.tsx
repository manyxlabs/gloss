import { ChevronDown, ListCollapse, Lock } from 'lucide-react';
import { useState } from 'react';
import { privateWarning, setDocLocal } from '../../store/privacy';
import { useStore } from '../../store/project';
import type { DocMeta } from '../../types';
import { CopyLink } from '../LinkChips';
import { DocActions } from '../DocActions';
import { Menu } from '../Menu';
import { useSqueeze } from './Collapse';
import { m } from '../../i18n';

/** The open document's tab menu: copy a link to it, keep it on this device only, and its own actions (see DocActions). */
export function DocMenu({ doc, onProblems }: { doc: DocMeta; onProblems: (problems: string[]) => void }) {
  const [button, setButton] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        className="close nested"
        aria-label={m.docMenu.more}
        title={m.docMenu.more}
        aria-haspopup="menu"
        aria-expanded={!!button}
        onClick={(e) => setButton(button ? null : e.currentTarget)}
      >
        <ChevronDown size={13} />
      </button>
      {button && (
        <Menu anchor={button} label={m.docMenu.more} onClose={() => setButton(null)}>
          <CopyLink target={{ kind: 'd', id: doc.id }} role="menuitem" className="" text={m.docMenu.copyLink} />
          <button
            role="menuitemcheckbox"
            aria-checked={!!doc.local}
            title={m.docMenu.onlyHereTitle}
            onClick={() => {
              if (!doc.local && useStore.getState().project?.sync && !confirm(privateWarning(m.docMenu.named(doc.name)))) return;
              setButton(null);
              setDocLocal(doc.id, !doc.local);
            }}
          >
            <Lock size={16} /> {m.doc.onlyHere}
          </button>
          <button role="menuitem" onClick={() => (setButton(null), useSqueeze.setState({ docId: doc.id }))}>
            <ListCollapse size={16} /> {m.docSqueeze.menuItem}
          </button>
          <DocActions doc={doc} onClose={() => setButton(null)} onProblems={onProblems} />
        </Menu>
      )}
    </>
  );
}
