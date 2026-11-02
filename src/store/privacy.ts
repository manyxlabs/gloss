import type { CanvasMeta, DocMeta } from '../types';
import { edit } from './project';

const mark = <T extends DocMeta | CanvasMeta>(e: T, local: boolean): T => {
  const { local: _, ...rest } = e;
  return (local ? { ...rest, local: true } : rest) as T;
};

/** Keeps a document, with everything on it, on this device only, or shares it again. One step to undo, which shares or withdraws it again. */
export const setDocLocal = (id: string, local: boolean) => edit((p) => ({ docs: p.docs.map((d) => (d.id === id ? mark(d, local) : d)) }));

/** Keeps a canvas, with its cards and the canvases nested in it, on this device only, or shares it again. */
export const setCanvasLocal = (id: string, local: boolean) => edit((p) => ({ canvases: p.canvases.map((c) => (c.id === id ? mark(c, local) : c)) }));

/** What making something private does in a shared project, said before it is done. */
export const privateWarning = (what: string) =>
  `Keep ${what} on this device only?\n\nIt is removed from everyone else’s copy of this project, with everything on it, and nothing more of it is sent, encrypted or not. Share it again to send it back.`;
