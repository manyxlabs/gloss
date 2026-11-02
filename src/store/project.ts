import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react';
import { create } from 'zustand';
import { closeDocs, isPdf, openPdf, PdfPasswordError } from '../pdf/pdfjs';
import type { Card, CardData, Color, DocMeta, Highlight, Link, Part, Project } from '../types';
import { addFiles, deleteFile, getProject, putProject } from './db';

type Snapshot = Pick<Project, 'highlights' | 'cards' | 'links'>;

type State = {
  project: Project | null;
  activeDocId: string | null;
  /** A request for the document pane to scroll to a highlight or a search match; `at` makes a repeat request distinct. */
  jump: ({ highlightId: string } | { page: number; query: string }) & { at: number } | null;
  /** A request for the canvas to bring a card into view. */
  focus: { cardId: string; at: number } | null;
  /** Which side a phone shows; a request to show a card or a source switches it. */
  view: 'doc' | 'canvas';
  past: Snapshot[];
  future: Snapshot[];
};

const MAX_UNDO = 200;
export const uid = () => crypto.randomUUID();

export const useStore = create<State>(() => ({ project: null, activeDocId: null, jump: null, focus: null, view: 'doc', past: [], future: [] }));
const { getState: get, setState: set } = useStore;

/** Where the canvas puts a new card when it was not dropped at a spot: set by the canvas while it is mounted. */
export const canvasSpot: { next: () => XYPosition } = { next: () => ({ x: 0, y: 0 }) };

function edit(change: (p: Project) => Partial<Project>, undoable = true) {
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
  const { highlights, cards, links } = project;
  set({ past: [...past.slice(-MAX_UNDO + 1), { highlights, cards, links }], future: [] });
}

function travel(from: 'past' | 'future') {
  const state = get();
  const stack = state[from];
  const target = stack.at(-1);
  if (!state.project || !target) return;
  const { highlights, cards, links } = state.project;
  const to = from === 'past' ? 'future' : 'past';
  set({ [from]: stack.slice(0, -1), [to]: [...state[to], { highlights, cards, links }], project: { ...state.project, ...target, updatedAt: Date.now() } });
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
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());

/** What React Flow adds to a card while it is on screen is not worth keeping. */
const storedCard = ({ id, type, position, data, width, height }: Card): Card => ({ id, type, position, data, ...(width ? { width } : {}), ...(height ? { height } : {}) });

export async function openProject(id: string) {
  const project = (await getProject(id)) ?? null;
  set({ project, activeDocId: project?.docs[0]?.id ?? null, past: [], future: [], jump: null, focus: null, view: 'doc' });
  return project;
}

export function closeProject() {
  save();
  closeDocs();
  set({ project: null, activeDocId: null, past: [], future: [] });
}

export const newProject = (name: string): Project => ({ id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(), docs: [], highlights: [], cards: [], links: [] });

export const rename = (name: string) => edit(() => ({ name }), false);
export const setActiveDoc = (activeDocId: string) => set({ activeDocId });
export const rememberPage = (docId: string, lastPage: number) =>
  edit((p) => ({ docs: p.docs.map((d) => (d.id === docId ? { ...d, lastPage } : d)) }), false);

/** Reads and stores PDFs. Returns a message for each file that could not be added. */
export async function importFiles(project: Project, files: File[]): Promise<{ project: Project; problems: string[] }> {
  const problems: string[] = [];
  const added: [DocMeta, File][] = [];
  for (const file of files) {
    if (!(await isPdf(file))) {
      problems.push(`${file.name} is not a PDF.`);
      continue;
    }
    try {
      const { doc, close } = await openPdf(file);
      added.push([{ id: uid(), name: file.name.replace(/\.pdf$/i, ''), pages: doc.numPages, size: file.size }, file]);
      await close();
    } catch (err) {
      problems.push(err instanceof PdfPasswordError ? `${file.name} is password protected. Save a copy without the password and add that.` : `${file.name} could not be read as a PDF.`);
    }
  }
  if (added.length) await addFiles(added.map(([meta, file]) => [meta.id, file]));
  const next = { ...project, docs: [...project.docs, ...added.map(([meta]) => meta)], updatedAt: Date.now() };
  return { project: next, problems };
}

