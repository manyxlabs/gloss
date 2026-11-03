import { FolderUp, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { chosenFolder } from '../convert/folder';
import { ACCEPT } from '../convert/formats';
import { addFolder } from '../store/docs';
import { addDocs } from '../store/project';

/** Adds files to the open project, or with `folder` every file in a folder and the folders inside it. */
export function FilePicker({
  label,
  kind = 'add',
  folder,
  onProblems,
}: {
  label: string;
  kind?: 'add' | 'primary' | 'icon' | 'text';
  folder?: boolean;
  onProblems: (problems: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const Icon = folder ? FolderUp : Plus;
  return (
    <>
      <button
        className={kind === 'text' ? undefined : kind}
        disabled={busy}
        aria-label={busy ? 'Adding…' : label}
        title={folder ? 'Add every file Gloss can open from a folder, and from the folders inside it' : 'Add PDFs, Word or PowerPoint files, images, text or Markdown'}
        onClick={() => input.current!.click()}
      >
        {busy && kind !== 'icon' ? (
          'Adding…'
        ) : (
          <>
            <Icon size={kind === 'icon' ? 16 : 15} /> {kind !== 'icon' && <span className="label">{label}</span>}
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        // Spread, as React's types do not know the attribute that picks a folder.
        {...(folder ? { webkitdirectory: '' } : { accept: ACCEPT, multiple: true })}
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          setBusy(true);
          try {
            onProblems(await (folder ? addFolder(Promise.resolve(chosenFolder(files))) : addDocs(files)));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
