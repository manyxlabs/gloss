import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { LanguageSelect } from './LanguageSelect';
import { useMedia } from '../panes';
import { isCard } from '../ink';
import { PeopleItems } from './Presence';

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
  const cards = project.cards.filter(isCard).length;

  return (
    <div className="workspace field">
      <header className="bar">
        <a className="home" href="#/" aria-label="All projects" title="All projects">
          <ArrowLeft size={18} />
        </a>
        <ProjectName name={project.name} id={project.id} wrap={compact} />
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
        {/* On a phone the theme, and who is here, join the exports in the header's More, which leaves the project's name room. */}
        <ExportMenu
          disabled={!project.cards.length && !project.highlights.length}
          onProblems={setProblems}
          more={
            compact && (
              <>
                <ThemeToggle item />
                <LanguageSelect item />
                {project.sync && <PeopleItems />}
              </>
            )
          }
        />
        {!compact && <LanguageSelect />}
        {!compact && <ThemeToggle />}
      </header>

      {shown === 'both' && (
        <div className="switch" role="tablist" aria-label="Show">
          <button role="tab" aria-selected={view === 'doc'} onClick={() => setView('doc')}>
            Document
          </button>
          <button role="tab" aria-selected={view === 'canvas'} onClick={() => setView('canvas')}>
            Canvas{cards ? ` (${cards})` : ''}
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

/**
 * The project's name, renamed in place. On a phone, where the header leaves it little room, it wraps onto
 * a second line, and while it is being edited the header's other buttons step aside for it.
 */
function ProjectName({ name, id, wrap }: { name: string; id: string; wrap: boolean }) {
  const area = useRef<HTMLTextAreaElement>(null);
  // A textarea has no height of its own content, so it is fitted to its lines (CSS caps it at two) as its width or words change.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    el.addEventListener('input', fit);
    return () => {
      observer.disconnect();
      el.removeEventListener('input', fit);
    };
  }, [wrap, name, id]);
  const props = {
    className: 'name',
    'aria-label': 'Project name',
    defaultValue: name,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = e.target.value.replace(/\s+/g, ' ').trim();
      // A project cannot be left without a name: an empty one goes back to what it was.
      if (next) rename(next);
      e.target.value = next || name;
      e.target.scrollTop = 0;
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') e.currentTarget.value = name;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };
  return wrap ? <textarea key={`${id}:${name}`} ref={area} rows={1} {...props} /> : <input key={`${id}:${name}`} {...props} />;
}
