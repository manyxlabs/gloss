import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react';
import { create } from 'zustand';
import { before } from '../pdf/folds';
import type { Input } from '../convert';
import { migrate, prune } from '../links';
import { closeDocs, files, forgetFile, openPdf, PdfPasswordError } from '../pdf/pdfjs';
import type { Card, CardData, Color, DocMeta, Fold, Highlight, Ink, InkColor, Link, Part, Point, Project, Spot } from '../types';
import { passwordAsker } from '../password';
import { askAbout } from '../annots/ask';
import { addFiles, deleteFile, deleteVersion, dropOldVersions, fileKey, getProject, putProject } from './db';

/** Which version of each document's file a step of history had, as page edits are undone with the rest. */
export type Version = Pick<DocMeta, 'file' | 'pages' | 'size'>;
type Snapshot = Pick<Project, 'highlights' | 'cards' | 'links' | 'inks' | 'folds' | 'canvases' | 'comments' | 'passageLinks' | 'cardLinks'> & {
  versions: Record<string, Version>;
};
const snapshot = ({ highlights, cards, links, inks, folds, canvases, comments, passageLinks, cardLinks, docs }: Project): Snapshot => ({
  highlights,
  cards,
  links,
  inks,
  folds,
  canvases,
  comments,
  passageLinks,
  cardLinks,
  versions: Object.fromEntries(docs.map((d) => [d.id, { file: d.file, pages: d.pages, size: d.size }])),
});
/** A document at a version; documents added or removed since are left as they are. */
const atVersion = (d: DocMeta, v: Version | undefined): DocMeta => {
  if (!v || (v.file === d.file && v.pages === d.pages)) return d;
  const { file: _, ...rest } = d;
  return { ...rest, ...(v.file ? { file: v.file } : {}), pages: v.pages, size: v.size, ...(d.lastPage ? { lastPage: Math.min(d.lastPage, v.pages) } : {}) };
};

export type Tool = 'select' | 'pen' | 'eraser';
/** Documents also take a box drawn around a figure. */
export type DocTool = Tool | 'snip';
export type Pane = 0 | 1;
export const MAIN_CANVAS = 'main';

type State = {
  project: Project | null;
  /** The document in the main pane, and in the second pane while two are open side by side. */
  activeDocId: string | null;
  sideDocId: string | null;
  /** The canvas on show, of the project's canvases. */
  canvasId: string;
  /** A request for a document pane to scroll to a highlight, or to a page with a place on it or a search match; `at` makes a repeat request distinct. */
  jump:
    | (({ highlightId: string } | { page: number; query?: string; dest?: unknown[] }) & {
        pane: Pane;
        at: number;
      })
    | null;
  /** A request for the canvas to bring a card into view. */
  focus: { cardId: string; at: number } | null;
  /** Which side a phone shows; a request to show a card or a source switches it. */
  view: 'doc' | 'canvas';
  past: Snapshot[];
  future: Snapshot[];
  /** What a pointer does on the documents and on the canvas. A stylus always writes, whatever is chosen. */
  docTool: DocTool;
  canvasTool: Tool;
  inkColor: InkColor;
  /** A stylus has been used on this device: from then on a finger or palm scrolls rather than writes. */
  penSeen: boolean;
};

const MAX_UNDO = 200;
/** Earlier versions of a document's file kept for undo; older page edits drop out of the history. */
const MAX_VERSIONS = 10;
export const uid = () => crypto.randomUUID();

const PEN_KEY = 'gloss:pen';
function remembered(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be blocked; the device is then treated as new.
    return null;
  }
}

export const useStore = create<State>(() => ({
  project: null,
  activeDocId: null,
  sideDocId: null,
  canvasId: MAIN_CANVAS,
  jump: null,
  focus: null,
  view: 'doc',
  past: [],
  future: [],
  docTool: 'select',
  canvasTool: 'select',
  inkColor: 'ink',
  penSeen: remembered(PEN_KEY) === '1',
}));
const { getState: get, setState: set } = useStore;

