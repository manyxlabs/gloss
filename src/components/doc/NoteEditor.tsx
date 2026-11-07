import { Link2, Trash2, Unlink } from 'lucide-react';
import { useRef, useState } from 'react';
import { CopyLink, LinkChips } from '../LinkChips';
import { MentionSuggest } from '../Mentions';
import { m } from '../../i18n';

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
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <textarea
        ref={field}
        aria-label={m.doc.comment}
        placeholder={m.docNote.placeholder}
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
      <MentionSuggest field={field} />
      <LinkChips text={draft} />
      {shared > 1 && <p className="shared">{m.docNote.shared(shared)}</p>}
      <div className="row">
        {note !== undefined && (
          <button type="button" className="icon" aria-label={m.docNote.remove} title={shared > 1 ? m.docNote.removeAll : m.docNote.remove} onClick={() => onSave('')}>
            <Trash2 size={16} />
          </button>
        )}
        {shared > 1 && (
          <button type="button" className="icon" aria-label={m.docNote.detach} title={m.docNote.detachTitle} onClick={onDetach}>
            <Unlink size={16} />
          </button>
        )}
        {commentId && <CopyLink target={{ kind: 'm', id: commentId }} />}
        <button type="button" className="icon" aria-label={m.docNote.attach} title={m.docNote.attach} disabled={!draft.trim()} onClick={() => onAttach(draft)}>
          <Link2 size={16} />
        </button>
        <button type="button" className="push" onClick={onCancel}>
          {m.doc.cancel}
        </button>
        <button type="submit" className="primary">
          {m.docNote.save}
        </button>
      </div>
    </form>
  );
}
