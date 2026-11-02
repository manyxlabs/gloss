import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, NotebookText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { download, toMarkdown } from '../export';
import { closeProject, openProject, redo, rename, setView, undo, useStore } from '../store/project';
import { Canvas } from './Canvas';
import { DocPane } from './DocPane';
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
  const [problems, setProblems] = useState<string[]>([]);
  const [split, setSplit] = useState(readSplit);
  const view = useStore((s) => s.view);
  const side = useStore((s) => s.sideDocId !== null);
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
      <main className="lost">
        <p>This project is not in this browser. Projects are kept only on the device they were made on.</p>
        <a href="#/">All projects</a>
      </main>
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
          onBlur={(e) => e.target.value.trim() && rename(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <Search />
        <Share />
        <button
          className="export"
          title="Download the canvas and highlights as Markdown notes"
          onClick={() => download(`${project.name}.md`, new Blob([toMarkdown(project)], { type: 'text/markdown' }))}
          disabled={!project.cards.length && !project.highlights.length}
        >
          <NotebookText size={16} /> Export notes
        </button>
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
        </div>
        <div className="divider" role="separator" aria-orientation="vertical" aria-label="Resize" onPointerDown={drag} />
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
