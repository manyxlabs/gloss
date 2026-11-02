import { FolderMinus, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/project';
import { deleteTag, manageTags, mergeTags, recolorTag, removeCategory, renameCategory, renameTag, setCategory, tagNamed, useTagView } from '../store/tags';
import { byCategory, cardTags } from '../tags';
import type { Tag } from '../types';
import { ColorPicker } from './ColorPicker';

/** Makes, renames, recolours, files, merges and deletes the project's tags, and renames or removes their categories. */
export function TagsDialog() {
  const open = useTagView((s) => s.managing);
  const project = useStore((s) => s.project);
  const dialog = useRef<HTMLDialogElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  if (!project) return null;
  const uses = (t: Tag) =>
    project.highlights.filter((h) => h.tags?.includes(t.id)).length + project.cards.filter((c) => c.data.kind !== 'excerpt' && cardTags(project, c).includes(t.id)).length;
  const categories = [...new Set(project.tags.flatMap((t) => (t.category ? [t.category] : [])))].sort();

  return (
    <dialog
      ref={dialog}
      className="sheet glass tags-dialog"
      aria-labelledby="tags-h"
      onClose={() => manageTags(false)}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
    >
      <header>
        <h2 id="tags-h">Tags</h2>
        <button className="icon" aria-label="Close" title="Close" onClick={() => dialog.current?.close()}>
          <X size={17} />
        </button>
      </header>
      <form
        className="new-tag"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const name = String(form.get('name') ?? '');
          if (useStore.getState().project?.tags.some((t) => t.name.toLowerCase() === name.trim().toLowerCase()))
            return setProblem(`There is a tag named “${name.trim()}” already.`);
          if (tagNamed(name, String(form.get('category') ?? ''))) e.currentTarget.reset();
          setProblem(null);
        }}
      >
        <input name="name" aria-label="New tag" placeholder="New tag" required />
        <input name="category" aria-label="Its category" placeholder="Category (optional)" list="tag-categories" />
        <button type="submit" className="primary">
          <Plus size={16} /> Add
        </button>
      </form>
      <datalist id="tag-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {problem && (
        <p className="tag-problem" role="alert">
          {problem}
        </p>
      )}
      {!project.tags.length && <p>Tags mark passages and cards to find them again. Make one here, or from the tag button on a highlight, a selection or a card.</p>}
      <div className="tag-groups">
        {byCategory(project.tags).map((g) => (
          <section key={g.category ?? ''} aria-label={g.category ?? 'No category'}>
            <div className="category">
              {g.category ? (
                <>
                  <input
                    key={g.category}
                    aria-label="Category name"
                    defaultValue={g.category}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.category && renameCategory(g.category!, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <button className="icon" aria-label={`Remove category ${g.category}`} title="Remove the category; its tags are kept" onClick={() => removeCategory(g.category!)}>
                    <FolderMinus size={16} />
                  </button>
                </>
              ) : (
                <h3>No category</h3>
              )}
            </div>
            <ul>
              {g.tags.map((t) => (
                <li key={t.id} className="tag-row">
                  <input
                    key={t.name}
                    className="tag-title"
                    aria-label={`Name of ${t.name}`}
                    defaultValue={t.name}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (!name || name === t.name) return void (e.target.value = t.name);
                      if (renameTag(t.id, name)) return setProblem(null);
                      setProblem(`There is a tag named “${name}” already. To make them one, merge them.`);
                      e.target.value = t.name;
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <span className="uses" title="Passages and cards with this tag">
                    {uses(t)}
                  </span>
                  <button
                    className="icon"
                    aria-label={`Delete tag ${t.name}`}
                    title="Delete the tag; what carried it is kept"
                    onClick={() => {
                      const n = uses(t);
                      if (!n || confirm(`Delete the tag “${t.name}”? It comes off ${n} passage${n === 1 ? '' : 's'} and card${n === 1 ? '' : 's'}; they are kept.`))
                        deleteTag(t.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  <div className="tag-colors" role="group" aria-label={`Colour of ${t.name}`}>
                    <button
                      type="button"
                      aria-pressed={!t.color}
                      aria-label="No colour"
                      title="No colour"
                      className={`swatch none${t.color ? '' : ' current'}`}
                      onClick={() => recolorTag(t.id, undefined)}
                    />
                    <ColorPicker current={t.color} label={(name) => name} onPick={(c) => recolorTag(t.id, c)} />
                  </div>
                  <input
                    key={`${t.id}:${t.category ?? ''}`}
                    className="tag-category"
                    aria-label={`Category of ${t.name}`}
                    placeholder="No category"
                    list="tag-categories"
                    defaultValue={t.category ?? ''}
                    onBlur={(e) => e.target.value.trim() !== (t.category ?? '') && setCategory(t.id, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  {project.tags.length > 1 && (
                    <select aria-label={`Merge ${t.name} into`} value="" onChange={(e) => e.target.value && mergeTags([t.id], e.target.value)}>
                      <option value="">Merge into…</option>
                      {project.tags
                        .filter((o) => o.id !== t.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}
