import { BookOpen, FileUp, FolderInput, Pin, PinOff, Share } from 'lucide-react';
import { create } from 'zustand';
import { send } from '../download';
import { annotatedPdf } from '../pdf/annotate';
import { fileKey, getFile } from '../store/db';
import { withProgress } from '../store/progress';
import { placeDoc } from '../store/docs';
import { useStore } from '../store/project';
import type { DocMeta, ZoteroItem } from '../types';
import { ReplaceDialog } from './ReplaceDialog';
import { ZoteroDialog } from './ZoteroDialog';

type Dialog = { replace: DocMeta } | { zotero: true } | { send: DocMeta & { zotero: ZoteroItem } };
const useDialog = create<{ dialog: Dialog | null }>(() => ({ dialog: null }));
/** Opens a dialog about documents, which outlives the menu or list it was opened from. */
export const openDocDialog = (dialog: Dialog) => useDialog.setState({ dialog });

/** The dialogs opened about documents: replacing one, and Zotero. Mounted once for every pane. */
export function DocDialogs({ onProblems }: { onProblems: (problems: string[]) => void }) {
  const dialog = useDialog((s) => s.dialog);
  const close = () => useDialog.setState({ dialog: null });
  if (!dialog) return null;
  if ('replace' in dialog) return <ReplaceDialog doc={dialog.replace} onClose={close} />;
  return <ZoteroDialog send={'send' in dialog ? dialog.send : undefined} onClose={close} onProblems={onProblems} />;
}

/** Sends a document's PDF, as it is or with its highlights, comments and handwriting written in, to another app. */
async function sendDoc(doc: DocMeta, annotated: boolean, onProblems: (problems: string[]) => void) {
  try {
    if (annotated) return await send(`${doc.name} (annotated).pdf`, await withProgress('Making the annotated PDF…', () => annotatedPdf(useStore.getState().project!, doc.id)));
    const file = await getFile(fileKey(doc));
    // Stored as it was added, a PDF may have no type, which the share sheet needs.
    if (file) await send(`${doc.name}.pdf`, file.slice(0, file.size, 'application/pdf'));
    else onProblems(['This PDF is missing from this browser’s storage.']);
  } catch (err) {
    onProblems([`The PDF could not be sent: ${(err as Error).message}`]);
  }
}

/** A document's own menu items: pinning, its folder, sending it, replacing it with a newer version, and sending its notes to Zotero. */
export function DocActions({ doc, onClose, onProblems }: { doc: DocMeta; onClose: () => void; onProblems: (problems: string[]) => void }) {
  const folders = useStore((s) => s.project?.docFolders) ?? [];
  const inFolder = folders.some((f) => f.id === doc.folder);
  const zotero = doc.zotero;
  return (
    <>
      <button role="menuitem" onClick={() => (placeDoc(doc.id, { pinned: !doc.pinned }), onClose())}>
        {doc.pinned ? <PinOff size={16} /> : <Pin size={16} />} {doc.pinned ? 'Unpin' : 'Pin'}
      </button>
      {folders.length > 0 && <hr />}
      {folders.map((f) => (
        <button key={f.id} role="menuitemradio" aria-checked={doc.folder === f.id} onClick={() => (placeDoc(doc.id, { folder: f.id }), onClose())}>
          <FolderInput size={16} /> In {f.name}
        </button>
      ))}
      {folders.length > 0 && (
        <button role="menuitemradio" aria-checked={!inFolder} onClick={() => (placeDoc(doc.id, { folder: null }), onClose())}>
          <FolderInput size={16} /> In no folder
        </button>
      )}
      <hr />
      <button role="menuitem" onClick={() => (onClose(), void sendDoc(doc, false, onProblems))}>
        <Share size={16} /> Send document…
      </button>
      <button role="menuitem" onClick={() => (onClose(), void sendDoc(doc, true, onProblems))}>
        <Share size={16} /> Send with annotations…
      </button>
      <button role="menuitem" onClick={() => (onClose(), openDocDialog({ replace: doc }))}>
        <FileUp size={16} /> Replace with a newer version…
      </button>
      {zotero && (
        <button role="menuitem" onClick={() => (onClose(), openDocDialog({ send: { ...doc, zotero } }))}>
          <BookOpen size={16} /> Send notes to Zotero…
        </button>
      )}
    </>
  );
}
