import { Folder, Folders } from 'lucide-react';
import { useEffect, useRef } from 'react';

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
        <h2 id="folder-choice-h">{name ? `Open “${name}”` : 'Open these folders'}</h2>
        <p>{name && 'It has folders inside it. '}Keep them together in one project, or make a project of each?</p>
        <div className="folder-options">
          <button value="one" autoFocus>
            <Folder size={20} />
            <strong>One project</strong>
            <span>Each folder becomes a folder of documents in it.</span>
          </button>
          <button value="many">
            <Folders size={20} />
            <strong>A project for each folder</strong>
            <span>{projects} projects in your library.</span>
          </button>
        </div>
        <footer>
          <button value="">Cancel</button>
        </footer>
      </form>
    </dialog>
  );
}
