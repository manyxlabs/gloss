import { ChevronRight, Download, Ellipsis, Folder as FolderIcon, FolderInput, FolderPlus, LayoutGrid, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { backupOf } from '../backup';
import { download } from '../download';
import { isCard } from '../ink';
import { deleteFolder, deleteProject, listFolders, moveProject, putFolder } from '../store/db';
import type { Folder, Project } from '../types';
import { Menu } from './Menu';
import { locale, m } from '../i18n';

const PROJECT_MIME = 'application/x-gloss-project';

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
/** How long ago a time was, such as "5 minutes ago". */
export const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return m.home.justNow;
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
};

/** A name not yet taken by a folder: "New folder", then "New folder 2" and on. */
const freeName = (folders: Folder[]) => {
  const names = new Set(folders.map((f) => f.name));
  for (let i = 1; ; i++) if (!names.has(m.homeProjects.folderName(i))) return m.homeProjects.folderName(i);
};

/** Takes a project dragged by its card, for a folder or the top level to drop it in. */
function useDrop(onDrop: (projectId: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(PROJECT_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false),
      onDrop: (e: DragEvent) => {
        const id = e.dataTransfer.getData(PROJECT_MIME);
        setOver(false);
        if (!id) return;
        e.preventDefault();
        onDrop(id);
      },
    },
  };
}

/**
 * The projects in this browser, most recently opened first, in folders and at the top level. A
 * project is moved by its folder button or dragged onto a folder; deleting a folder keeps its
 * projects. Folders are kept on this device only, and are not shared with a synced project.
 */
