import { FileDown, FoldVertical, Link2, Lock, PenLine, Search, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteProject, listProjects, putProject } from '../store/db';
import type { Project } from '../types';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (s < 60) return 'just now';
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const FEATURES = [
  [Link2, 'Excerpts that remember', 'Every card opens the document at the passage it came from, and every passage shows its card.'],
  [FoldVertical, 'Squeeze the pages between', 'Pinch two distant passages together, or select what is in between and squeeze it, to read them side by side.'],
  [PenLine, 'Write by hand', 'Draw on the page or the canvas with a finger, a mouse or a stylus, which writes even without picking the pen.'],
  [Search, 'Search everything', 'One box searches every page of every PDF and every note you wrote.'],
  [FileDown, 'Take it with you', 'Export the PDF with your highlights and handwriting as real annotations, or your notes as Markdown.'],
  [Lock, 'Private by design', 'Your PDFs and notes stay in this browser. Nothing is uploaded, and there is no account.'],
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

  useEffect(() => {
    document.title = 'Margin · Read, excerpt and connect PDFs';
    void listProjects().then(setProjects);
  }, []);

  const start = async (files: File[]) => {
    setBusy(true);
    try {
      const name = files[0]?.name.replace(/\.pdf$/i, '') ?? 'Untitled project';
      // Loaded here rather than imported above, so pdf.js is not part of the start page.
      const { importFiles, newProject } = await import('../store/project');
      const { project, problems } = await importFiles(newProject(name), files);
      setProblems(problems);
      if (files.length && !project.docs.length) return;
      await putProject(project);
      location.hash = `#/p/${project.id}`;
    } finally {
      setBusy(false);
    }
  };

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
          Margin <small>by Manyx Labs</small>
        </span>
        <ThemeToggle />
      </header>

      <main className="wrap">
        <section className="hero">
          <div>
            <span className="eyebrow">
              <Sparkles size={14} /> Free, private, in your browser
            </span>
            <h1>
              Read PDFs next to <em>a canvas for your thinking.</em>
            </h1>
            <p>Pull passages out of your documents, arrange and connect them, write by hand, and jump back to the exact line any excerpt came from.</p>
            <div className="actions">
              <button className="primary big" disabled={busy} onClick={() => input.current!.click()}>
                {busy ? 'Opening…' : 'Open PDFs'}
              </button>
              <button className="big" disabled={busy} onClick={() => void start([])}>
                New empty project
              </button>
            </div>
            <p className="hint">or drop PDFs anywhere on this page</p>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
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

        {projects && projects.length > 0 && (
          <section aria-labelledby="projects-h">
            <h2 id="projects-h">Your projects</h2>
            <ul className="projects">
              {projects.map((p) => (
                <li key={p.id} className="glass">
                  <a href={`#/p/${p.id}`}>
                    <strong>{p.name}</strong>
                    <span>
                      {plural(p.docs.length, 'PDF')} · {plural(p.cards.length, 'card')} · {ago(p.updatedAt)}
                    </span>
                  </a>
                  <button
                    className="ghost"
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      if (!confirm(`Delete “${p.name}” and its PDFs from this browser? This cannot be undone.`)) return;
                      await deleteProject(p);
                      setProjects(await listProjects());
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="foot">
        <a href="https://manyxlabs.com" target="_blank" rel="noopener">
          Manyx Labs
        </a>
        <a href="https://github.com/manyxlabs/margin" target="_blank" rel="noopener">
          Source on GitHub
        </a>
        <a href="https://github.com/manyxlabs/margin/issues" target="_blank" rel="noopener">
          Report a problem
        </a>
      </footer>
    </div>
  );
}
