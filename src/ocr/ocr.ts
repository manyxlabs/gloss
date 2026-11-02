import { create } from 'zustand';
import { editable, rewrite, saveVersion } from '../pdf/pages';
import { useStore } from '../store/project';

export const LOCKED = 'Making text selectable needs an unprotected copy of this PDF. Save a copy without the password, add that, and make its text selectable there.';

/** Tesseract's language codes; the data for each is fetched from Gloss's own origin when first used. */
export const LANGUAGES = [
  ['eng', 'English'],
  ['hin', 'Hindi'],
  ['eng+hin', 'English, Hindi'],
] as const;
export type Language = (typeof LANGUAGES)[number][0];
/** The language picked last, for the next pages read. */
export const useOcrLanguage = create<{ language: Language }>(() => ({ language: 'eng' }));

/** Text being recognised in a document: its pages, how far through them it is (0 to 1), and how to stop. */
export type Job = { pages: number[]; progress: number; stop: () => void };
export const useOcr = create<Partial<Record<string, Job>>>(() => ({}));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const pagesNamed = (pages: number[]) => (pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.slice(0, -1).join(', ')} and ${pages.at(-1)}`);

/**
 * Recognises the text on scanned pages and writes it into the PDF as an invisible text layer, as a
 * new version of the file: one step to undo, shared like a page edit. Nothing changes if it is
 * stopped. Resolves with what to tell the reader, if anything.
 */
export async function makeSelectable(docId: string, pages: number[], language = useOcrLanguage.getState().language): Promise<string[]> {
  const doc = useStore.getState().project?.docs.find((d) => d.id === docId);
  if (!doc || !pages.length || useOcr.getState()[docId]) return [];
  if (doc.password) return [LOCKED];
  const control = new AbortController();
  const update = (progress: number) => useOcr.setState((s) => (s[docId] ? { [docId]: { ...s[docId], progress } } : {}));
  useOcr.setState({ [docId]: { pages, progress: 0, stop: () => control.abort() } });
  try {
    const { recognize } = await import('./recognize');
    const found = await recognize(docId, pages, language, update, control.signal);
    return await rewrite('The text could not be made selectable.', async () => {
      const empty = found.filter((p) => !p.words.length).map((p) => p.page);
      const none = empty.length ? [`No text was found on ${pagesNamed(empty)}.`] : [];
      if (empty.length === found.length) return none;
      const open = await editable(docId, LOCKED);
      if (typeof open === 'string') return [open];
      if (open.doc.file !== doc.file) return ['The document changed while its text was being read. Try again.'];
      const { addTextLayer } = await import('./write');
      const missed = await addTextLayer(open.pdf, found);
      const failed = await saveVersion(open.doc, open.pdf, () => ({}));
      return [...(failed ? [failed] : []), ...none, ...(missed ? [`${plural(missed, 'word')} in a script Gloss cannot write into PDFs yet could not be made selectable.`] : [])];
    });
  } catch (err) {
    if (control.signal.aborted) return [];
    return [
      `The text could not be read. ${err instanceof Error && /^[A-Z].*\.$/.test(err.message) ? err.message : 'Check the connection the first time, as the reading files are fetched once, and try again.'}`,
    ];
  } finally {
    useOcr.setState({ [docId]: undefined });
  }
}
