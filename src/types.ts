import type { Edge, Node } from '@xyflow/react';

export const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type Color = (typeof COLORS)[number];

/** x, y, width, height as fractions of the page, so a highlight stays put at any zoom. */
export type Rect = [number, number, number, number];
export type Part = { page: number; rects: Rect[] };

/**
 * Marked text, or with `area` a box drawn around a figure or table. `note` is a comment pinned
 * beside it in the document's margin.
 */
export type Highlight = { id: string; docId: string; parts: Part[]; text: string; color: Color; area?: boolean; note?: string };

export type DocMeta = {
  id: string;
  name: string;
  pages: number;
  size: number;
  lastPage?: number;
  /**
   * Opens a protected PDF. Kept with the project in this browser; in a shared project it travels
   * with the rest, end-to-end encrypted, since everyone with the link can read the PDF anyway.
   */
  password?: string;
  /** What a document was converted from, when it was not added as a PDF. */
  source?: DocSource;
};

export type DocSource = { kind: 'image' | 'docx' | 'pptx' | 'text' | 'web'; name?: string; url?: string };

export const INKS = ['ink', 'red', 'blue', 'green'] as const;
export type InkColor = (typeof INKS)[number];
/** x, y and pen pressure (0 to 1). */
export type Point = [number, number, number];

/** Handwriting on a page, in fractions of the page's width (x and size) and height (y). */
export type Ink = {
  id: string;
  docId: string;
  page: number;
  points: Point[];
  color: InkColor;
  size: number;
  pen: boolean;
};

/** A squeezed stretch of a document: everything from one spot to another is folded out of view. */
export type Spot = { page: number; y: number };
export type Fold = { id: string; docId: string; from: Spot; to: Spot };

export type ExcerptData = {
  kind: 'excerpt';
  highlightId: string;
  comment?: string;
};
export type NoteData = { kind: 'note'; text: string };
/** Handwriting on the canvas, in canvas units from the card's corner. */
export type InkData = {
  kind: 'ink';
  points: Point[];
  color: InkColor;
  size: number;
  pen: boolean;
};
export type GroupData = { kind: 'group'; title: string };
/** Every card sits on one of the project's canvases; cards from before there were several have none and sit on the first. */
export type CardData = (ExcerptData | NoteData | InkData | GroupData) & { canvasId?: string };
export type CanvasMeta = { id: string; name: string };
export type Card = Node<CardData, 'card'>;
export type Link = Edge;

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  docs: DocMeta[];
  highlights: Highlight[];
  cards: Card[];
  links: Link[];
  inks: Ink[];
  folds: Fold[];
  canvases: CanvasMeta[];
  /** The sync room this project is shared through, with its key; absent while the project stays on this device. */
  sync?: { room: string; key: string };
};
