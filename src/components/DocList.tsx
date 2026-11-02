import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Ellipsis, FileText, FileUp, Files, Folder, FolderInput, FolderPlus, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { addDocFolder, moveDoc, orderedDocs, placeDoc, removeDocFolder, renameDocFolder, type Place } from '../store/docs';
import { PANES, removeDoc, setActiveDoc, useStore, type Pane } from '../store/project';
import type { DocFolder, DocMeta, ZoteroItem } from '../types';
import { byline } from '../zotero';
import { Menu } from './Menu';
import { ReplaceDialog } from './ReplaceDialog';
import { ZoteroDialog } from './ZoteroDialog';

/** Dragged between tabs and rows of the list to reorder documents. */
export const DOC_MIME = 'application/x-gloss-doc';

export const confirmRemove = (d: DocMeta) =>
  confirm(`Remove “${d.name}” from this project, with its highlights, comments and the excerpts made from it? Undo brings it all back.`) && removeDoc(d.id);

type Dialog = { replace: DocMeta } | { zotero: true } | { send: DocMeta & { zotero: ZoteroItem } };

/**
 * Every document of the project in one list, opened from the tabs: pinned ones first, then each
 * folder, then the rest. Documents are opened in this pane, pinned, filed, reordered by dragging or
 * from their menu, replaced with a newer version, and imported from Zotero.
 */
export function DocList({ pane, onProblems }: { pane: Pane; onProblems: (problems: string[]) => void }) {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const show = (d: Dialog) => (setOpen(null), setDialog(d));
  return (
    <>
      <button
        className="icon"
        aria-label="All documents"
        title="All documents, in folders"
        aria-haspopup="dialog"
        aria-expanded={!!open}
        onClick={(e) => setOpen(open ? null : e.currentTarget)}
      >
        <Files size={16} />
      </button>
      {open && (
        <Menu anchor={open} label="All documents" panel="doc-list" onClose={() => setOpen(null)}>
          <Panel pane={pane} onDone={() => setOpen(null)} onDialog={show} />
        </Menu>
      )}
      {dialog && 'replace' in dialog && <ReplaceDialog doc={dialog.replace} onClose={() => setDialog(null)} />}
      {dialog && !('replace' in dialog) && <ZoteroDialog send={'send' in dialog ? dialog.send : undefined} onClose={() => setDialog(null)} onProblems={onProblems} />}
    </>
  );
}

