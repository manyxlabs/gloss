import { ChevronDown, NotebookText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { download, outline, toMarkdown } from '../export';
import { useStore } from '../store/project';

const FORMATS = [
  ['Markdown (.md)', 'md', async () => new Blob([toMarkdown(useStore.getState().project!)], { type: 'text/markdown' })],
  // The PDF and Word writers are large, so they load on first use.
  ['PDF (.pdf)', 'pdf', async () => (await import('../notesPdf')).notesPdf(outline(useStore.getState().project!))],
  ['Word (.docx)', 'docx', async () => (await import('../notesDocx')).notesDocx(outline(useStore.getState().project!))],
] as const;

export function ExportMenu({ disabled, onProblems }: { disabled: boolean; onProblems: (problems: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) && setOpen(false);
    addEventListener('pointerdown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="export menu-wrap" ref={root}>
      <button aria-haspopup="menu" aria-expanded={open} title="Download the canvas and highlights as notes" disabled={disabled || busy} onClick={() => setOpen(!open)}>
        <NotebookText size={16} /> {busy ? 'Exporting…' : 'Export notes'} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu glass" role="menu">
          {FORMATS.map(([label, ext, make]) => (
            <button
              key={ext}
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                setBusy(true);
                try {
                  download(`${useStore.getState().project!.name}.${ext}`, await make());
                } catch (err) {
                  onProblems([`The notes could not be exported: ${(err as Error).message}`]);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