files.key = (docId) => {
  const doc = get().project?.docs.find((d) => d.id === docId);
  return doc ? fileKey(doc) : docId;
};

/** Where the canvas puts a new card when it was not dropped at a spot: set by the canvas while it is mounted. */
export const canvasSpot: { next: () => XYPosition } = {
  next: () => ({ x: 0, y: 0 }),
};

export function edit(change: (p: Project) => Partial<Project>, undoable = true) {
  const { project } = get();
  if (!project) return;
  if (undoable) checkpoint();
  set({ project: { ...project, ...change(project), updatedAt: Date.now() } });
}

let checkpointed = false;
/** Records the current state for undo. Calls in the same tick count once, as React Flow reports one delete in several callbacks. */
export function checkpoint() {
  const { project, past } = get();
  if (!project || checkpointed) return;
  checkpointed = true;
  queueMicrotask(() => (checkpointed = false));
  set({ past: [...past.slice(-MAX_UNDO + 1), snapshot(project)], future: [] });
}

function travel(from: 'past' | 'future') {
  const state = get();
  const stack = state[from];
  const target = stack.at(-1);
  if (!state.project || !target) return;
  const to = from === 'past' ? 'future' : 'past';
  const { versions, ...lists } = target;
  set({
    [from]: stack.slice(0, -1),
    [to]: [...state[to], snapshot(state.project)],
    project: { ...state.project, ...lists, docs: state.project.docs.map((d) => atVersion(d, versions[d.id])), updatedAt: Date.now() },
  });
}
export const undo = () => travel('past');
export const redo = () => travel('future');

// Saving: the record is rewritten shortly after each change, and at once when the page is hidden.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const save = () => {
  clearTimeout(saveTimer);
  const { project } = get();
  if (project) void putProject({ ...project, cards: project.cards.map(storedCard) });
};
useStore.subscribe((s, prev) => {
  if (s.project && s.project !== prev.project && s.project.id === prev.project?.id) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }
});
addEventListener('pagehide', save);

/**
 * Versions of files that a page edit, an undo or another device replaced. Each is deleted once
 * neither the project nor its history uses it, and the history keeps only the last few, as each
 * version is a whole PDF.
 */
const retired = new Set<string>();
function release(project: Project, past: Snapshot[], future: Snapshot[]) {
  const used = (s: Snapshot) => new Set(Object.entries(s.versions).map(([id, v]) => fileKey({ id, file: v.file })));
  const current = new Set(project.docs.map(fileKey));
  let kept = past;
  while (kept.length && new Set([...kept, ...future].flatMap((s) => [...used(s)]).filter((k) => !current.has(k))).size > MAX_VERSIONS) kept = kept.slice(1);
  if (kept !== past) set({ past: kept });
  const inUse = new Set([...current, ...[...kept, ...future].flatMap((s) => [...used(s)])]);
  for (const key of retired)
    if (!inUse.has(key)) {
      retired.delete(key);
      forgetFile(key);
      void deleteVersion(key);
    }
}
useStore.subscribe((s, prev) => {
  if (!s.project || s.project.id !== prev.project?.id) return;
  if (s.project.docs !== prev.project.docs)
    for (const d of prev.project.docs) {
      const now = s.project.docs.find((x) => x.id === d.id);
      if (now && fileKey(now) !== fileKey(d)) retired.add(fileKey(d));
    }
  if (retired.size && (s.project.docs !== prev.project.docs || s.past !== prev.past || s.future !== prev.future)) release(s.project, s.past, s.future);
});
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());

/** What React Flow adds to a card while it is on screen is not worth keeping. */
const storedCard = ({ id, type, position, data, width, height, parentId }: Card): Card => ({
  id,
  type,
  position,
  data,
  ...(width ? { width } : {}),
  ...(height ? { height } : {}),
  ...(parentId ? { parentId, expandParent: true } : {}),
});

