import { FolderMinus, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/project';
import { deleteTag, manageTags, mergeTags, recolorTag, removeCategory, renameCategory, renameTag, setCategory, tagNamed, useTagView } from '../store/tags';
import { byCategory, cardTags } from '../tags';
import type { Tag } from '../types';
import { ColorPicker } from './ColorPicker';
import { m } from '../i18n';

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
        <h2 id="tags-h">{m.canvasTags.tags}</h2>
        <button className="icon" aria-label={m.canvasExport.close} title={m.canvasExport.close} onClick={() => dialog.current?.close()}>
          <X size={17} />
        </button>
      </header>
      <form
        className="new-tag"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const name = String(form.get('name') ?? '');
          if (useStore.getState().project?.tags.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return setProblem(m.canvasTags.exists(name.trim()));
          if (tagNamed(name, String(form.get('category') ?? ''))) e.currentTarget.reset();
          setProblem(null);
        }}
      >
        <input name="name" aria-label={m.canvasTags.new} placeholder={m.canvasTags.new} required />
        <input name="category" aria-label={m.canvasTags.itsCategory} placeholder={m.canvasTags.categoryOptional} list="tag-categories" />
        <button type="submit" className="primary">
          <Plus size={16} /> {m.canvasTags.addButton}
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
      {!project.tags.length && <p>{m.canvasTags.intro}</p>}
      <div className="tag-groups">
        {byCategory(project.tags).map((g) => (
          <section key={g.category ?? ''} aria-label={g.category ?? m.canvasTags.noCategory}>
            <div className="category">
              {g.category ? (
                <>
                  <input
                    key={g.category}
                    aria-label={m.canvasTags.categoryName}
                    defaultValue={g.category}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.category && renameCategory(g.category!, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <button
                    className="icon"
                    aria-label={m.canvasTags.removeCategory(g.category)}
                    title={m.canvasTags.removeCategoryTitle}
                    onClick={() => removeCategory(g.category!)}
                  >
                    <FolderMinus size={16} />
                  </button>
                </>
              ) : (
                <h3>{m.canvasTags.noCategory}</h3>
              )}
            </div>
            <ul>
              {g.tags.map((t) => (
                <li key={t.id} className="tag-row">
                  <input
                    key={t.name}
                    className="tag-title"
                    aria-label={m.canvasTags.nameOf(t.name)}
                    defaultValue={t.name}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (!name || name === t.name) return void (e.target.value = t.name);
                      if (renameTag(t.id, name)) return setProblem(null);
                      setProblem(m.canvasTags.existsMerge(name));
                      e.target.value = t.name;
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  <span className="uses" title={m.canvasTags.uses}>
                    {uses(t)}
                  </span>
                  <button
                    className="icon"
                    aria-label={m.canvasTags.delete(t.name)}
                    title={m.canvasTags.deleteTitle}
                    onClick={() => {
                      const n = uses(t);
                      if (!n || confirm(m.canvasTags.deleteConfirm(t.name, n))) deleteTag(t.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  <div className="tag-colors" role="group" aria-label={m.canvasTags.colourOf(t.name)}>
                    <button
                      type="button"
                      aria-pressed={!t.color}
                      aria-label={m.canvasTags.noColour}
                      title={m.canvasTags.noColour}
                      className={`swatch none${t.color ? '' : ' current'}`}
                      onClick={() => recolorTag(t.id, undefined)}
                    />
                    <ColorPicker current={t.color} label={(name) => name} onPick={(c) => recolorTag(t.id, c)} />
                  </div>
                  <input
                    key={`${t.id}:${t.category ?? ''}`}
                    className="tag-category"
                    aria-label={m.canvasTags.categoryOf(t.name)}
                    placeholder={m.canvasTags.noCategory}
                    list="tag-categories"
                    defaultValue={t.category ?? ''}
                    onBlur={(e) => e.target.value.trim() !== (t.category ?? '') && setCategory(t.id, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                  {project.tags.length > 1 && (
                    <select aria-label={m.canvasTags.mergeLabel(t.name)} value="" onChange={(e) => e.target.value && mergeTags([t.id], e.target.value)}>
                      <option value="">{m.canvasTags.merge}</option>
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
