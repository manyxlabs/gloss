import type { ReactNode } from 'react';
import { Logo } from './Logo';

/** A page for where Gloss cannot go: a project not in this browser, or a share link cut short. */
export function Lost({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="lost field">
      <div className="glass">
        <Logo />
        <h1>{title}</h1>
        <p>{children}</p>
        <a className="button primary" href="#/">
          All projects
        </a>
      </div>
    </main>
  );
}