export async function openProject(id: string) {
  const found = await getProject(id);
  const stored = found && { ...found, openedAt: Date.now() };
  if (stored) {
    void putProject(stored);
    for (const d of stored.docs) void dropOldVersions(d);
  }
  // Projects saved before handwriting, squeezing and several canvases existed lack those lists.
  const old = stored ? { ...stored, inks: stored.inks ?? [], folds: stored.folds ?? [], canvases: stored.canvases ?? [{ id: MAIN_CANVAS, name: 'Canvas' }] } : null;
  const project = old && migrate(old);
  // Saved before sync starts, which then shares the change as newer than its own state rather than undoing it.
  if (project && project !== old) await putProject(project);
  set({
    project,
    activeDocId: project?.docs[0]?.id ?? null,
    sideDocId: null,
    canvasId: project?.canvases[0]?.id ?? MAIN_CANVAS,
    past: [],
    future: [],
    jump: null,
    focus: null,
    view: 'doc',
  });
  return project;
}

export function closeProject() {
  save();
  const { project } = get();
  if (project) release(project, [], []);
  retired.clear();
  closeDocs();
  set({ project: null, activeDocId: null, sideDocId: null, past: [], future: [] });
}

export const newProject = (name: string): Project => ({
  id: uid(),
  name,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  docs: [],
  highlights: [],
  cards: [],
  links: [],
  inks: [],
  folds: [],
  canvases: [{ id: MAIN_CANVAS, name: 'Canvas' }],
  comments: [],
  passageLinks: [],
  cardLinks: [],
});

export const rename = (name: string) => edit(() => ({ name }), false);
export const setActiveDoc = (docId: string, pane: Pane = 0) => set(pane ? { sideDocId: docId } : { activeDocId: docId });
/** Opens a second document pane beside the first, or closes it. */
export const setSideBySide = (on: boolean) => set((s) => ({ sideDocId: on ? (s.project?.docs.find((d) => d.id !== s.activeDocId)?.id ?? s.activeDocId) : null }));
/** The pane showing a document, preferring the main one. */
const paneOf = (docId: string): Pane => (get().activeDocId !== docId && get().sideDocId === docId ? 1 : 0);
export const rememberPage = (docId: string, lastPage: number) =>
  edit(
    (p) => ({
      docs: p.docs.map((d) => (d.id === docId ? { ...d, lastPage } : d)),
    }),
    false,
  );

/** Opens a PDF, asking for its password until it opens; null when the reader gives up. */
async function openProtected(data: Blob, name: string) {
  let password: string | undefined;
  for (;;) {
    try {
      return { ...(await openPdf(data, password)), password };
    } catch (err) {
      if (!(err instanceof PdfPasswordError)) throw err;
      const answer = await passwordAsker.ask(name, err.wrong);
      if (answer === null) return null;
      password = answer;
    }
  }
}

/** Converts what was added to PDFs and stores them. Returns a message for each file that could not be added, or added only in part. */
export async function importFiles(project: Project, inputs: Input[]): Promise<{ project: Project; problems: string[] }> {
  const { convert } = await import('../convert');
  const { converted, problems } = await convert(inputs);
  const added: [DocMeta, Blob][] = [];
  for (const { name, data, source } of converted) {
    try {
      // A PDF added as it is keeps its file name in the password prompt.
      const opened = await openProtected(data, data instanceof File ? data.name : name);
      if (!opened) continue;
      const { doc, close, password } = opened;
      added.push([{ id: uid(), name, pages: doc.numPages, size: data.size, ...(source ? { source } : {}), ...(password === undefined ? {} : { password }) }, data]);
      await close();
    } catch {
      problems.push(`${name} could not be read as a PDF.`);
    }
  }
  if (added.length) await addFiles(added.map(([meta, file]) => [meta.id, file]));
  // Only PDFs added as they were can hold annotations from other apps.
  askAbout(added.flatMap(([meta]) => (meta.source && meta.source.kind !== 'link' ? [] : [meta.id])));
  const next = {
    ...project,
    docs: [...project.docs, ...added.map(([meta]) => meta)],
    updatedAt: Date.now(),
  };
  return { project: next, problems };
}

