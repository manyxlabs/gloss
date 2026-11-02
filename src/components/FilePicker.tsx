import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ACCEPT } from '../convert/formats';
import { addDocs } from '../store/project';

export function FilePicker({ label, primary, onProblems }: { label: string; primary?: boolean; onProblems: (problems: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className={primary ? 'primary' : 'add'} disabled={busy} title="Add PDFs, Word or PowerPoint files, images, text or Markdown" onClick={() => input.current!.click()}>
        {busy ? (
          'Adding…'
        ) : (
          <>
            <Plus size={15} /> {label}
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          setBusy(true);
          try {
            onProblems(await addDocs(files));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
