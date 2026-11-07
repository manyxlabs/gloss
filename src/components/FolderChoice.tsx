import { Folder, Folders } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { m } from '../i18n';

/** Asks whether a folder with subfolders opens as one project, or as a project for each subfolder; null when the reader cancels. */
export function FolderChoice({ name, projects, answer }: { name?: string; projects: number; answer: (many: boolean | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      className="sheet glass folder-choice"
      aria-labelledby="folder-choice-h"
      onClose={(e) => answer(e.currentTarget.returnValue === 'many' ? true : e.currentTarget.returnValue === 'one' ? false : null)}
    >
      <form method="dialog">
        <h2 id="folder-choice-h">{name ? m.homeFolderChoice.openNamed(name) : m.homeFolderChoice.openThese}</h2>
        <p>{name ? m.homeFolderChoice.questionNamed : m.homeFolderChoice.question}</p>
        <div className="folder-options">
          <button value="one" autoFocus>
            <Folder size={20} />
            <strong>{m.homeFolderChoice.one}</strong>
            <span>{m.homeFolderChoice.oneText}</span>
          </button>
          <button value="many">
            <Folders size={20} />
            <strong>{m.homeFolderChoice.many}</strong>
            <span>{m.homeFolderChoice.manyText(projects)}</span>
          </button>
        </div>
        <footer>
          <button value="">{m.home.cancel}</button>
        </footer>
      </form>
    </dialog>
  );
}