function Panel({ pane, onDone, onDialog }: { pane: Pane; onDone: () => void; onDialog: (d: Dialog) => void }) {
  const project = useStore((s) => s.project);
  const current = useStore((s) => s[PANES[pane]]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [menu, setMenu] = useState<{ doc: DocMeta; button: HTMLElement } | { folder: DocFolder; button: HTMLElement } | null>(null);
  if (!project) return null;

  const docs = orderedDocs(project);
  const folders = [...project.docFolders].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const known = new Set(folders.map((f) => f.id));
  const groupOf = (d: DocMeta): Place => (d.pinned ? { pinned: true } : { folder: d.folder && known.has(d.folder) ? d.folder : null, pinned: false });
  const pinned = docs.filter((d) => d.pinned);
  const loose = docs.filter((d) => !d.pinned && !(d.folder && known.has(d.folder)));

  const dragged = (e: DragEvent) => e.dataTransfer.types.includes(DOC_MIME);
  const onRowOver = (e: DragEvent, d: DocMeta) => {
    if (!dragged(e)) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setDrop({ id: d.id, after: e.clientY > box.top + box.height / 2 });
  };
  const onRowDrop = (e: DragEvent, d: DocMeta) => {
    const id = e.dataTransfer.getData(DOC_MIME);
    if (!id || !drop) return;
    e.preventDefault();
    setDrop(null);
    if (id === d.id) return;
    const i = docs.findIndex((x) => x.id === d.id);
    moveDoc(id, drop.after ? (docs.slice(i + 1).find((x) => x.id !== id)?.id ?? null) : d.id, groupOf(d));
  };
  const onFolderDrop = (e: DragEvent, folder: string) => {
    const id = e.dataTransfer.getData(DOC_MIME);
    if (!id) return;
    e.preventDefault();
    setDrop(null);
    placeDoc(id, { folder, pinned: false });
  };

  const row = (d: DocMeta) => (
    <li
      key={d.id}
      className={`doc-row${drop?.id === d.id ? (drop.after ? ' drop-after' : ' drop-before') : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DOC_MIME, d.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => onRowOver(e, d)}
      onDrop={(e) => onRowDrop(e, d)}
      onDragEnd={() => setDrop(null)}
    >
      <button className="doc-open" aria-current={d.id === current ? 'page' : undefined} onClick={() => (setActiveDoc(d.id, pane), onDone())}>
        <FileText size={15} aria-hidden="true" />
        <span className="what">
          <span className="title">{d.name}</span>
          {d.zotero && (
            <span className="by">
              {byline(d.zotero)}
              {d.zotero.citationKey && <span className="cite-key">@{d.zotero.citationKey}</span>}
            </span>
          )}
        </span>
      </button>
      <button
        className="icon pin"
        aria-label={d.pinned ? `Unpin ${d.name}` : `Pin ${d.name}`}
        title={d.pinned ? 'Unpin' : 'Pin: shown first'}
        aria-pressed={!!d.pinned}
        onClick={() => placeDoc(d.id, { pinned: !d.pinned })}
      >
        <Pin size={15} />
      </button>
      <button
        className="icon"
        aria-label={`Actions for ${d.name}`}
        aria-haspopup="menu"
        aria-expanded={menu && 'doc' in menu ? menu.doc.id === d.id : false}
        onClick={(e) => setMenu({ doc: d, button: e.currentTarget })}
      >
        <Ellipsis size={16} />
      </button>
    </li>
  );

  const docMenu = (d: DocMeta) => {
    const i = docs.findIndex((x) => x.id === d.id);
    const zotero = d.zotero;
    const close = () => setMenu(null);
    return (
      <>
        <button role="menuitem" onClick={() => (placeDoc(d.id, { pinned: !d.pinned }), close())}>
          {d.pinned ? <PinOff size={16} /> : <Pin size={16} />} {d.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button role="menuitem" disabled={i === 0} onClick={() => (moveDoc(d.id, docs[i - 1]!.id, { pinned: !!docs[i - 1]!.pinned }), close())}>
          <ArrowUp size={16} /> Move up
        </button>
        <button role="menuitem" disabled={i === docs.length - 1} onClick={() => (moveDoc(d.id, docs[i + 2]?.id ?? null, { pinned: !!docs[i + 1]!.pinned }), close())}>
          <ArrowDown size={16} /> Move down
        </button>
        {folders.length > 0 && <hr />}
        {folders.map((f) => (
          <button key={f.id} role="menuitemradio" aria-checked={d.folder === f.id} onClick={() => (placeDoc(d.id, { folder: f.id }), close())}>
            <FolderInput size={16} /> In {f.name}
          </button>
        ))}
        {folders.length > 0 && (
          <button role="menuitemradio" aria-checked={!(d.folder && known.has(d.folder))} onClick={() => (placeDoc(d.id, { folder: null }), close())}>
            <FolderInput size={16} /> In no folder
          </button>
        )}
        <hr />
        <button role="menuitem" onClick={() => onDialog({ replace: d })}>
          <FileUp size={16} /> Replace with a newer version…
        </button>
        {zotero && (
          <button role="menuitem" onClick={() => onDialog({ send: { ...d, zotero } })}>
            <BookOpen size={16} /> Send notes to Zotero…
          </button>
        )}
        <hr />
        <button role="menuitem" className="danger" onClick={() => (close(), confirmRemove(d))}>
          <Trash2 size={16} /> Remove from project
        </button>
      </>
    );
  };

  return (
    <>
      <div className="doc-list-head">
        <h2>Documents</h2>
        <button className="icon" aria-label="New folder" title="New folder" onClick={() => setRenaming(addDocFolder('New folder'))}>
          <FolderPlus size={16} />
        </button>
        <button className="icon" aria-label="Add from Zotero" title="Add from your Zotero library" onClick={() => onDialog({ zotero: true })}>
          <BookOpen size={16} />
        </button>
      </div>
      <ul className="doc-list-body" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {pinned.length > 0 && (
          <li className="doc-group">
            <span className="doc-group-name">
              <Pin size={13} aria-hidden="true" /> Pinned
            </span>
            <ul>{pinned.map(row)}</ul>
          </li>
        )}
        {folders.map((f) => {
          const inside = docs.filter((d) => !d.pinned && d.folder === f.id);
          const shut = collapsed.has(f.id);
          return (
            <li key={f.id} className="doc-group folder" onDragOver={(e) => dragged(e) && e.preventDefault()} onDrop={(e) => onFolderDrop(e, f.id)}>
              <div className="folder-head">
                {renaming === f.id ? (
                  <input
                    aria-label="Folder name"
                    defaultValue={f.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== f.name) renameDocFolder(f.id, name);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        e.currentTarget.value = f.name;
                      }
                      if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                    }}
                  />
                ) : (
                  <button className="folder-toggle" aria-expanded={!shut} onClick={() => setCollapsed((c) => new Set(shut ? [...c].filter((x) => x !== f.id) : [...c, f.id]))}>
                    <ChevronDown size={14} className="chevron" aria-hidden="true" />
                    <Folder size={15} aria-hidden="true" />
                    <span className="title">{f.name}</span>
                    <span className="count">{inside.length}</span>
                  </button>
                )}
                <button className="icon" aria-label={`Actions for folder ${f.name}`} aria-haspopup="menu" onClick={(e) => setMenu({ folder: f, button: e.currentTarget })}>
                  <Ellipsis size={16} />
                </button>
              </div>
              {!shut && (inside.length ? <ul>{inside.map(row)}</ul> : <p className="side-empty">Drag documents here.</p>)}
            </li>
          );
        })}
        {loose.length > 0 && (
          <li className="doc-group">
            {(pinned.length > 0 || folders.length > 0) && <span className="doc-group-name">Not in a folder</span>}
            <ul>{loose.map(row)}</ul>
          </li>
        )}
      </ul>
      {menu && (
        <Menu anchor={menu.button} label={'doc' in menu ? menu.doc.name : menu.folder.name} onClose={() => setMenu(null)}>
          {'doc' in menu ? (
            docMenu(menu.doc)
          ) : (
            <>
              <button role="menuitem" onClick={() => (setRenaming(menu.folder.id), setMenu(null))}>
                <Pencil size={16} /> Rename
              </button>
              <button role="menuitem" className="danger" onClick={() => (removeDocFolder(menu.folder.id), setMenu(null))}>
                <Trash2 size={16} /> Delete folder
              </button>
            </>
          )}
        </Menu>
      )}
    </>
  );
}
