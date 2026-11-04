import { FolderOpen, MonitorDown, FileDown, FoldVertical, Link2, Lock, PenLine, Search, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BackupError, isBackup, restore } from '../backup';
import type { ConvertOptions, Input } from '../convert';
import { chosenFolder, droppedFolder, groupBy, openable, type FolderFile } from '../convert/folder';
import { ACCEPT } from '../convert/formats';
import { leave } from '../notices';
import { listProjects, putProject } from '../store/db';
import { withProgress } from '../store/progress';
import type { Project } from '../types';
import { AllSearch } from './AllSearch';
import { CloudPicker } from './CloudPicker';
import { FolderChoice } from './FolderChoice';
import { Logo } from './Logo';
import { Projects } from './Projects';
import { ThemeToggle } from './ThemeToggle';
import { useInstall } from '../install';
import { WebPicker } from './WebPicker';

// index.html's title, read before any page changes it, so it is written in one place.
const HOME_TITLE = document.title;

const FEATURES = [
  [Link2, 'Excerpts that remember', 'Every card opens the document at the passage it came from, and every passage shows its card.'],
  [FoldVertical, 'Squeeze the pages between', 'Pinch two distant passages together, or select what is in between and squeeze it, to read them side by side.'],
  [PenLine, 'Write by hand', 'Draw on the page or the canvas with a finger, a mouse or a stylus, which writes even without picking the pen.'],
  [Search, 'Search everything', 'One box searches every page of every PDF and every note you wrote.'],
  [FileDown, 'Take it with you', 'Export the PDF with your highlights and handwriting as real annotations, or your notes as Markdown, PDF or Word.'],
  [Lock, 'Private by design', 'Your PDFs and notes stay in this browser unless you share a project, and then only encrypted. There is no account.'],
] as const;

/** A page with highlights on the left, the cards they became on the right. */
function Illustration() {
  return (
    <svg className="art" viewBox="0 0 360 220" role="img" aria-label="A page with highlighted passages linked to cards beside it">
      <rect x="8" y="8" width="150" height="204" rx="8" fill="var(--panel)" stroke="var(--border)" />
      {[30, 44, 58, 86, 100, 114, 128, 156, 170, 184].map((y, i) => (
        <rect key={y} x="24" y={y} width={i % 3 === 2 ? 80 : 118} height="5" rx="2.5" fill="var(--border)" />
      ))}
      <rect x="22" y="83" width="122" height="25" rx="3" fill="var(--hl-yellow)" opacity="0.7" />
      <rect x="22" y="153" width="122" height="11" rx="3" fill="var(--hl-blue)" opacity="0.7" />
      <path d="M150 95 C 185 95, 185 52, 214 52" fill="none" stroke="var(--edge-yellow)" strokeDasharray="3 4" />
      <path d="M150 158 C 185 158, 185 160, 214 160" fill="none" stroke="var(--edge-blue)" strokeDasharray="3 4" />
      <g>
        <rect x="214" y="26" width="138" height="56" rx="8" fill="var(--panel)" stroke="var(--border)" />
        <rect x="214" y="26" width="4" height="56" rx="2" fill="var(--edge-yellow)" />
        <rect x="228" y="40" width="110" height="5" rx="2.5" fill="var(--muted)" opacity="0.5" />
        <rect x="228" y="52" width="90" height="5" rx="2.5" fill="var(--muted)" opacity="0.5" />
        <rect x="228" y="66" width="44" height="8" rx="4" fill="var(--panel-2)" />
      </g>
      <g>
        <rect x="214" y="134" width="138" height="52" rx="8" fill="var(--panel)" stroke="var(--border)" />
        <rect x="214" y="134" width="4" height="52" rx="2" fill="var(--edge-blue)" />
        <rect x="228" y="148" width="104" height="5" rx="2.5" fill="var(--muted)" opacity="0.5" />
        <rect x="228" y="162" width="44" height="8" rx="4" fill="var(--panel-2)" />
      </g>
      <path d="M283 82 C 283 105, 300 110, 300 134" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <rect x="296" y="96" width="56" height="22" rx="6" fill="var(--accent-soft)" stroke="var(--accent)" />
      <rect x="304" y="105" width="40" height="4" rx="2" fill="var(--accent)" opacity="0.7" />
    </svg>
  );
}

