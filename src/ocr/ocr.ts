import { create } from 'zustand';
import { locale, m } from '../i18n';
import { editable, rewrite, saveVersion } from '../pdf/pages';
import { ReaderError } from '../pdf/pdfjs';
import { useStore } from '../store/project';

export const LOCKED = m.engineOcr.locked;

/** Tesseract's language codes; the data for each is fetched from Gloss's own origin when first used. */
export const LANGUAGES = [
  ['eng', m.engineOcr.languages.eng],
  ['hin', m.engineOcr.languages.hin],
  ['eng+hin', m.engineOcr.languages['eng+hin']],
] as const;
export type Language = (typeof LANGUAGES)[number][0];
/** The language picked last, for the next pages read. */
export const useOcrLanguage = create<{ language: Language }>(() => ({ language: 'eng' }));

/** Text being recognised in a document: its pages, how far through them it is (0 to 1), and how to stop. */
export type Job = { pages: number[]; progress: number; stop: () => void };
export const useOcr = create<Partial<Record<string, Job>>>(() => ({}));

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
    return await rewrite(m.engineOcr.notSelectable, async () => {
      const empty = found.filter((p) => !p.words.length).map((p) => p.page);
      const none = empty.length ? [m.engineOcr.noText(empty.length, new Intl.ListFormat(locale).format(empty.map(String)))] : [];
      if (empty.length === found.length) return none;
      const open = await editable(docId, LOCKED);
      if (typeof open === 'string') return [open];
      if (open.doc.file !== doc.file) return [m.engineOcr.changed];
      const { addTextLayer } = await import('./write');
      const missed = await addTextLayer(open.pdf, found);
      const failed = await saveVersion(open.doc, open.pdf, () => ({}));
      return [...(failed ? [failed] : []), ...none, ...(missed ? [m.engineOcr.missed(missed)] : [])];
    });
  } catch (err) {
    if (control.signal.aborted) return [];
    return [m.engineOcr.notRead(err instanceof ReaderError ? err.message : m.engineOcr.offline)];
  } finally {
    useOcr.setState({ [docId]: undefined });
  }
}
