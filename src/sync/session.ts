import { openDB } from 'idb';
import * as Y from 'yjs';
import { frame, MAX_FILE, MAX_FRAME, parse, PROTOCOL, T } from '../../worker/protocol';
import { addFiles, deleteFile, fileKey, getFile, getProject } from '../store/db';
import { useStore } from '../store/project';
import type { Card, DocMeta, Project } from '../types';
import { decrypt, deriveKeys, encrypt, newRoom, type Binding, type Keys } from './crypto';
import { asPresence, presence, useMe, useSync, type Presence, type Status } from './state';

// The project as a Yjs document: a map per list, keyed by id, holding each entity as plain JSON,
// so concurrent edits merge per entity and the last write to one entity wins.
const LISTS = ['docs', 'highlights', 'cards', 'links', 'inks', 'folds', 'canvases', 'comments', 'passageLinks', 'cardLinks', 'tags'] as const;
type List = (typeof LISTS)[number];
type Entity = { id: string };
type Shared = { name?: string } & Record<List, Entity[]>;
/** What only this device, or React Flow's view of a card, adds to an entity. */
const LOCAL: Partial<Record<List, string[]>> = { docs: ['lastPage'], cards: ['selected', 'measured', 'dragging', 'resizing'], links: ['selected'] };

const sortKeys = (_: string, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);
// Entities are never changed in place, so each one's JSON is worked out once.
const canonical = new WeakMap<Entity, string>();
/** The shared part of an entity as JSON with its keys in order, so equal entities compare equal. */
function canon(list: List, e: Entity) {
  let json = canonical.get(e);
  if (json === undefined) {
    const local = LOCAL[list] ?? [];
    json = JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !local.includes(k))), sortKeys);
    canonical.set(e, json);
  }
  return json;
}
const withLocal = (list: List, shared: Entity, mine: Entity) => {
  const kept = (LOCAL[list] ?? []).filter((k) => k in mine);
  return kept.length ? { ...shared, ...Object.fromEntries(kept.map((k) => [k, (mine as Record<string, unknown>)[k]])) } : shared;
};
/** A document's file in the room: each version under its own name, so a page edit reaches the others as a new file. */
const remote = (d: Entity) => (d as DocMeta).file ?? d.id;
// React Flow needs a group listed before the cards inside it, and groups do not nest.
const parentsFirst = (cards: Card[]) => [...cards.filter((c) => !c.parentId), ...cards.filter((c) => c.parentId)];

/**
 * Each shared project's Yjs state, kept beside the project so edits made offline survive a reload,
 * with the `updatedAt` of the project it matched: the two are saved apart, and the later wins.
 */
type Saved = { state: Uint8Array; at: number };
const states = openDB('gloss-sync', 1, { upgrade: (d) => void d.createObjectStore('states') });

const REMOTE = Symbol('remote');
/** Once the room's log is this long, a device replaces it with a snapshot. */
const COMPACT_AT = 64;
const text = new TextEncoder();

class Session {
  private doc = new Y.Doc();
  private meta = this.doc.getMap<string>('meta');
  /** Files in the room, by their name there (see `remote`), so others can fetch them. */
  private files = this.doc.getMap<true>('files');
  private keys!: Keys;
  /** The project's `updatedAt` the shared state matches; null until the saved state is loaded. */
  private at: number | null = null;
  /** Whether the shared state is known, from this device's saved copy or from the room. */
  private known = false;
  private stopped = false;
  private applying = false;
  private ws: WebSocket | null = null;
  /** What the room holds, while its log is being received. */
  private server: Y.Doc | null = null;
  private ready = false;
  private lastSeq = 0;
  private logSize = 0;
  private unacked = 0;
  private outbox: Uint8Array[] = [];
  private sending = Promise.resolve();
  private receiving = Promise.resolve();
  private transfers = new Set<string>();
  private downloaded = new Set<string>();
  private me: Presence = { ...useMe.getState() };
  private retries = 0;
  private timers: Partial<Record<'flush' | 'save' | 'presence' | 'retry', ReturnType<typeof setTimeout>>> = {};
  private cleanup: (() => void)[] = [];

  constructor(
    private projectId: string,
    private binding: Binding,
  ) {}

