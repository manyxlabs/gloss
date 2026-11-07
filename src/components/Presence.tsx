import { useReactFlow, useStore as useFlow, useViewport, ViewportPortal } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { isLocalCanvas } from '../canvases';
import { useStore } from '../store/project';
import { GUEST, presence, setName, useMe, useScreen, useSync, type Presence } from '../sync/state';
import { m } from '../i18n';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const peerStyle = (color: string) => ({ '--peer': color }) as React.CSSProperties;

/** The field for how this person appears to the others, kept on this device for every shared project; left empty, they are a guest. */
export const NameField = () => <input name="name" aria-label={m.homePeople.yourName} defaultValue={useMe.getState().name} maxLength={40} autoFocus placeholder={GUEST} />;
export const keepName = (form: HTMLFormElement) => setName(new FormData(form).get('name')?.toString().trim().slice(0, 40) || GUEST);

/** Asks someone who joined a shared project how they should appear; skipping makes them a guest. */
function NameDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [named] = useState(() => !!useMe.getState().name);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} className="sheet glass" aria-labelledby="name-h" onClose={() => (keepName(form.current!), onClose())}>
      <form method="dialog" ref={form}>
        <h2 id="name-h">{m.homePeople.nameHeading}</h2>
        <p>{m.homePeople.nameIntro}</p>
        <NameField />
        <footer>
          {!named && (
            <button
              type="submit"
              onClick={() => {
                (form.current!.elements.namedItem('name') as HTMLInputElement).value = '';
              }}
            >
              {m.homePeople.skip}
            </button>
          )}
          <button type="submit" className="primary">
            {m.homePeople.save}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** Everyone in a shared project, with where they are reading; this person's own avatar changes their name. */
export function Peers() {
  const peers = useSync((s) => s.peers);
  const group = useScreen((s) => s.group);
  const me = useMe();
  const docs = useStore((s) => s.project?.docs);
  // Someone who shared the project gave their name as they did; someone who joined is asked here. A linked screen takes the name its other screens have.
  const [naming, setNaming] = useState(!me.name && !group);
  const where = (p: Presence) => {
    const doc = docs?.find((d) => d.id === p.docId);
    return doc ? m.homePeople.reading(doc.name, p.page ?? 1) : m.homePeople.looking;
  };
  return (
    <div className="peers" aria-label={m.homePeople.inProject}>
      {/* This person's other screens are not someone else. */}
      {Object.entries(peers)
        .filter(([, p]) => !group || p.screen !== group)
        .map(([id, p]) => (
          <span key={id} className="avatar" style={peerStyle(p.color)} tabIndex={0} aria-label={m.homePeople.peer(p.name || m.homePeople.someone, where(p))}>
            {initials(p.name)}
            <span className="tip" role="tooltip">
              <b>{p.name || m.homePeople.someone}</b>
              {where(p)}
            </span>
          </span>
        ))}
      <button className="avatar" style={peerStyle(me.color)} onClick={() => setNaming(true)} aria-label={m.homePeople.youChange(me.name)}>
        {initials(me.name)}
        <span className="tip" role="tooltip">
          <b>{m.homePeople.you(me.name)}</b>
          {m.homePeople.clickToChange}
        </span>
      </button>
      {naming && <NameDialog onClose={() => setNaming(false)} />}
    </div>
  );
}

/**
 * Who is here, and changing this person's name, as items in the header's More on a phone, where the
 * avatars have no room.
 */
export function PeopleItems() {
  const peers = useSync((s) => s.peers);
  const group = useScreen((s) => s.group);
  const me = useMe();
  const [naming, setNaming] = useState(false);
  return (
    <>
      <div className="menu-group" role="group" aria-label={m.homePeople.inProject}>
        <h4>{m.homePeople.here}</h4>
        {Object.entries(peers)
          .filter(([, p]) => !group || p.screen !== group)
          .map(([id, p]) => (
            <button key={id} role="menuitem" disabled>
              <span className="avatar" style={peerStyle(p.color)} aria-hidden="true">
                {initials(p.name)}
              </span>
              {p.name || m.homePeople.someone}
            </button>
          ))}
        <button role="menuitem" onClick={() => setNaming(true)}>
          <span className="avatar" style={peerStyle(me.color)} aria-hidden="true">
            {initials(me.name)}
          </span>
          {m.homePeople.youRename(me.name)}
        </button>
      </div>
      {naming && <NameDialog onClose={() => setNaming(false)} />}
    </>
  );
}

/** The others' pointers on the canvas, in canvas coordinates; this person's is shared while over it. */
export function Cursors() {
  const peers = useSync((s) => s.peers);
  const group = useScreen((s) => s.group);
  const canvasId = useStore((s) => s.canvasId);
  const shared = useStore((s) => !!s.project?.sync);
  const dom = useFlow((s) => s.domNode);
  const { zoom } = useViewport();
  const rf = useReactFlow();

  useEffect(() => {
    if (!dom || !shared) return;
    const move = (e: PointerEvent) => {
      const project = useStore.getState().project;
      // A canvas kept on this device is not named to the others, even by its id.
      if (project && isLocalCanvas(project, canvasId)) return presence.update({ cursor: undefined });
      presence.update({ cursor: { canvasId, ...rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) } });
    };
    const leave = () => presence.update({ cursor: undefined });
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerleave', leave);
    return () => {
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerleave', leave);
      leave();
    };
  }, [dom, canvasId, rf, shared]);

  return (
    <ViewportPortal>
      {Object.entries(peers).map(
        ([id, { cursor, color, name, screen }]) =>
          cursor?.canvasId === canvasId &&
          (!group || screen !== group) && (
            // Scaled back against the zoom, so a pointer stays the same size on screen.
            <div key={id} className="cursor" style={{ ...peerStyle(color), transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${1 / zoom})` }}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 1.5v12l3.4-3.1 2.3 5 2.2-1-2.3-4.9h4.7z" />
              </svg>
              <span>{name || m.homePeople.someone}</span>
            </div>
          ),
      )}
    </ViewportPortal>
  );
}
