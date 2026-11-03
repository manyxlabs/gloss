import type { Edge, Node } from '@xyflow/react';

export const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'purple', 'fuchsia', 'pink', 'rose', 'gray'] as const;
/** 32 highlight colours: each hue light and deep. The five there were at first, yellow, green, blue, pink and purple, keep their ids and shades. */
export type Color = (typeof HUES)[number] | `deep-${(typeof HUES)[number]}`;
export const COLORS: Color[] = [...HUES, ...HUES.map((h) => `deep-${h}` as const)];

/** x, y, width, height as fractions of the page, so a highlight stays put at any zoom. */
export type Rect = [number, number, number, number];
export type Part = { page: number; rects: Rect[] };

/**
 * Marked text, or with `area` a box drawn around a figure or table. `commentId` is the comment
 * pinned beside it in the document's margin, which other passages may share. With no parts it is
 * unplaced: its document was replaced by a version where its words were not found, and it waits
 * in the sidebar, with its comment, links and excerpts, to be placed again or deleted.
 */
export type Highlight = { id: string; docId: string; parts: Part[]; text: string; color: Color; area?: boolean; typed?: Typed; commentId?: string; tags?: string[] };
/**
 * Makes a highlight a text box: words the reader typed onto the page, in the part's one rect, filled
 * with the highlight's colour. `size` is the letters' size as a fraction of the page's width, so the
 * box looks the same at any zoom.
 */
export type Typed = { size: number };

/** A label put on passages and cards, to find and filter them by; `category` names the heading it is listed under. */
export type Tag = { id: string; name: string; category?: string; color?: Color };

/** A comment in the margin, shown beside every highlight whose `commentId` names it; it goes with the last of them. */
export type Comment = { id: string; text: string };
/** Two passages that refer to each other, in one document or across two. */
export type PassageLink = { id: string; a: string; b: string };
/** A passage linked to a card on the canvas, drawn with the pen from one to the other. */
export type CardLink = { id: string; cardId: string; highlightId: string };

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
  /** What a document was converted from, when it was not added as a PDF, or the link it was fetched from. */
  source?: DocSource;
  /**
   * The version of the file once its pages have been edited. Each edit stores a new file beside the
   * old one, so the switch is one step, undo can switch back, and other devices know to fetch it.
   * Absent, the file is the one the document was added with.
   */
  file?: string;
  /** Shown before the others, in the tabs and the list of documents. */
  pinned?: boolean;
  /** Where it sits among the documents, lowest first; absent, it keeps its place in the list. Shared, so every device orders them alike. */
  rank?: number;
  /** The folder of the project's documents it is in; absent or unknown, it is at the top. */
  folder?: string;
  /** The Zotero item it was imported from, with what to cite it by. */
  zotero?: ZoteroItem;
  /** Kept on this device only, with everything on it: never sent to the others in a shared project. */
  local?: true;
};

export type ZoteroItem = { userId: string; key: string; title: string; authors: string[]; year?: string; citationKey?: string };

/** A folder of the project's documents. */
export type DocFolder = { id: string; name: string; rank: number };

/** A named place in a document, listed in its sidebar and exported as an outline entry; `rank` orders a document's bookmarks. */
export type Bookmark = { id: string; docId: string; page: number; y: number; name: string; rank: number };

/** `link` is a file fetched from a share link as it was, without converting. */
export type DocSource = { kind: 'image' | 'docx' | 'pptx' | 'text' | 'web' | 'link'; name?: string; url?: string };

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
/** `strokes` are handwriting over the note. */
export type NoteData = { kind: 'note'; text: string; strokes?: Stroke[] };
/** Handwriting on the canvas, in canvas units from the card's corner. */
export type InkData = {
  kind: 'ink';
  points: Point[];
  color: InkColor;
  size: number;
  pen: boolean;
};
/** A collapsed group shows only its name and how many cards it holds; `openHeight` is its height when open. */
export type GroupData = { kind: 'group'; title: string; collapsed?: boolean; openHeight?: number };
/** A stroke written inside a card, in canvas units from the card's corner. */
export type Stroke = { id: string; points: Point[]; color: InkColor; size: number; pen: boolean };
/** A box to write in by hand, sized by the reader. */
export type SketchData = { kind: 'sketch'; strokes: Stroke[] };
/** Opens canvas `target`, which is nested in the canvas this card is on and goes with the card. */
export type CanvasCardData = { kind: 'canvas'; target: string };
/**
 * Every card sits on one of the project's canvases; cards from before there were several have none
 * and sit on the first. `canvasLinks` are canvases the card leads to, each shown as a chip on it.
 * `tags` are the card's own; an excerpt shows its passage's tags instead.
 */
export type CardData = (ExcerptData | NoteData | InkData | GroupData | SketchData | CanvasCardData) & { canvasId?: string; canvasLinks?: string[]; tags?: string[] };
export type Background = 'dots' | 'grid' | 'plain';
/**
 * A canvas, at the top level or nested in `parentId` through a canvas card. Its look: the pattern
 * behind the cards, the colour notes take, and an accent for what is chosen and for links. `local`
 * keeps it, with everything on it and nested in it, on this device only, out of sync.
 */
export type CanvasMeta = { id: string; name: string; parentId?: string; background?: Background; cardColor?: Color; accent?: Color; local?: true };
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
  comments: Comment[];
  passageLinks: PassageLink[];
  cardLinks: CardLink[];
  tags: Tag[];
  bookmarks: Bookmark[];
  docFolders: DocFolder[];
  /** The backup this project was restored from, as its project's id and last change, to notice the same backup restored twice. */
  restoredFrom?: string;
  /** The sync room this project is shared through, with its key; absent while the project stays on this device. */
  sync?: { room: string; key: string };
  /** The library folder it is filed in, on this device only; absent or unknown, it is at the top level. */
  folder?: string;
  /** When it was last opened on this device; projects from before this was kept count their last edit. */
  openedAt?: number;
};

export type Folder = { id: string; name: string; createdAt: number; collapsed?: boolean };
