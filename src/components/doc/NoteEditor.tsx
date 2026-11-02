import { Trash2 } from 'lucide-react';
import { useState } from 'react';

/** Writes or edits the comment pinned beside a highlight. Kept as a draft until saved, so the whole edit is one undo step. */
export function NoteEditor({ note, onSave, onCancel }: { note?: string; onSave: (note: string) => void; onCancel: () => void }) {
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
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave(draft);
        }}
      />
      <div className="row">
        {note !== undefined && (
          <button type="button" className="icon" aria-label="Remove comment" title="Remove comment" onClick={() => onSave('')}>
            <Trash2 size={16} />
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}