export async function addDocs(files: File[]) {
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
  const { project, activeDocId } = get();
  if (!project) return;
  const gone = new Set(project.highlights.filter((h) => h.docId === docId).map((h) => h.id));
  const cards = project.cards.filter((c) => !(c.data.kind === 'excerpt' && gone.has(c.data.highlightId)));
  const kept = new Set(cards.map((c) => c.id));
  const docs = project.docs.filter((d) => d.id !== docId);
  // Undo history refers to the removed highlights, and the file itself is deleted, so it starts over.
  set({ past: [], future: [] });
  edit(() => ({ docs, highlights: project.highlights.filter((h) => !gone.has(h.id)), cards, links: project.links.filter((l) => kept.has(l.source) && kept.has(l.target)) }), false);
  if (activeDocId === docId) set({ activeDocId: docs[0]?.id ?? null });
  void deleteFile(docId);
}

export function addHighlight(docId: string, parts: Part[], text: string, color: Color) {
  const highlight: Highlight = { id: uid(), docId, parts, text, color };
  edit((p) => ({ highlights: [...p.highlights, highlight] }));
  return highlight;
}

export const CARD_WIDTH = 280;
const newCard = (data: CardData, position: XYPosition): Card => ({ id: uid(), type: 'card', position, data, width: CARD_WIDTH, selected: true });

/** Puts a highlight on the canvas as an excerpt card. */
export function excerpt(highlightId: string, position = canvasSpot.next()) {
  const card = newCard({ kind: 'excerpt', highlightId }, position);
  edit((p) => ({ cards: [...p.cards.map((c) => ({ ...c, selected: false })), card] }));
  set({ focus: { cardId: card.id, at: Date.now() } });
  return card;
}

export function addNote(position = canvasSpot.next(), text = '') {
  const card = newCard({ kind: 'note', text }, position);
  edit((p) => ({ cards: [...p.cards.map((c) => ({ ...c, selected: false })), card] }));
  return card;
}

export const updateCard = (id: string, data: Partial<CardData>) =>
  edit((p) => ({ cards: p.cards.map((c) => (c.id === id ? ({ ...c, data: { ...c.data, ...data } } as Card) : c)) }), false);

export const recolor = (id: string, color: Color) => edit((p) => ({ highlights: p.highlights.map((h) => (h.id === id ? { ...h, color } : h)) }));

/** Removes cards with their links, and the highlights of excerpts no other card still shows. */
function without(p: Project, cardIds: Set<string>, highlightIds = new Set<string>()): Partial<Project> {
  const cards = p.cards.filter((c) => !cardIds.has(c.id) && !(c.data.kind === 'excerpt' && highlightIds.has(c.data.highlightId)));
  const shown = new Set(cards.flatMap((c) => (c.data.kind === 'excerpt' ? [c.data.highlightId] : [])));
  const orphaned = new Set(p.cards.filter((c) => cardIds.has(c.id) && c.data.kind === 'excerpt').map((c) => (c.data as { highlightId: string }).highlightId));
  const kept = new Set(cards.map((c) => c.id));
  return {
    cards,
    highlights: p.highlights.filter((h) => !highlightIds.has(h.id) && !(orphaned.has(h.id) && !shown.has(h.id))),
    links: p.links.filter((l) => kept.has(l.source) && kept.has(l.target)),
  };
}

export const removeHighlight = (id: string) => edit((p) => without(p, new Set(), new Set([id])));

export function onCardsChange(changes: NodeChange<Card>[]) {
  const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])));
  // Drags and resizes take their undo step when they start (see the canvas), not on every frame.
  edit((p) => {
    const cards = applyNodeChanges(changes.filter((c) => c.type !== 'remove'), p.cards);
    return removed.size ? without({ ...p, cards }, removed) : { cards };
  }, removed.size > 0);
}

export function onLinksChange(changes: EdgeChange<Link>[]) {
  edit((p) => ({ links: applyEdgeChanges(changes, p.links) }), changes.some((c) => c.type === 'remove'));
}

export const connect = (connection: Connection) => edit((p) => ({ links: addEdge({ ...connection, id: uid() }, p.links) }));

export const showSource = (highlightId: string) => {
  const h = get().project?.highlights.find((x) => x.id === highlightId);
  if (h) set({ activeDocId: h.docId, jump: { highlightId, at: Date.now() }, view: 'doc' });
};

export const showMatch = (docId: string, page: number, query: string) => set({ activeDocId: docId, jump: { page, query, at: Date.now() }, view: 'doc' });
export const jumped = () => set({ jump: null });

export const showCard = (cardId: string) => set({ focus: { cardId, at: Date.now() }, view: 'canvas' });
export const setView = (view: State['view']) => set({ view });