export function Library() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [choice, setChoice] = useState<{ name?: string; projects: number; answer: (many: boolean | null) => void } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const install = useInstall();

  useEffect(() => {
    document.title = HOME_TITLE;
    void listProjects().then(setProjects);
  }, []);

  /** `earlier` holds problems met before, such as files that could not be downloaded, to show with any others. */
  const start = async (all: Input[], how: ConvertOptions = {}, earlier: string[] = []) => {
    setBusy(true);
    try {
      const failed = [...earlier];
      // Backups come back as the projects they hold; anything else starts a new project.
      const backups = all.filter((i): i is File => i instanceof File && isBackup(i));
      const inputs = all.filter((i) => !(i instanceof File && isBackup(i)));
      const restored: string[] = [];
      for (const b of backups) {
        try {
          // Restoring adds a copy each time, which is rarely meant twice over.
          const project = await restore(b, (name, original) =>
            confirm(
              original ? `“${name}”, the project in this backup, is already here. Restore a copy of it?` : `This backup was already restored as “${name}”. Restore another copy?`,
            ),
          );
          if (project) restored.push(project.id);
        } catch (err) {
          failed.push(err instanceof BackupError ? err.message : `${b.name} could not be restored.`);
        }
      }
      setProblems(failed);
      if (backups.length && !inputs.length) {
        if (restored.length === 1) location.hash = `#/p/${restored[0]}`;
        else setProjects(await listProjects());
        return;
      }
      // Loaded here rather than imported above, so pdf.js is not part of the start page.
      const { importFiles, newProject, UNTITLED } = await import('../store/project');
      const { project, problems } = await importFiles(newProject(UNTITLED), inputs, how);
      setProblems([...failed, ...problems]);
      if (inputs.length && !project.docs.length) return;
      await putProject({ ...project, name: project.docs[0]?.name ?? project.name });
      leave([...failed, ...problems]);
      location.hash = `#/p/${project.id}`;
    } finally {
      setBusy(false);
    }
  };
  /** A folder becomes one project, its subfolders becoming folders of documents, or a project for each subfolder. */
  const startFolder = async (read: Promise<FolderFile[]>) => {
    setBusy(true);
    try {
      const { files, problems } = openable(await withProgress('Finding the files…', () => read));
      // One folder on its own names the project, and only what is inside it is arranged.
      const root = new Set(files.map((f) => f.path[0])).size === 1 ? files[0]?.path[0] : undefined;
      const inside = root ? files.map((f) => ({ ...f, path: f.path.slice(1) })) : files;
      const tops = groupBy(inside, (f) => f.path[0] ?? '');
      const many = inside.some((f) => f.path.length) && (await new Promise<boolean | null>((answer) => setChoice({ name: root, projects: tops.size, answer })));
      setChoice(null);
      if (many === null) return;
      const plans = many ? [...tops].map(([name, group]) => ({ name: name || root, files: group.map((f) => ({ ...f, path: f.path.slice(1) })) })) : [{ name: root, files: inside }];
      const { importFolder } = await import('../store/docs');
      const { newProject, UNTITLED } = await import('../store/project');
      const made: string[] = [];
      await withProgress('Adding files', async (step) => {
        let done = 0;
        step(0, files.length);
        for (const plan of plans) {
          const { project, problems: more } = await importFolder(newProject(plan.name ?? UNTITLED), plan.files, (n) => step(done + n, files.length));
          done += plan.files.length;
          problems.push(...more);
          if (!project.docs.length) continue;
          await putProject({ ...project, name: plan.name ?? project.docs[0]!.name });
          made.push(project.id);
        }
      });
      setProblems(problems);
      if (made.length !== 1) return setProjects(await listProjects());
      leave(problems);
      location.hash = `#/p/${made[0]}`;
    } finally {
      setBusy(false);
    }
  };
  // An empty start would make an empty project, which is not what picking files that all failed means.
  const fromCloud = (files: File[], problems: string[]) => (files.length ? start(files, {}, problems) : setProblems(problems));
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  // Opened from the file manager by the installed app: the files start a project like any others.
  useEffect(() => {
    const queue = (window as { launchQueue?: { setConsumer: (f: (p: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue;
    queue?.setConsumer(async ({ files }) => {
      if (files.length) void startRef.current(await Promise.all(files.map((f) => f.getFile())));
    });
  }, []);

  // Shared to Gloss from another app: the files wait in a cache, put there by public/share-target.js.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('shared')) return;
    history.replaceState(null, '', `/${location.hash}`);
    void (async () => {
      const cache = await caches.open('gloss-shared');
      const files = await Promise.all(
        (await cache.keys()).map(async (key) => {
          const res = (await cache.match(key))!;
          return new File([await res.blob()], decodeURIComponent(res.headers.get('x-name') ?? ''), { type: res.headers.get('content-type') ?? '' });
        }),
      );
      await caches.delete('gloss-shared');
      if (files.length) void startRef.current(files);
    })();
  }, []);

  // Someone with projects comes back to them first; the introduction is for a first visit.
  const returning = !!projects?.length;
  const actions = (
    <div className="actions">
      <button className="primary big" disabled={busy} onClick={() => input.current!.click()}>
        <FolderOpen size={18} /> {busy ? 'Opening…' : 'Open files'}
      </button>
      <WebPicker kind="big" add={(url, how) => start([{ url }], how)} />
    </div>
  );
  const more = (
    // Each link carries the dot before it; see .more in styles.css for how a line's first dot is hidden.
    <p className="more">
      <span>
        <span aria-hidden="true">·</span>
        <button className="link" disabled={busy} onClick={() => void start([])}>
          Start an empty project
        </button>
      </span>
      <span>
        <span aria-hidden="true">·</span>
        <button className="link" disabled={busy} onClick={() => folderInput.current!.click()}>
          Open a folder
        </button>
      </span>
      <span>
        <span aria-hidden="true">·</span>
        <button className="link" disabled={busy} onClick={() => restoreInput.current!.click()}>
          Restore a backup
        </button>
      </span>
    </p>
  );
  // A line of their own, so the cloud choices read as one set.
  const clouds = (
    <p className="more">
      <span>
        <span aria-hidden="true">·</span>
        <span className="from">Open from</span>
        <CloudPicker provider="Google Drive" kind="link" disabled={busy} add={fromCloud} />
      </span>
      <span>
        <span aria-hidden="true">·</span>
        <CloudPicker provider="Dropbox" kind="link" disabled={busy} add={fromCloud} />
      </span>
    </p>
  );
  const hint = (
    <p className="hint">
      <span className="mouse-only">Or drop files or folders anywhere here:</span>
      <span className="touch-only">Opens:</span>
      {['PDF', 'Word', 'PowerPoint', 'Images', 'Text', 'Markdown', 'Web pages', '.gloss backup'].map((f) => (
        <span key={f} className="chip">
          {f}
        </span>
      ))}
    </p>
  );
  const problemList = problems.length > 0 && (
    <div className="problems" role="alert">
      {problems.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
  return (
    <div
      className={`library field${dropping ? ' dropping' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={(e) => {
        setDropping(false);
        const folder = droppedFolder(e.dataTransfer);
        if (!folder && !e.dataTransfer.files.length) return;
        e.preventDefault();
        void (folder ? startFolder(folder) : start([...e.dataTransfer.files]));
      }}
    >
      <header className="bar">
        <span className="brand">
          <Logo />
          Gloss <small>by Manyx Labs</small>
        </span>
        {install && (
          <button className="ghost install" onClick={() => void install()}>
            <MonitorDown size={16} /> Install app
          </button>
        )}
        <ThemeToggle />
      </header>

      <main className={`wrap${returning ? ' returning' : ''}`}>
        {returning ? (
          <>
            {problemList}
            <AllSearch />
            <Projects projects={projects!} reload={async () => setProjects(await listProjects())} onProblems={setProblems} actions={actions} />
            {more}
            {clouds}
            {hint}
          </>
        ) : (
          projects && (
            <>
              <section className="hero">
                <div>
                  <span className="eyebrow">
                    <Sparkles size={14} /> Free, private, in your browser
                  </span>
                  <h1>
                    Read your documents next to <em>a canvas for your thinking.</em>
                  </h1>
                  <p>Pull passages out of your documents, arrange and connect them, write by hand, and jump back to the exact line any excerpt came from.</p>
                  {actions}
                  {more}
                  {clouds}
                  {hint}
                  {problemList}
                </div>
                <div className="art-frame glass">
                  <Illustration />
                </div>
              </section>
              <ul className="features">
                {FEATURES.map(([Icon, title, text]) => (
                  <li key={title} className="glass">
                    <Icon size={20} />
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </>
          )
        )}
        <input
          ref={restoreInput}
          type="file"
          accept=".gloss"
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void start(files);
          }}
        />
        <input
          ref={folderInput}
          type="file"
          // Spread, as React's types do not know the attribute that picks a folder.
          {...{ webkitdirectory: '' }}
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void startFolder(Promise.resolve(chosenFolder(files)));
          }}
        />
        {choice && <FolderChoice {...choice} />}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void start(files);
          }}
        />
      </main>

      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <a href="https://manyxlabs.com" target="_blank" rel="noopener">
        Manyx Labs
      </a>
      <a href="https://github.com/manyxlabs/gloss" target="_blank" rel="noopener">
        Source on GitHub
      </a>
      <a href="https://github.com/manyxlabs/gloss/issues" target="_blank" rel="noopener">
        Report a problem
      </a>
      <a href="/privacy">Privacy</a>
    </footer>
  );
}
