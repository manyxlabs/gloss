import { FolderOpen, MonitorDown, FileDown, FoldVertical, Link2, Lock, PenLine, Search, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BackupError, isBackup, restore } from '../backup';
import type { Input } from '../convert';
import { ACCEPT } from '../convert/formats';
import { leave } from '../notices';
import { listProjects, putProject } from '../store/db';
import type { Project } from '../types';
import { Logo } from './Logo';
import { Projects } from './Projects';
import { ThemeToggle } from './ThemeToggle';
import { useInstall } from '../install';
import { WebPicker } from './WebPicker';

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
  const input = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const install = useInstall();

  useEffect(() => {
    document.title = 'Gloss · Read, excerpt and connect PDFs';
    void listProjects().then(setProjects);
  }, []);

  const start = async (all: Input[]) => {
    setBusy(true);
    try {
      // Backups come back as the projects they hold; anything else starts a new project.
      const backups = all.filter((i): i is File => i instanceof File && isBackup(i));
      const inputs = all.filter((i) => !(i instanceof File && isBackup(i)));
      const restored: string[] = [];
      const failed: string[] = [];
      for (const b of backups) {
        try {
          restored.push((await restore(b)).id);
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
      const { importFiles, newProject } = await import('../store/project');
      const { project, problems } = await importFiles(newProject('Untitled project'), inputs);
      setProblems([...failed, ...problems]);
      if (inputs.length && !project.docs.length) return;
      await putProject({ ...project, name: project.docs[0]?.name ?? project.name });
      leave([...failed, ...problems]);
      location.hash = `#/p/${project.id}`;
    } finally {
      setBusy(false);
    }
  };
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
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void start([...e.dataTransfer.files]);
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

      <main className="wrap">
        <section className="hero">
          <div>
            <span className="eyebrow">
              <Sparkles size={14} /> Free, private, in your browser
            </span>
            <h1>
              Read your documents next to <em>a canvas for your thinking.</em>
            </h1>
            <p>Pull passages out of your documents, arrange and connect them, write by hand, and jump back to the exact line any excerpt came from.</p>
            <div className="actions">
              <button className="primary big" disabled={busy} onClick={() => input.current!.click()}>
                <FolderOpen size={18} /> {busy ? 'Opening…' : 'Open files'}
              </button>
              <WebPicker big add={(url) => start([{ url }])} />
            </div>
            <p className="more">
              <button className="link" disabled={busy} onClick={() => void start([])}>
                Start an empty project
              </button>
              <span aria-hidden="true">·</span>
              <button className="link" disabled={busy} onClick={() => restoreInput.current!.click()}>
                Restore a backup
              </button>
            </p>
            <p className="hint">
              Or drop files anywhere here:
              {['PDF', 'Word', 'PowerPoint', 'Images', 'Text', 'Markdown', '.gloss backup'].map((f) => (
                <span key={f} className="chip">
                  {f}
                </span>
              ))}
            </p>
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
            {problems.length > 0 && (
              <div className="problems" role="alert">
                {problems.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            )}
          </div>
          <div className="art-frame glass">
            <Illustration />
          </div>
        </section>

        {projects?.length === 0 && (
          <ul className="features">
            {FEATURES.map(([Icon, title, text]) => (
              <li key={title} className="glass">
                <Icon size={20} />
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        )}

        {projects && <Projects projects={projects} reload={async () => setProjects(await listProjects())} onProblems={setProblems} />}
      </main>

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
      </footer>
    </div>
  );
}
