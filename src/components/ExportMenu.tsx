import { ChevronDown, Ellipsis, NotebookText } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { send } from '../download';
import { download, outline, toMarkdown } from '../export';
import { withProgress } from '../store/progress';
import { useStore } from '../store/project';
import { openCanvasExport } from './CanvasExport';
import { CombinedExport } from './CombinedExport';
import { m } from '../i18n';

const FORMATS = [
  ['Markdown (.md)', 'md', async () => new Blob([toMarkdown(useStore.getState().project!)], { type: 'text/markdown' })],
  // The PDF and Word writers are large, so they load on first use.
  ['PDF (.pdf)', 'pdf', async () => (await import('../notesPdf')).notesPdf(outline(useStore.getState().project!))],
  ['Word (.docx)', 'docx', async () => (await import('../notesDocx')).notesDocx(outline(useStore.getState().project!))],
] as const;
/** Send opens the system's share sheet, to hand the notes to another app. */
const WAYS = [
  [m.workspace.download, m.workspace.downloadNotes, download],
  [m.workspace.send, m.workspace.sendNotes, send],
] as const;

/**
 * Exporting the notes. Where the header has no room for all its buttons, as on a phone, it is the
 * header's More instead, with the notes' exports and then `more`, and it opens even with nothing to export.
 */
export function ExportMenu({ disabled, onProblems, more }: { disabled: boolean; onProblems: (problems: string[]) => void; more?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [combining, setCombining] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const noCards = useStore((s) => !s.project?.cards.length);

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
      {more ? (
        <button className="icon" aria-haspopup="menu" aria-expanded={open} aria-label={m.workspace.more} title={m.workspace.more} onClick={() => setOpen(!open)}>
          <Ellipsis size={17} />
        </button>
      ) : (
        <button
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={busy ? m.workspace.exportingNotes : m.workspace.exportNotes}
          title={m.workspace.exportNotesTitle}
          disabled={disabled || busy}
          onClick={() => setOpen(!open)}
        >
          <NotebookText size={16} /> <span>{busy ? m.canvasExport.exporting : m.workspace.exportNotes}</span> <ChevronDown size={14} />
        </button>
      )}
      {open && (
        <div className="menu glass" role="menu">
          {WAYS.map(([how, howNotes, hand]) => (
            <div key={how} className="menu-group" role="group" aria-label={how}>
              <h4>{more ? howNotes : how}</h4>
              {FORMATS.map(([label, ext, make]) => (
                <button
                  key={ext}
                  role="menuitem"
                  disabled={disabled || busy}
                  onClick={async () => {
                    setOpen(false);
                    setBusy(true);
                    try {
                      await hand(`${useStore.getState().project!.name}.${ext}`, await withProgress(m.workspace.makingNotes, make));
                    } catch (err) {
                      onProblems([m.workspace.notesFailed((err as Error).message)]);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
          <hr />
          <button role="menuitem" disabled={noCards} onClick={() => (setOpen(false), openCanvasExport())}>
            {m.workspace.canvasPicture}
          </button>
          <button role="menuitem" onClick={() => (setOpen(false), setCombining(true))}>
            {m.workspace.docsPdf}
          </button>
          {more && (
            <>
              <hr />
              {more}
            </>
          )}
        </div>
      )}
      {combining && <CombinedExport onClose={() => setCombining(false)} />}
    </div>
  );
}
