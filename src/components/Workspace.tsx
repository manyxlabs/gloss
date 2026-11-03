import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { take } from '../notices';
import { takeArrival } from '../arrive';
import { closeProject, openProject, redo, rename, setView, showCard, showPage, showSource, undo, useStore } from '../store/project';
import { Canvas } from './Canvas';
import { DocPanes } from './DocPanes';
import { ExportMenu } from './ExportMenu';
import { InkLink } from './InkLink';
import { Lost } from './Lost';
import { useLinkTarget } from './OpenLink';
import { Search } from './Search';
import { Palette } from './Palette';
import { openScreen } from '../sync/state';
import { Screens, useShown } from './Screens';
import { Share } from './Share';
import { TagsDialog } from './TagsDialog';
import { ThemeToggle } from './ThemeToggle';
import { useMedia } from '../panes';

const SPLIT_KEY = 'gloss:split';
const readSplit = () => {
  try {
    return Number(localStorage.getItem(SPLIT_KEY)) || 50;
  } catch {
    return 50;
  }
};

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function Workspace({ id }: { id: string }) {
  const project = useStore((s) => s.project);
  const [missing, setMissing] = useState(false);
  const [problems, setProblems] = useState<string[]>(take);
  const [split, setSplit] = useState(readSplit);
  const view = useStore((s) => s.view);
  const shown = useShown();
  const canUndo = useStore((s) => s.past.length > 0);
  // A phone's header, where buttons a fingertip wide leave no room for them all; as in the header's CSS.
  const compact = useMedia('(pointer: coarse) and (max-width: 760px)');
  const canRedo = useStore((s) => s.future.length > 0);
  const body = useRef<HTMLDivElement>(null);
  useLinkTarget((problem) => setProblems((p) => [...p, problem]));

  useEffect(() => {
    openScreen(id);
    void openProject(id).then((p) => {
      setMissing(!p);
      const to = p && takeArrival(p.id);
      if (to && 'cardId' in to) showCard(to.cardId);
      else if (to && 'highlightId' in to) showSource(to.highlightId);
      else if (to && 'docId' in to) showPage(to.docId, to.page, { query: to.query });
    });
    return closeProject;
  }, [id]);

  // Three documents need more room than the canvas's half: they take two thirds, until the divider is moved.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.thirdDocId !== null && prev.thirdDocId === null) setSplit((x) => Math.max(x, 66));
      }),
    [],
  );

  useEffect(() => {
    if (project) document.title = `${project.name} · Gloss`;
  }, [project?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || editable(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const drag = (e: React.PointerEvent) => {
    const box = body.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => setSplit(Math.min(80, Math.max(20, ((m.clientX - box.left) / box.width) * 100)));
    const up = () => {
      removeEventListener('pointermove', move);
      setSplit((s) => {
        try {
          localStorage.setItem(SPLIT_KEY, String(Math.round(s)));
        } catch {
          // Storage can be blocked; the split then resets on the next visit.
        }
        return s;
      });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
  };

  if (missing)
    return (
      <Lost title="This project is not here">
        Projects are kept in the browser they were made in. To open one on this device, open its share link here, or restore a backup of it from the start page.
      </Lost>
    );
  if (!project) return null;

  return (
    <div className="workspace field">
      <header className="bar">
        <a className="home" href="#/" aria-label="All projects" title="All projects">
          <ArrowLeft size={18} />
        </a>
        <input
          className="name"
          aria-label="Project name"
          defaultValue={project.name}
          key={`${project.id}:${project.name}`}
          onBlur={(e) => {
            const name = e.target.value.trim();
            // A project cannot be left without a name: an empty one goes back to what it was.
            if (name) rename(name);
            e.target.value = name || project.name;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.value = project.name;
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
        <span className="history">
          <button className="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 size={17} />
          </button>
          <button className="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 size={17} />
          </button>
        </span>
        <Search />
        <Screens />
        <Share />
        {/* On a phone the theme joins the exports in the header's More, which leaves the project's name room. */}
        <ExportMenu disabled={!project.cards.length && !project.highlights.length} onProblems={setProblems} more={compact && <ThemeToggle item />} />
        {!compact && <ThemeToggle />}
      </header>

      {shown === 'both' && (
        <div className="switch" role="tablist" aria-label="Show">
          <button role="tab" aria-selected={view === 'doc'} onClick={() => setView('doc')}>
            Document
          </button>
          <button role="tab" aria-selected={view === 'canvas'} onClick={() => setView('canvas')}>
            Canvas{project.cards.length ? ` (${project.cards.length})` : ''}
          </button>
        </div>
      )}

      {problems.length > 0 && (
        <div className="problems" role="alert">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <button aria-label="Dismiss" onClick={() => setProblems([])}>
            ×
          </button>
        </div>
      )}

      <div
        className={`panes ${shown === 'both' ? `show-${view}` : `alone show-${shown === 'canvas' ? 'canvas' : 'doc'}`}`}
        ref={body}
        style={{ '--split': `${split}%` } as React.CSSProperties}
      >
        <DocPanes onProblems={setProblems} only={typeof shown === 'number' ? shown : undefined} />
        <div className="divider" role="separator" aria-orientation="vertical" aria-label="Resize" onPointerDown={drag} />
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </div>
      <InkLink />
      <TagsDialog />
      <Palette />
    </div>
  );
}
