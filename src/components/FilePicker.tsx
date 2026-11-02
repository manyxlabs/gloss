import { useRef, useState } from 'react';
import { addDocs } from '../store/project';

export function FilePicker({ label, primary, onProblems }: { label: string; primary?: boolean; onProblems: (problems: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className={primary ? 'primary' : 'add'} disabled={busy} onClick={() => input.current!.click()}>
        {busy ? 'Adding…' : `+ ${label}`}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
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
