import { ArrowDown, ArrowUp, Bookmark as BookmarkIcon, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { bookmarksOf, moveBookmark, removeBookmark, renameBookmark } from '../../store/bookmarks';
import { showPage, useStore, type Pane } from '../../store/project';
import type { Bookmark } from '../../types';
import { CopyLink } from '../LinkChips';
import { Menu } from '../Menu';
import { m } from '../../i18n';
import { rich } from '../../i18n/rich';

const MIME = 'application/x-gloss-bookmark';

/** A document's bookmarks, in the reader's order: each goes to its place, and can be renamed, moved by dragging or from its menu, and deleted. */
export function Bookmarks({ docId, pane, fresh, onJump }: { docId: string; pane: Pane; fresh: string | null; onJump: () => void }) {
  const all = useStore((s) => s.project?.bookmarks);
  const marks = all ? bookmarksOf({ bookmarks: all }, docId) : [];
  const [renaming, setRenaming] = useState<string | null>(fresh);
  const [menu, setMenu] = useState<{ mark: Bookmark; button: HTMLElement } | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [seen, setSeen] = useState(fresh);
  // A bookmark just made is named in place.
  if (fresh !== seen) {
    setSeen(fresh);
    setRenaming(fresh);
  }

  const onDrop = (e: DragEvent, b: Bookmark) => {
    const id = e.dataTransfer.getData(MIME);
    if (!id || !drop) return;
    e.preventDefault();
    setDrop(null);
    const i = marks.findIndex((x) => x.id === b.id);
    if (id !== b.id) moveBookmark(id, drop.after ? (marks.slice(i + 1).find((x) => x.id !== id)?.id ?? null) : b.id);
  };

  if (!marks.length) return <p className="side-empty">{rich(m.docSidebar.noBookmarks, { icon: (label) => <BookmarkIcon size={13} aria-label={label} /> })}</p>;
  return (
    <>
      <ul className="bookmarks" aria-label={m.docSidebar.bookmarks} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {marks.map((b) => (
          <li
            key={b.id}
            className={drop?.id === b.id ? (drop.after ? 'drop-after' : 'drop-before') : undefined}
            draggable={renaming !== b.id}
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, b.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(MIME)) return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              setDrop({ id: b.id, after: e.clientY > box.top + box.height / 2 });
            }}
            onDrop={(e) => onDrop(e, b)}
            onDragEnd={() => setDrop(null)}
          >
            {renaming === b.id ? (
              <input
                className="rename"
                aria-label={m.docSidebar.bookmarkName}
                defaultValue={b.name}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== b.name) renameBookmark(b.id, name);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') e.currentTarget.value = b.name;
                  if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                }}
              />
            ) : (
              <button
                className="bookmark"
                onClick={() => {
                  showPage(docId, b.page, { pane, y: b.y });
                  onJump();
                }}
              >
                <span className="what">
                  <BookmarkIcon size={14} aria-hidden="true" />
                  <span className="text">{b.name}</span>
                  <span className="page">{m.doc.pageShort(b.page)}</span>
                </span>
              </button>
            )}
            <button className="icon" aria-label={m.doc.actionsFor(b.name)} aria-haspopup="menu" onClick={(e) => setMenu({ mark: b, button: e.currentTarget })}>
              <Ellipsis size={16} />
            </button>
          </li>
        ))}
      </ul>
      {menu && (
        <Menu anchor={menu.button} label={menu.mark.name} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => (setRenaming(menu.mark.id), setMenu(null))}>
            <Pencil size={16} /> {m.doc.rename}
          </button>
          <CopyLink target={{ kind: 'b', id: menu.mark.id }} role="menuitem" className="" text={m.doc.copyLink} />
          <button
            role="menuitem"
            disabled={marks[0]?.id === menu.mark.id}
            onClick={() => (moveBookmark(menu.mark.id, marks[marks.findIndex((x) => x.id === menu.mark.id) - 1]!.id), setMenu(null))}
          >
            <ArrowUp size={16} /> {m.doc.moveUp}
          </button>
          <button
            role="menuitem"
            disabled={marks.at(-1)?.id === menu.mark.id}
            onClick={() => (moveBookmark(menu.mark.id, marks[marks.findIndex((x) => x.id === menu.mark.id) + 2]?.id ?? null), setMenu(null))}
          >
            <ArrowDown size={16} /> {m.doc.moveDown}
          </button>
          <hr />
          <button role="menuitem" className="danger" onClick={() => (removeBookmark(menu.mark.id), setMenu(null))}>
            <Trash2 size={16} /> {m.doc.delete}
          </button>
        </Menu>
      )}
    </>
  );
}
