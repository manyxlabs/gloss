import { Link2, Trash2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { CopyLink, LinkChips } from '../LinkChips';

/**
 * Writes or edits the comment pinned beside a highlight. Kept as a draft until saved, so the whole edit is one undo step.
 * `shared` is how many passages the comment is on; `onAttach` saves the draft and picks another passage for it.
 * Links to things in Gloss pasted in show as chips under it.
 */
export function NoteEditor({
  commentId,
  note,
  shared = 1,
  onSave,
  onCancel,
  onAttach,
  onDetach,
}: {
  commentId?: string;
  note?: string;
  shared?: number;
  onSave: (note: string) => void;
  onCancel: () => void;
  onAttach: (note: string) => void;
  onDetach: () => void;
}) {
  const [draft, setDraft] = useState(note ?? '');
  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <textarea
        aria-label="Comment"
        placeholder="Your comment"
        rows={3}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Escape keeps what was written rather than losing it; Cancel is there to throw it away.
          if (e.key === 'Escape') {
            e.preventDefault();
            if (draft.trim() && draft !== (note ?? '')) onSave(draft);
            else onCancel();
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave(draft);
        }}
      />
      <LinkChips text={draft} />
      {shared > 1 && <p className="shared">On {shared} passages. Editing it here edits it on all of them.</p>}
      <div className="row">
        {note !== undefined && (
          <button
            type="button"
            className="icon"
            aria-label="Remove comment"
            title={shared > 1 ? 'Remove the comment from every passage' : 'Remove comment'}
            onClick={() => onSave('')}
          >
            <Trash2 size={16} />
          </button>
        )}
        {shared > 1 && (
          <button type="button" className="icon" aria-label="Detach from this passage" title="Take the comment off this passage only" onClick={onDetach}>
            <Unlink size={16} />
          </button>
        )}
        {commentId && <CopyLink target={{ kind: 'm', id: commentId }} />}
        <button type="button" className="icon" aria-label="Attach to another passage" title="Attach to another passage" disabled={!draft.trim()} onClick={() => onAttach(draft)}>
          <Link2 size={16} />
        </button>
        <button type="button" className="push" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}