/** `actions` are the ways to start another project, shown beside the heading. */
export function Projects({
  projects,
  reload,
  onProblems,
  actions,
}: {
  projects: Project[];
  reload: () => Promise<void>;
  onProblems: (problems: string[]) => void;
  actions?: ReactNode;
}) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ button: HTMLElement; project?: Project; folder?: Folder } | null>(null);

  useEffect(() => {
    void listFolders().then(setFolders);
  }, []);

  const refresh = async () => {
    setFolders(await listFolders());
    await reload();
  };
  const move = async (projectId: string, folder: string | null) => {
    setMenu(null);
    await moveProject(projectId, folder);
    await refresh();
  };
  const create = async (project?: Project) => {
    setMenu(null);
    const folder: Folder = { id: crypto.randomUUID(), name: freeName(folders ?? []), createdAt: Date.now() };
    await putFolder(folder);
    if (project) await moveProject(project.id, folder.id);
    await refresh();
    setRenaming(folder.id);
  };
  /** Shows a change to a folder at once, then keeps it. */
  const change = async (folder: Folder) => {
    setFolders((all) => all?.map((f) => (f.id === folder.id ? folder : f)) ?? null);
    await putFolder(folder);
    setFolders(await listFolders());
  };
  const rename = async (folder: Folder, name: string) => {
    setRenaming(null);
    if (name.trim() && name.trim() !== folder.name) await change({ ...folder, name: name.trim() });
  };
  const remove = async (folder: Folder, count: number) => {
    setMenu(null);
    if (count && !confirm(m.homeProjects.confirmDeleteFolder(folder.name, count))) return;
    await deleteFolder(folder.id);
    await refresh();
  };
  const collapse = (folder: Folder) => {
    const { collapsed: _, ...rest } = folder;
    return change(folder.collapsed ? rest : { ...rest, collapsed: true });
  };

  const top = useDrop((id) => void move(id, null));
  if (!folders || (!projects.length && !folders.length)) return null;
  const known = new Set(folders.map((f) => f.id));
  // A project filed in a folder that is not on this device, as from a backup made elsewhere, is at the top level.
  const loose = projects.filter((p) => !p.folder || !known.has(p.folder));

  const card = (p: Project) => (
    <li
      key={p.id}
      className="glass"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PROJECT_MIME, p.id);
        e.dataTransfer.effectAllowed = 'move';
        // After the drag has started: Chrome drops a drag whose element changes as it starts.
        setTimeout(() => setDragging(true));
      }}
      onDragEnd={() => setDragging(false)}
    >
      <a href={`#/p/${p.id}`} draggable={false}>
        <strong>{p.name}</strong>
        {/* Wrapped only between the facts, never inside one such as "just now". */}
        <span>
          {[m.homeProjects.documents(p.docs.length), m.homeProjects.cards(p.cards.filter(isCard).length), ago(p.openedAt ?? p.updatedAt)]
            .map((s) => s.replaceAll(' ', '\u00a0'))
            .join(' · ')}
        </span>
      </a>
      <button
        className="icon"
        aria-label={m.homeProjects.moveTo(p.name)}
        title={m.homeProjects.moveTitle}
        aria-haspopup="menu"
        aria-expanded={menu?.project === p}
        onClick={(e) => setMenu(menu?.project === p ? null : { button: e.currentTarget, project: p })}
      >
        <FolderInput size={17} />
      </button>
      <button
        className="icon"
        aria-label={m.homeProjects.backUp(p.name)}
        title={m.homeProjects.backUpTitle}
        onClick={async () => {
          try {
            download(`${p.name}.gloss`, await backupOf(p));
          } catch (err) {
            onProblems([(err as Error).message]);
          }
        }}
      >
        <Download size={17} />
      </button>
      <button
        className="icon danger"
        aria-label={m.homeProjects.delete(p.name)}
        title={m.homeProjects.deleteTitle}
        onClick={async () => {
          if (!confirm(m.homeProjects.confirmDelete(p.name))) return;
          await deleteProject(p);
          await reload();
        }}
      >
        <Trash2 size={17} />
      </button>
    </li>
  );

  return (
    <section aria-labelledby="projects-h" className={dragging ? 'dragging' : undefined}>
      <div className="projects-head">
        <h2 id="projects-h">{m.homeProjects.heading}</h2>
        <button className="ghost" onClick={() => void create()}>
          <FolderPlus size={16} /> {m.homeProjects.newFolder}
        </button>
        {actions}
      </div>
      {folders.map((f) => {
        const members = projects.filter((p) => p.folder === f.id);
        return (
          <FolderSection
            key={f.id}
            folder={f}
            count={members.length}
            renaming={renaming === f.id}
            onToggle={() => void collapse(f)}
            onRename={(name) => void rename(f, name)}
            onDrop={(id) => void move(id, f.id)}
            menuOpen={menu?.folder === f}
            onMenu={(button) => setMenu(menu?.folder === f ? null : { button, folder: f })}
          >
            {members.length ? <ul className="projects">{members.map(card)}</ul> : <p className="folder-empty">{m.homeProjects.folderEmpty}</p>}
          </FolderSection>
        );
      })}
      {(loose.length > 0 || dragging) && (
        <ul className={`projects top${top.over ? ' over' : ''}`} aria-label={folders.length ? m.homeProjects.loose : undefined} {...top.handlers}>
          {loose.map(card)}
          {!loose.length && <li className="drop-here">{m.homeProjects.dropHere}</li>}
        </ul>
      )}

      {menu?.project && (
        <Menu anchor={menu.button} label={m.homeProjects.move(menu.project.name)} onClose={() => setMenu(null)}>
          {folders.map((f) => (
            <button key={f.id} role="menuitemradio" aria-checked={menu.project!.folder === f.id} onClick={() => void move(menu.project!.id, f.id)}>
              <FolderIcon size={16} /> {f.name}
            </button>
          ))}
          <button role="menuitemradio" aria-checked={!menu.project.folder || !known.has(menu.project.folder)} onClick={() => void move(menu.project!.id, null)}>
            <LayoutGrid size={16} /> {m.homeProjects.noFolder}
          </button>
          <hr />
          <button role="menuitem" onClick={() => void create(menu.project)}>
            <FolderPlus size={16} /> {m.homeProjects.newFolderMenu}
          </button>
        </Menu>
      )}
      {menu?.folder && (
        <Menu anchor={menu.button} label={menu.folder.name} onClose={() => setMenu(null)}>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setRenaming(menu.folder!.id);
            }}
          >
            <Pencil size={16} /> {m.homeProjects.rename}
          </button>
          <button role="menuitem" className="danger" onClick={() => void remove(menu.folder!, projects.filter((p) => p.folder === menu.folder!.id).length)}>
            <Trash2 size={16} /> {m.homeProjects.deleteFolder}
          </button>
        </Menu>
      )}
    </section>
  );
}

function FolderSection({
  folder,
  count,
  renaming,
  onToggle,
  onRename,
  onDrop,
  menuOpen,
  onMenu,
  children,
}: {
  folder: Folder;
  count: number;
  renaming: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDrop: (projectId: string) => void;
  menuOpen: boolean;
  onMenu: (button: HTMLElement) => void;
  children: ReactNode;
}) {
  const drop = useDrop(onDrop);
  const open = !folder.collapsed;
  return (
    <section className={`folder${drop.over ? ' over' : ''}`} aria-label={folder.name} {...drop.handlers}>
      <header>
        {renaming ? (
          <input
            className="folder-name"
            aria-label={m.homeProjects.folderNameLabel}
            defaultValue={folder.name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => onRename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.currentTarget.value = folder.name;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <button className="folder-toggle" aria-expanded={open} onClick={onToggle}>
            <ChevronRight size={16} className="chevron" />
            <FolderIcon size={17} />
            <span className="folder-title">{folder.name}</span>
            <span className="count" aria-label={m.homeProjects.projects(count)}>
              {count}
            </span>
          </button>
        )}
        <button
          className="icon"
          aria-label={m.homeProjects.actionsFor(folder.name)}
          title={m.homeProjects.actionsTitle}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => onMenu(e.currentTarget)}
        >
          <Ellipsis size={17} />
        </button>
      </header>
      {open && children}
    </section>
  );
}