  async start() {
    this.keys = await deriveKeys(this.binding.key);
    const [saved, record]: [Saved | undefined, Project | undefined] = await Promise.all([(await states).get('states', this.projectId), getProject(this.projectId)]);
    const project = useStore.getState().project;
    if (this.stopped || project?.id !== this.projectId) return;
    this.at = saved?.at ?? 0;
    if (saved) {
      Y.applyUpdate(this.doc, saved.state);
      this.known = true;
      // A project saved after this state has edits it lacks: all of them, for a project just shared.
      // Otherwise this state is the newer, and the project catches up from it below. The saved
      // record is compared, as the open project moves on as soon as React Flow measures its cards.
      if ((record?.updatedAt ?? 0) > saved.at) this.push(this.shared(project), project);
      this.save();
    }
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      this.save();
      // Remote changes reach the project at once, so it and the shared state never disagree.
      if (origin !== REMOTE) return this.queue(update);
      this.pull();
      this.syncFiles();
    });
    this.cleanup.push(
      useStore.subscribe((s, prev) => {
        if (s.project?.id !== this.projectId) return;
        if (prev.project?.id === this.projectId && s.project !== prev.project && !this.applying) this.push(prev.project, s.project);
        if (s.activeDocId !== prev.activeDocId || s.project.docs !== prev.project?.docs) this.where();
      }),
      useMe.subscribe(({ name, color }) => this.present({ name, color })),
    );
    const online = () => ((this.retries = 0), this.connect());
    // A socket can linger while the network is gone, and its close waits on a handshake that cannot happen.
    const offline = () => {
      const ws = this.ws;
      if (!ws) return;
      this.drop(ws);
      ws.close();
    };
    const leave = () => void this.persist();
    const hidden = () => document.visibilityState === 'hidden' && leave();
    addEventListener('online', online);
    addEventListener('offline', offline);
    addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hidden);
    this.cleanup.push(() => {
      removeEventListener('online', online);
      removeEventListener('offline', offline);
      removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hidden);
    });
    this.pull();
    this.where();
    this.connect();
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    Object.values(this.timers).forEach(clearTimeout);
    this.cleanup.forEach((f) => f());
    this.ws?.close(1000);
    this.ws = null;
    useSync.setState({ status: 'offline', peers: {}, problem: null });
    await this.persist();
  }

  present(p: Partial<Presence>) {
    this.me = { ...this.me, ...p };
    this.later('presence', 50, () => this.ready && this.send(T.presence, 0, text.encode(JSON.stringify(this.me)), 'presence'));
  }

  private later(timer: keyof Session['timers'], ms: number, run: () => void) {
    this.timers[timer] ??= setTimeout(() => {
      this.timers[timer] = undefined;
      if (!this.stopped) run();
    }, ms);
  }

  private save() {
    this.later('save', 300, () => void this.persist());
  }

  private async persist() {
    clearTimeout(this.timers.save);
    this.timers.save = undefined;
    if (this.at === null) return;
    const db = await states;
    // Read together, with no wait between: the shared state follows every change to the project
    // at once, so it matches the project as it is at this moment.
    const { project } = useStore.getState();
    if (project?.id === this.projectId) this.at = project.updatedAt;
    await db.put('states', { state: Y.encodeStateAsUpdate(this.doc), at: this.at } satisfies Saved, this.projectId);
  }

  /** The project as the shared document has it, with only the PDFs this device holds. */
  private shared(project: Project): Shared {
    const view = { name: this.meta.get('name') } as Shared;
    for (const list of LISTS) view[list] = [...this.doc.getMap<Entity>(list).values()].filter((e) => list !== 'docs' || project.docs.some((d) => d.id === e.id));
    return view;
  }

  /** Writes what changed between two versions of the project into the shared document. */
  private push(prev: Shared, next: Project) {
    let docs = false;
    this.doc.transact(() => {
      if (prev.name !== next.name) this.meta.set('name', next.name);
      for (const list of LISTS) {
        if (prev[list] === next[list]) continue;
        docs ||= list === 'docs';
        const map = this.doc.getMap<Entity>(list);
        const gone = new Map(prev[list].map((e) => [e.id, e]));
        for (const e of next[list]) {
          const old = gone.get(e.id);
          gone.delete(e.id);
          if (old === e || (old && canon(list, old) === canon(list, e))) continue;
          if (list === 'docs' && old) {
            const shared = map.get(e.id);
            // A document still waiting for another device's new version must not send its old one back.
            if (remote(old) === remote(e) && shared && remote(shared) !== remote(e)) continue;
            if (remote(old) !== remote(e)) this.unshareFile(remote(old));
          }
          map.set(e.id, JSON.parse(canon(list, e)));
        }
        for (const [id, e] of gone) {
          map.delete(id);
          if (list === 'docs') this.unshareFile(remote(e));
        }
      }
    });
    if (docs) this.syncFiles();
  }

  /** Brings the shared document's changes into the project, keeping what is only this device's. */
  private pull() {
    const state = useStore.getState();
    const { project } = state;
    if (!this.known || project?.id !== this.projectId) return;
    const next: Partial<Record<List, Entity[]>> & { name?: string } = {};
    const name = this.meta.get('name');
    if (name !== undefined && name !== project.name) next.name = name;
    let docGone = false;
    let versionChanged = false;
    for (const list of LISTS) {
      const map = this.doc.getMap<Entity>(list);
      const out: Entity[] = [];
      let changed = false;
      // This device's order is kept, as it is the order of the tabs and of cards on the canvas.
      for (const e of project[list]) {
        const shared = map.get(e.id);
        if (shared && canon(list, shared) === canon(list, e)) out.push(e);
        // A new version of a document's file is shown once it is here; until then the old one stays.
        else if (shared && list === 'docs' && remote(shared) !== remote(e) && !this.downloaded.has(remote(shared))) out.push(e);
        else if (shared) {
          if (list === 'docs' && remote(shared) !== remote(e)) {
            versionChanged = true;
            // Its old file is let go here, so if it comes back, by an undo elsewhere, it is fetched again.
            this.downloaded.delete(remote(e));
          }
          out.push(withLocal(list, shared, e));
          changed = true;
        } else {
          changed = true;
          if (list === 'docs') {
            docGone = true;
            void deleteFile(e.id);
            // Should the device that removed it undo that, the file is fetched again.
            this.downloaded.delete(remote(e));
          }
        }
      }
      const have = new Set(project[list].map((e) => e.id));
      // A new PDF appears once its file is here, so it never opens empty.
      for (const [id, shared] of map) {
        if (have.has(id) || (list === 'docs' && !this.downloaded.has(remote(shared)))) continue;
        out.push(shared);
        changed = true;
      }
      if (!changed) continue;
      // Tabs follow the shared order, so every device lists the PDFs alike.
      const order = list === 'docs' ? [...map.keys()] : [];
      next[list] = list === 'cards' ? parentsFirst(out as Card[]) : list === 'docs' ? out.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)) : out;
    }
    if (!Object.keys(next).length) return;
    const merged = { ...project, ...next, updatedAt: Date.now() } as Project;
    const shown = (id: string | null) => id !== null && merged.docs.some((d) => d.id === id);
    this.applying = true;
    try {
      useStore.setState({
        project: merged,
        activeDocId: shown(state.activeDocId) ? state.activeDocId : (merged.docs[0]?.id ?? null),
        sideDocId: shown(state.sideDocId) ? state.sideDocId : null,
        canvasId: merged.canvases.some((c) => c.id === state.canvasId) ? state.canvasId : (merged.canvases[0]?.id ?? state.canvasId),
        // As when removing a PDF here: the history refers to its highlights, and its file is gone or replaced.
        ...(docGone || versionChanged ? { past: [], future: [] } : {}),
      });
    } finally {
      this.applying = false;
    }
  }

  /** Uploads this device's PDFs the room lacks, and fetches the ones it has that this device lacks. */
  private syncFiles() {
    const project = useStore.getState().project;
    if (!this.ready || project?.id !== this.projectId) return;
    const docs = this.doc.getMap<DocMeta>('docs');
    const here = new Set(project.docs.map(remote));
    // Only the version the room's document names, so a device that has not caught up does not upload its old one.
    for (const d of project.docs) {
      const name = remote(d);
      if (remote(docs.get(d.id) ?? d) === name && !this.files.has(name)) void this.transfer(name, `upload “${d.name}”`, () => this.upload(fileKey(d), name, d.name));
    }
    for (const d of docs.values()) {
      const name = remote(d);
      if (this.files.has(name) && !here.has(name) && !this.downloaded.has(name)) void this.transfer(name, `download “${d.name}”`, () => this.download(name, fileKey(d)));
    }
  }

  private async transfer(id: string, what: string, run: () => Promise<void>) {
    if (this.transfers.has(id)) return;
    this.transfers.add(id);
    this.status();
    try {
      await run();
    } catch {
      if (!this.stopped) useSync.setState({ problem: `Could not ${what}. It is tried again when the connection comes back.` });
    } finally {
      this.transfers.delete(id);
      this.status();
      // PDFs that arrive together appear together, so the first one opens rather than the quickest.
      if (!this.transfers.size) this.pull();
    }
  }

  private fileUrl = (id: string) => `/api/sync/${this.binding.room}/files/${id}`;
  private auth = () => ({ Authorization: `Bearer ${this.keys.auth}` });

  private async upload(key: string, id: string, name: string) {
    const blob = await getFile(key);
    if (!blob) return;
    if (blob.size + 28 > MAX_FILE) return void useSync.setState({ problem: `“${name}” is larger than ${MAX_FILE >> 20} MB, so it stays on this device.` });
    const body = await encrypt(this.keys.key, new Uint8Array(await blob.arrayBuffer()), `file:${id}`);
    const res = await fetch(this.fileUrl(id), { method: 'PUT', headers: this.auth(), body });
    if (!res.ok) throw new Error(res.statusText);
    if (!this.stopped) this.files.set(id, true);
  }

  private async download(id: string, key: string) {
    const res = await fetch(this.fileUrl(id), { headers: this.auth() });
    if (!res.ok) throw new Error(res.statusText);
    const data = await decrypt(this.keys.key, new Uint8Array(await res.arrayBuffer()), `file:${id}`);
    await addFiles([[key, new Blob([data], { type: 'application/pdf' })]]);
    this.downloaded.add(id);
  }

  private unshareFile(id: string) {
    this.files.delete(id);
    void fetch(this.fileUrl(id), { method: 'DELETE', headers: this.auth() }).catch(() => {});
  }

  private connect = () => {
    clearTimeout(this.timers.retry);
    this.timers.retry = undefined;
    // Offline, the browser's online event brings the next attempt instead.
    if (this.stopped || this.ws || !navigator.onLine) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/sync/${this.binding.room}`, [PROTOCOL, this.keys.auth]);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.server = new Y.Doc();
    ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      this.receiving = this.receiving
        .then(() => this.receive(ws, e.data))
        .catch(() => useSync.setState({ problem: 'Some changes could not be decrypted, so they were left out.' }));
    };
    ws.onclose = () => this.drop(ws);
    this.status();
  };

  private drop(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.server = null;
    this.ready = false;
    this.unacked = 0;
    useSync.setState({ peers: {} });
    this.status();
    if (!this.stopped) this.timers.retry = setTimeout(this.connect, Math.min(30_000, 1000 * 2 ** this.retries++));
  }

  private async receive(ws: WebSocket, data: ArrayBuffer) {
    const f = parse(data);
    if (!f || this.ws !== ws) return;
    if (f.type === T.update || f.type === T.snapshot) {
      const update = await decrypt(this.keys.key, f.body, f.type === T.snapshot ? 'snapshot' : 'update');
      if (this.ws !== ws) return;
      this.lastSeq = f.n;
      if (this.server) Y.applyUpdate(this.server, update);
      Y.applyUpdate(this.doc, update, REMOTE);
      if (this.ready) this.logged();
    } else if (f.type === T.ready) {
      const server = this.server!;
      this.server = null;
      this.ready = this.known = true;
      this.retries = 0;
      this.logSize = f.n;
      // Instead of whatever was queued, send all the room lacks: edits made offline, or before the project was shared.
      this.outbox = Y.equalSnapshots(Y.snapshot(this.doc), Y.snapshot(server)) ? [] : [Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(server))];
      this.flush();
      useSync.setState({ problem: null });
      this.pull();
      this.syncFiles();
      this.present({});
      this.logged(0);
    } else if (f.type === T.ack) {
      this.lastSeq = f.n;
      this.unacked--;
      this.logged();
    } else if (f.type === T.presence) {
      const p = asPresence(JSON.parse(new TextDecoder().decode(await decrypt(this.keys.key, f.body, 'presence'))));
      if (p && this.ws === ws) useSync.setState((s) => ({ peers: { ...s.peers, [f.n]: p } }));
    } else if (f.type === T.leave) {
      useSync.setState((s) => ({ peers: Object.fromEntries(Object.entries(s.peers).filter(([peer]) => Number(peer) !== f.n)) }));
    } else if (f.type === T.compacted) {
      this.logSize = Math.max(0, this.lastSeq - f.n);
    }
  }

  /** Counts updates added to the room's log, and replaces the log with a snapshot once it is long. */
  private logged(added = 1) {
    this.logSize += added;
    this.status();
    if (this.logSize < COMPACT_AT) return;
    this.logSize = 0;
    // Taken together with the sequence: every update up to it has been applied here.
    this.send(T.compact, this.lastSeq, Y.encodeStateAsUpdate(this.doc), 'snapshot');
  }

  private queue(update: Uint8Array) {
    if (!this.ready) return;
    this.outbox.push(update);
    this.status();
    // Gathered briefly, so a drag or a burst of typing is a few messages rather than one per frame.
    this.later('flush', 50, this.flush);
  }

  private flush = () => {
    if (!this.ready || !this.outbox.length) return;
    const update = Y.mergeUpdates(this.outbox);
    this.outbox = [];
    this.unacked++;
    this.send(T.update, 0, update, 'update');
  };

  /** Encrypts and sends in order, as encryption finishes at its own pace. */
  private send(type: number, n: number, data: Uint8Array, context: string) {
    const ws = this.ws;
    this.sending = this.sending.then(async () => {
      const body = await encrypt(this.keys.key, data as Uint8Array<ArrayBuffer>, context);
      if (ws !== this.ws || ws?.readyState !== WebSocket.OPEN) return;
      if (body.byteLength + 9 > MAX_FRAME) {
        if (type === T.update) this.unacked--;
        return useSync.setState({ problem: 'A change is too large to sync.' });
      }
      ws.send(frame(type, n, body));
    });
  }

  private where() {
    const { project, activeDocId } = useStore.getState();
    this.present({ docId: activeDocId ?? undefined, page: project?.docs.find((d) => d.id === activeDocId)?.lastPage ?? 1 });
  }

  private status() {
    const status: Status = !this.ready ? (this.ws ? 'syncing' : 'offline') : this.unacked > 0 || this.outbox.length || this.transfers.size ? 'syncing' : 'synced';
    if (useSync.getState().status !== status) useSync.setState({ status });
  }
}

let current: Session | null = null;

/** Keeps the open project in sync with its room; returns the function that stops it. */
export function startSync(projectId: string, binding: Binding) {
  const session = new Session(projectId, binding);
  current = session;
  presence.update = (p) => session.present(p);
  void session.start();
  return () => {
    void session.stop();
    if (current !== session) return;
    current = null;
    presence.update = () => {};
  };
}

const bind = (sync?: Binding) => {
  const { project } = useStore.getState();
  if (!project) return;
  const { sync: _, ...rest } = project;
  useStore.setState({ project: sync ? { ...rest, sync } : rest });
};

/** Starts sharing the open project through a new room. */
export async function share() {
  const id = useStore.getState().project?.id;
  if (!id) return;
  // An empty state older than the project makes the session send the whole project as edits the room lacks.
  await (await states).put('states', { state: Y.encodeStateAsUpdate(new Y.Doc()), at: 0 } satisfies Saved, id);
  bind(newRoom());
}

/** Stops syncing on this device. The room and the other devices are left as they are. */
export async function stopSharing() {
  const id = useStore.getState().project?.id;
  if (!id) return;
  await current?.stop();
  await (await states).delete('states', id);
  bind();
}
