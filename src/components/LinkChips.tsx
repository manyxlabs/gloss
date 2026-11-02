import { Check, FileText, Highlighter, Link, MessageSquare, SquareStack, StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getProject, listProjects } from '../store/db';
import { useStore } from '../store/project';
import { hashOf, IN_TEXT, isIn, KINDS, linkTo, parseLink, snippetOf, type GlossLink, type Kind, type Target } from '../targets';
import type { Project } from '../types';

const ICONS: Record<Kind, typeof Link> = { h: Highlighter, c: StickyNote, m: MessageSquare, v: SquareStack, d: FileText };

/** Copies a link to something in the open project, which opens the project there wherever it is pasted. */
export function CopyLink({ target, className = 'icon', text, role }: { target: Target; className?: string; text?: string; role?: 'menuitem' }) {
  const [copied, setCopied] = useState(false);
  const label = `Copy link to this ${KINDS[target.kind]}`;
  return (
    <button
      type="button"
      role={role}
      className={className}
      aria-label={copied ? 'Link copied' : label}
      title={copied ? 'Link copied' : label}
      onClick={async () => {
        const p = useStore.getState().project;
        if (!p) return;
        await navigator.clipboard.writeText(linkTo(p, target));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={16} /> : <Link size={16} />}
      {text && <span>{copied ? 'Copied' : text}</span>}
    </button>
  );
}

/** Other projects on this device, read once for the links that lead to them. */
async function projectOf(l: GlossLink): Promise<Project | undefined> {
  return 'project' in l ? getProject(l.project) : (await listProjects()).find((p) => p.sync?.room === l.room);
}

/** `href` opens the project by its id on this device, so a link to a shared project opens in place. */
type Chip = { link: GlossLink; href: string; text: string | null; where?: string };

/**
 * The Gloss links in a note or comment, each a chip with a few words of what it leads to, which goes
 * there: in this project, or another one on this device.
 */
export function LinkChips({ text }: { text: string }) {
  const project = useStore((s) => s.project);
  const [others, setOthers] = useState<Record<string, Project | null>>({});
  const links = [...new Set(text.match(IN_TEXT) ?? [])].flatMap((url) => {
    const l = parseLink(url);
    return l ? [l] : [];
  });
  const away = links.filter((l) => project && !isIn(project, l));
  const key = away.map(hashOf).join(' ');
  useEffect(() => {
    let stale = false;
    for (const l of away) void projectOf(l).then((p) => !stale && setOthers((o) => ({ ...o, [hashOf(l)]: p ?? null })));
    return () => void (stale = true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!project || !links.length) return null;
  const chips: Chip[] = links.map((link) => {
    const local = (p: Project) => hashOf({ kind: link.kind, id: link.id, project: p.id });
    if (isIn(project, link)) return { link, href: local(project), text: snippetOf(project, link) };
    const other = others[hashOf(link)];
    return {
      link,
      href: other ? local(other) : hashOf(link),
      text: other ? snippetOf(other, link) : null,
      where: other?.name ?? (other === null ? 'Not on this device' : undefined),
    };
  });
  return (
    <div className="link-chips nodrag">
      {chips.map(({ link, href, text, where }) => {
        const Icon = ICONS[link.kind];
        const gone = text === null && (isIn(project, link) || where !== undefined);
        return (
          <a
            key={hashOf(link)}
            href={href}
            className={gone ? 'gone' : undefined}
            title={gone ? `This ${KINDS[link.kind]} is not here any more` : `Go to this ${KINDS[link.kind]}${where ? ` in “${where}”` : ''}`}
          >
            <Icon size={13} aria-hidden="true" />
            <span className="text">{text ?? (gone ? `A ${KINDS[link.kind]} no longer here` : '…')}</span>
            {where && <span className="where">{where}</span>}
          </a>
        );
      })}
    </div>
  );
}