export async function addDocs(files: Input[]) {
  const { project } = get();
  if (!project) return [];
  const { project: next, problems } = await importFiles(project, files);
  const first = next.docs[project.docs.length];
  // Another edit may have landed while the files were read; only the documents are taken from `next`.
  edit((p) => ({ docs: [...p.docs, ...next.docs.slice(project.docs.length)] }), false);
  if (first) set({ activeDocId: first.id });
  return problems;
}

export function removeDoc(docId: string) {
  const { project, activeDocId, sideDocId } = get();
  if (!project) return;
  const gone = new Set(project.highlights.filter((h) => h.docId === docId).map((h) => h.id));
  const cards = project.cards.filter((c) => !(c.data.kind === 'excerpt' && gone.has(c.data.highlightId)));
  const kept = new Set(cards.map((c) => c.id));
  const docs = project.docs.filter((d) => d.id !== docId);
  // Undo history refers to the removed highlights, and the file itself is deleted, so it starts over.
  set({ past: [], future: [] });
  const highlights = project.highlights.filter((h) => !gone.has(h.id));
  edit(
    () => ({
      docs,
      highlights,
      cards,
      links: project.links.filter((l) => kept.has(l.source) && kept.has(l.target)),
      inks: project.inks.filter((i) => i.docId !== docId),
      folds: project.folds.filter((f) => f.docId !== docId),
      ...prune({ ...project, highlights, cards }),
    }),
    false,
  );
  if (activeDocId === docId) set({ activeDocId: docs[0]?.id ?? null });
  if (sideDocId === docId) set({ sideDocId: null });
  void deleteFile(docId);
}

export function addHighlight(docId: string, parts: Part[], text: string, color: Color, extra: Pick<Highlight, 'area'> = {}) {
  const highlight: Highlight = { id: uid(), docId, parts, text, color, ...extra };
  edit((p) => ({ highlights: [...p.highlights, highlight] }));
  return highlight;
}

export const CARD_WIDTH = 280;
export const newCard = (data: CardData, position: XYPosition): Card => ({
  id: uid(),
  type: 'card',
  position,
  data: { ...data, canvasId: get().canvasId },
  width: CARD_WIDTH,
  selected: true,
});

/** Puts a highlight on the canvas as an excerpt card. */
export function excerpt(highlightId: string, position = canvasSpot.next()) {
  const card = newCard({ kind: 'excerpt', highlightId }, position);
  edit((p) => ({
    cards: [...p.cards.map((c) => ({ ...c, selected: false })), card],
  }));
  set({ focus: { cardId: card.id, at: Date.now() } });
  return card;
}

export function addNote(position = canvasSpot.next(), text = '') {
  const card = newCard({ kind: 'note', text }, position);
  edit((p) => ({
    cards: [...p.cards.map((c) => ({ ...c, selected: false })), card],
  }));
  return card;
}

export const updateCard = (id: string, data: Partial<CardData>) =>
  edit(
    (p) => ({
      cards: p.cards.map((c) => (c.id === id ? ({ ...c, data: { ...c.data, ...data } } as Card) : c)),
    }),
    false,
  );

export const recolor = (id: string, color: Color) =>
  edit((p) => ({
    highlights: p.highlights.map((h) => (h.id === id ? { ...h, color } : h)),
  }));

