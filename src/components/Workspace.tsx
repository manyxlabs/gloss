import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { take } from '../notices';
import { closeProject, openProject, redo, rename, setView, undo, useStore } from '../store/project';
import { Canvas } from './Canvas';
import { DocPane } from './DocPane';
import { ExportMenu } from './ExportMenu';
import { InkLink } from './InkLink';
import { LinkBanner } from './LinkBanner';
import { Lost } from './Lost';
import { Search } from './Search';
import { Share } from './Share';
import { ThemeToggle } from './ThemeToggle';

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
  const side = useStore((s) => s.sideDocId !== null);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void openProject(id).then((p) => setMissing(!p));
    return closeProject;
  }, [id]);

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
        <Share />
        <ExportMenu disabled={!project.cards.length && !project.highlights.length} onProblems={setProblems} />
        <ThemeToggle />
      </header>

      <div className="switch" role="tablist" aria-label="Show">
        <button role="tab" aria-selected={view === 'doc'} onClick={() => setView('doc')}>
          Document
        </button>
        <button role="tab" aria-selected={view === 'canvas'} onClick={() => setView('canvas')}>
          Canvas{project.cards.length ? ` (${project.cards.length})` : ''}
        </button>
      </div>

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

      <div className={`panes show-${view}`} ref={body} style={{ '--split': `${split}%` } as React.CSSProperties}>
        <div className={`docs${side ? ' split' : ''}`}>
          <DocPane pane={0} onProblems={setProblems} />
          {side && <DocPane pane={1} onProblems={setProblems} />}
          <LinkBanner />
        </div>
        <div className="divider" role="separator" aria-orientation="vertical" aria-label="Resize" onPointerDown={drag} />
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </div>
      <InkLink />
    </div>
  );
}
