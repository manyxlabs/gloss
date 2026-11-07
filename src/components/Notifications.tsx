import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/project';
import { KIND_OF, noticesFor, type Notice } from '../sync/notify';
import { PERSON, useActivity, useMe, type Activity } from '../sync/state';
import { Menu } from './Menu';
import { ago } from './Projects';
import { m } from '../i18n';

const SEEN = (projectId: string) => `gloss:seen:${projectId}`;
const keepSeen = (projectId: string, at: number) => {
  try {
    localStorage.setItem(SEEN(projectId), String(at));
  } catch {
    // Not kept: the same things count as new on the next visit.
  }
};
/** When this device last looked; on its first visit, now, as what was done before it came is not news. */
const readSeen = (projectId: string) => {
  try {
    const seen = Number(localStorage.getItem(SEEN(projectId)));
    if (seen) return seen;
  } catch {
    return Date.now();
  }
  keepSeen(projectId, Date.now());
  return Date.now();
};

const THING: Record<string, string> = m.homeNotices.things;

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
    const thing = THING[a.list]!;
    const what = 'why' in a ? (a.why === 'mention' ? m.homeNotices.mentioned(thing) : m.homeNotices.replied(thing)) : m.homeNotices.did[a.op](thing);
    const body = (
      <>
        <span className="avatar" style={{ '--peer': person?.color ?? 'rgb(var(--muted))' } as React.CSSProperties} aria-hidden="true">
          {(person?.name ?? '?')[0]!.toUpperCase()}
        </span>
        <span className="what">
          <b>{person?.name ?? m.homePeople.someone}</b> {what}
          {a.text && <q>{a.text}</q>}
          <time dateTime={new Date(a.at).toISOString()}>{ago(a.at)}</time>
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
        aria-label={unread ? m.homeNotices.unread(unread) : m.homeNotices.label}
        title={m.homeNotices.title}
        aria-expanded={!!open}
        onClick={(e) => toggle(e.currentTarget)}
      >
        <Bell size={17} />
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <Menu anchor={open.anchor} label={m.homeNotices.label} role="dialog" onClose={() => setOpen(null)}>
          <div className="notices">
            <h3>{m.homeNotices.forYou}</h3>
            {notices.length ? notices.slice(0, 20).map((n) => item(n, `n ${n.by} ${n.list} ${n.id}`)) : <p className="none">{m.homeNotices.noMentions}</p>}
            <h3>{m.homeNotices.since}</h3>
            {news.length ? news.slice(0, 40).map((a) => item(a, `a ${a.by} ${a.list} ${a.id}`)) : <p className="none">{m.homeNotices.nothingNew}</p>}
          </div>
        </Menu>
      )}
    </>
  );
}