/** Removes cards with their links, and the highlights of excerpts no other card still shows. */
export function without(p: Project, removed: Set<string>, highlightIds = new Set<string>()): Partial<Project> {
  // A group goes with the cards inside it.
  const cardIds = new Set([...removed, ...p.cards.filter((c) => c.parentId && removed.has(c.parentId)).map((c) => c.id)]);
  const cards = p.cards.filter((c) => !cardIds.has(c.id) && !(c.data.kind === 'excerpt' && highlightIds.has(c.data.highlightId)));
  const shown = new Set(cards.flatMap((c) => (c.data.kind === 'excerpt' ? [c.data.highlightId] : [])));
  const orphaned = new Set(p.cards.filter((c) => cardIds.has(c.id) && c.data.kind === 'excerpt').map((c) => (c.data as { highlightId: string }).highlightId));
  const kept = new Set(cards.map((c) => c.id));
  const highlights = p.highlights.filter((h) => !highlightIds.has(h.id) && !(orphaned.has(h.id) && !shown.has(h.id)));
  return {
    cards,
    highlights,
    links: p.links.filter((l) => kept.has(l.source) && kept.has(l.target)),
    ...prune({ ...p, cards, highlights }),
  };
}

/**
 * Switches a document to a new version of its file, with what is anchored to its pages moved to
 * match, as one step to undo. False, and nothing changes, when the document is no longer at the
 * version the edit was made from.
 */
export function switchVersion(docId: string, from: string | undefined, to: Version, remap: (p: Project) => Partial<Project>) {
  const doc = get().project?.docs.find((d) => d.id === docId);
  if (!doc || doc.file !== from) return false;
  edit((p) => {
    const moved = remap(p);
    return { ...moved, docs: (moved.docs ?? p.docs).map((d) => (d.id === docId ? atVersion(d, to) : d)) };
  });
  return true;
}

export const removeHighlight = (id: string) => edit((p) => without(p, new Set(), new Set([id])));

export function onCardsChange(changes: NodeChange<Card>[]) {
  const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])));
  // Drags and resizes take their undo step when they start (see the canvas), not on every frame.
  edit((p) => {
    const cards = applyNodeChanges(
      changes.filter((c) => c.type !== 'remove'),
      p.cards,
    );
    return removed.size ? without({ ...p, cards }, removed) : { cards };
  }, removed.size > 0);
}

export function onLinksChange(changes: EdgeChange<Link>[]) {
  edit(
    (p) => ({ links: applyEdgeChanges(changes, p.links) }),
    changes.some((c) => c.type === 'remove'),
  );
}

export const connect = (connection: Connection) => edit((p) => ({ links: addEdge({ ...connection, id: uid() }, p.links) }));

/** Opens any squeeze that hides what is about to be shown. */
const unfold = (hides: (f: Fold) => boolean) => {
  const hidden = get().project?.folds.filter(hides) ?? [];
  if (hidden.length) edit((p) => ({ folds: p.folds.filter((f) => !hidden.includes(f)) }), false);
};

/** Shows a highlight in the pane given, or the one showing its document, preferring the main one. */
export const showSource = (highlightId: string, inPane?: Pane) => {
  const h = get().project?.highlights.find((x) => x.id === highlightId);
  const part = h?.parts[0];
  if (!h || !part) return;
  const spot = { page: part.page, y: part.rects[0]?.[1] ?? 0 };
  unfold((f) => f.docId === h.docId && before(f.from, spot) && before(spot, f.to));
  const pane = inPane ?? paneOf(h.docId);
  set({
    ...(pane ? {} : { activeDocId: h.docId }),
    jump: { highlightId, pane, at: Date.now() },
    view: 'doc',
  });
};

/** Opens a document at a page: at a destination on it (from the PDF's contents), or at a search match there. */
export const showPage = (docId: string, page: number, how: { query?: string; dest?: unknown[]; pane?: Pane } = {}) => {
  unfold((f) => f.docId === docId && f.from.page <= page && f.to.page >= page);
  const pane = how.pane ?? paneOf(docId);
  set({
    ...(pane ? {} : { activeDocId: docId }),
    jump: { page, query: how.query, dest: how.dest, pane, at: Date.now() },
    view: 'doc',
  });
};
export const jumped = () => set({ jump: null });

/** The canvas a card is on; cards from before there were several are on the first. */
export const canvasOf = (p: Project, card: Card) => card.data.canvasId ?? p.canvases[0]?.id ?? MAIN_CANVAS;

