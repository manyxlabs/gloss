import type { Anchor } from '../pdf/anchor';
import type { Color } from '../types';

/** Text dragged from a document to the canvas carries where it came from, so the card links back. */
export const EXCERPT_MIME = 'application/x-gloss-excerpt';
export type ExcerptDrag = Anchor & { docId: string; color: Color };
