import type { Edge, Node } from '@xyflow/react';

export const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type Color = (typeof COLORS)[number];

/** x, y, width, height as fractions of the page, so a highlight stays put at any zoom. */
export type Rect = [number, number, number, number];
export type Part = { page: number; rects: Rect[] };

export type Highlight = { id: string; docId: string; parts: Part[]; text: string; color: Color };

export type DocMeta = { id: string; name: string; pages: number; size: number; lastPage?: number };

export type ExcerptData = { kind: 'excerpt'; highlightId: string; comment?: string };
export type NoteData = { kind: 'note'; text: string };
export type CardData = ExcerptData | NoteData;
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
};