export const showCard = (cardId: string) => {
  const { project } = get();
  const card = project?.cards.find((c) => c.id === cardId);
  if (project && card) set({ canvasId: canvasOf(project, card), focus: { cardId, at: Date.now() }, view: 'canvas' });
};

export const setCanvas = (canvasId: string) => set({ canvasId });

export function addCanvas() {
  const { project } = get();
  if (!project) return;
  const id = uid();
  edit((p) => ({ canvases: [...p.canvases, { id, name: `Canvas ${p.canvases.length + 1}` }] }), false);
  set({ canvasId: id });
}

export const renameCanvas = (id: string, name: string) => edit((p) => ({ canvases: p.canvases.map((c) => (c.id === id ? { ...c, name } : c)) }), false);

/** Removes a canvas with its cards; the last canvas stays. */
export function removeCanvas(id: string) {
  const { project, canvasId } = get();
  if (!project || project.canvases.length < 2) return;
  const onIt = new Set(project.cards.filter((c) => canvasOf(project, c) === id).map((c) => c.id));
  edit((p) => ({ ...without(p, onIt), canvases: p.canvases.filter((c) => c.id !== id) }));
  if (canvasId === id) set({ canvasId: get().project!.canvases[0]!.id });
}
export const setView = (view: State['view']) => set({ view });

export const setTools = (tools: Partial<Pick<State, 'docTool' | 'canvasTool' | 'inkColor'>>) => set(tools);

export function addInk(docId: string, page: number, points: Point[], size: number, pen: boolean) {
  const ink: Ink = {
    id: uid(),
    docId,
    page,
    points,
    size,
    pen,
    color: get().inkColor,
  };
  edit((p) => ({ inks: [...p.inks, ink] }));
}

export const removeInk = (id: string) => edit((p) => ({ inks: p.inks.filter((i) => i.id !== id) }));

/** A handwritten stroke on the canvas becomes a card the size of the stroke, so it can be moved, linked and grouped. */
export function addCanvasInk(points: Point[], size: number, pen: boolean) {
  const pad = size;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x, y] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  const card: Card = {
    id: uid(),
    type: 'card',
    position: { x, y },
    width: Math.max(...xs) - x + pad,
    height: Math.max(...ys) - y + pad,
    data: {
      kind: 'ink',
      canvasId: get().canvasId,
      points: points.map(([px, py, pr]) => [px - x, py - y, pr]),
      color: get().inkColor,
      size,
      pen,
    },
  };
  edit((p) => ({ cards: [...p.cards, card] }));
}

/** Squeezes a stretch of a document out of view, merging it with any squeeze it touches. */
export function addFold(docId: string, from: Spot, to: Spot) {
  if (!before(from, to)) return;
  edit((p) => {
    let fold: Fold = { id: uid(), docId, from, to };
    const others: Fold[] = [];
    for (const f of p.folds) {
      if (f.docId === docId && !before(f.to, fold.from) && !before(fold.to, f.from)) {
        fold = {
          ...fold,
          from: before(f.from, fold.from) ? f.from : fold.from,
          to: before(fold.to, f.to) ? f.to : fold.to,
        };
      } else others.push(f);
    }
    return { folds: [...others, fold] };
  });
}

export const removeFolds = (ids: string[]) => edit((p) => ({ folds: p.folds.filter((f) => !ids.includes(f.id)) }));

const GROUP_PAD = 20;
const GROUP_HEADER = 40;

