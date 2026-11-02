import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/project';
import { KIND_OF, noticesFor, type Notice } from '../sync/notify';
import { PERSON, useActivity, useMe, type Activity } from '../sync/state';
import { Menu } from './Menu';

const SEEN = (projectId: string) => `gloss:seen:${projectId}`;
const readSeen = (projectId: string) => {
  try {
    return Number(localStorage.getItem(SEEN(projectId))) || 0;
  } catch {
    return 0;
  }
};
const keepSeen = (projectId: string, at: number) => {
  try {
    localStorage.setItem(SEEN(projectId), String(at));
  } catch {
    // Not kept: the same things count as new on the next visit.
  }
};

const THING: Record<string, string> = {
  docs: 'a document',
  highlights: 'a highlight',
  cards: 'a card',
  canvases: 'a canvas',
  comments: 'a comment',
  passageLinks: 'a link between passages',
  cardLinks: 'a link from a passage to a card',
  links: 'a line between cards',
};
const DONE: Record<Activity['op'], string> = { add: 'added', edit: 'changed', remove: 'removed' };

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function when(at: number) {
  const s = Math.round((at - Date.now()) / 1000);
  if (s > -60) return 'just now';
  if (s > -3600) return ago.format(Math.round(s / 60), 'minute');
  if (s > -86400) return ago.format(Math.round(s / 3600), 'hour');
  return ago.format(Math.round(s / 86400), 'day');
}

/**
 * The bell in a shared project: mentions of this person and replies to them, and what everyone else
 * did since this device last looked. Read and unread are kept on each device.
 */
export function Notifications() {
  const project = useStore((s) => s.project);
  const { people, activity } = useActivity();
  const name = useMe((s) => s.name);
  const [seen, setSeen] = useState(() => (project ? readSeen(project.id) : 0));
  const [open, setOpen] = useState<{ anchor: HTMLElement; since: number } | null>(null);
  if (!project) return null;
  const notices = noticesFor(project, activity, PERSON, name);
  const unread = notices.filter((n) => n.at > seen).length;
  const since = open?.since ?? seen;
  const news = activity.filter((a) => a.by !== PERSON && a.at > since);
  const who = (id: string) => people.find((p) => p.id === id);
  const toggle = (anchor: HTMLElement) => {
    if (open) return setOpen(null);
    // Looking marks everything read; what was new stays listed until the panel closes.
    setOpen({ anchor, since: seen });
    const now = Date.now();
    setSeen(now);
    keepSeen(project.id, now);
  };
  const item = (a: Activity | Notice, key: string) => {
    const person = who(a.by);
    const kind = KIND_OF[a.list];
    const what = 'why' in a ? (a.why === 'mention' ? `mentioned you in ${THING[a.list]}` : `replied in ${THING[a.list]}`) : `${DONE[a.op]} ${THING[a.list]}`;
    const body = (
      <>
        <span className="avatar" style={{ '--peer': person?.color ?? 'var(--muted)' } as React.CSSProperties} aria-hidden="true">
          {(person?.name ?? '?')[0]!.toUpperCase()}
        </span>
        <span className="what">
          <b>{person?.name ?? 'Someone'}</b> {what}
          {a.text && <q>{a.text}</q>}
          <time dateTime={new Date(a.at).toISOString()}>{when(a.at)}</time>
        </span>
      </>
    );
    return kind && a.op !== 'remove' ? (
      <a key={key} role="menuitem" href={`#/p/${project.id}/${kind}/${a.id}`} onClick={() => setOpen(null)} className={'why' in a && a.at > since ? 'unread' : undefined}>
        {body}
      </a>
    ) : (
      <div key={key} className="item">
        {body}
      </div>
    );
  };
  return (
    <>
      <button
        className="icon bell"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Mentions, replies and what the others did"
        aria-expanded={!!open}
        onClick={(e) => toggle(e.currentTarget)}
      >
        <Bell size={17} />
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <Menu anchor={open.anchor} label="Notifications" role="dialog" onClose={() => setOpen(null)}>
          <div className="notices">
            <h3>For you</h3>
            {notices.length ? (
              notices.slice(0, 20).map((n) => item(n, `n ${n.by} ${n.list} ${n.id}`))
            ) : (
              <p className="none">No mentions or replies yet. Type @ and a name to mention someone.</p>
            )}
            <h3>Since you last looked</h3>
            {news.length ? news.slice(0, 40).map((a) => item(a, `a ${a.by} ${a.list} ${a.id}`)) : <p className="none">Nothing new from the others.</p>}
          </div>
        </Menu>
      )}
    </>
  );
}