/** Puts the chosen cards in a new group around them. Cards already in a group stay where they are. */
export function group(ids: string[]) {
  const project = get().project;
  if (!project) return;
  const members = project.cards.filter((c) => ids.includes(c.id) && !c.parentId && c.data.kind !== 'group');
  if (!members.length) return;
  const size = (c: Card) => ({
    w: c.measured?.width ?? c.width ?? CARD_WIDTH,
    h: c.measured?.height ?? c.height ?? 100,
  });
  const left = Math.min(...members.map((c) => c.position.x)) - GROUP_PAD;
  const top = Math.min(...members.map((c) => c.position.y)) - GROUP_HEADER;
  const right = Math.max(...members.map((c) => c.position.x + size(c).w)) + GROUP_PAD;
  const bottom = Math.max(...members.map((c) => c.position.y + size(c).h)) + GROUP_PAD;
  const box: Card = {
    id: uid(),
    type: 'card',
    position: { x: left, y: top },
    width: right - left,
    height: bottom - top,
    data: { kind: 'group', title: '', canvasId: get().canvasId },
    selected: true,
  };
  const inside = new Set(members.map((c) => c.id));
  // React Flow needs a group listed before the cards inside it.
  edit((p) => ({
    cards: [
      box,
      ...p.cards.map((c) =>
        inside.has(c.id)
          ? {
              ...c,
              parentId: box.id,
              expandParent: true,
              selected: false,
              position: { x: c.position.x - left, y: c.position.y - top },
            }
          : { ...c, selected: false },
      ),
    ],
  }));
  return box;
}

export function ungroup(groupId: string) {
  edit((p) => {
    const box = p.cards.find((c) => c.id === groupId);
    if (!box) return {};
    return {
      cards: p.cards.flatMap((c) => {
        if (c.id === groupId) return [];
        if (c.parentId !== groupId) return [c];
        const { parentId, ...rest } = c;
        return [
          {
            ...rest,
            position: {
              x: c.position.x + box.position.x,
              y: c.position.y + box.position.y,
            },
          },
        ];
      }),
    };
  });
}

/** Moves a card into a group, or out of one, keeping where it sits on screen. A group grows to hold a card that joins it. */
export function regroup(cardId: string, groupId: string | null) {
  edit((p) => {
    const card = p.cards.find((c) => c.id === cardId);
    if (!card || (card.parentId ?? null) === groupId) return {};
    const at = (id?: string) => p.cards.find((c) => c.id === id)?.position ?? { x: 0, y: 0 };
    const from = card.parentId ? at(card.parentId) : { x: 0, y: 0 };
    const to = groupId ? at(groupId) : { x: 0, y: 0 };
    const { parentId, ...rest } = card;
    const moved: Card = {
      ...rest,
      ...(groupId ? { parentId: groupId, expandParent: true } : { expandParent: false }),
      position: { x: card.position.x + from.x - to.x, y: card.position.y + from.y - to.y },
    };
    const w = card.measured?.width ?? card.width ?? CARD_WIDTH;
    const h = card.measured?.height ?? card.height ?? 100;
    const cards = p.cards
      .filter((c) => c.id !== cardId)
      .map((c) =>
        c.id === groupId
          ? {
              ...c,
              width: Math.max(c.width ?? 0, moved.position.x + w + GROUP_PAD),
              height: Math.max(c.height ?? 0, moved.position.y + h + GROUP_PAD),
            }
          : c,
      );
    // Kept after its group in the list, as React Flow requires.
    return { cards: [...cards, moved] };
  });
}

/** Notes that this device has a stylus, for palm rejection. */
export function notePen() {
  if (get().penSeen) return;
  set({ penSeen: true });
  try {
    localStorage.setItem(PEN_KEY, '1');
  } catch {
    // Not remembered; it is noticed again the next time the pen touches.
  }
}

const COLLAPSED_HEIGHT = 48;

/** Folds a group down to its name, or opens it again, keeping its open size for next time. */
export function collapseGroup(id: string, collapsed: boolean) {
  edit((p) => ({
    cards: p.cards.map((c) => {
      if (c.id !== id || c.data.kind !== 'group' || !!c.data.collapsed === collapsed) return c;
      const height = collapsed ? COLLAPSED_HEIGHT : (c.data.openHeight ?? c.height);
      return { ...c, height, data: { ...c.data, collapsed, openHeight: collapsed ? (c.measured?.height ?? c.height) : c.data.openHeight } } as Card;
    }),
  }));
}
