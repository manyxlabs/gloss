// Taking pages out of a document: as a PDF to download, or as a new document in the project with
// the marks on those pages copied onto it.
import { addFiles } from '../store/db';
import { edit, setActiveDoc, uid, type Pane } from '../store/project';
import type { DocMeta, Highlight } from '../types';
import { arrange, editable, PROTECTED, prune, remap, rewrite, type Sheet } from './pages';

/** Page numbers as a reader writes them: runs joined, as in 2-4, 7. */
export const pageRanges = (pages: number[]) =>
  pages
    .reduce<[number, number][]>((runs, n) => {
      const last = runs.at(-1);
      if (last && n === last[1] + 1) last[1] = n;
      else runs.push([n, n]);
      return runs;
    }, [])
    .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`))
    .join(', ');

/** A PDF of some of a document's pages in order, cut from its current file with its contents, links and forms kept where they can be. */
export async function pagesPdf(docId: string, pages: number[]) {
  const open = await editable(docId, PROTECTED);
  if (typeof open === 'string') throw new Error(open);
  const sheets: Sheet[] = pages.map((page) => ({ page, turn: 0 }));
  arrange(open.pdf, sheets, []);
  prune(open.pdf);
  const blob = new Blob([(await open.pdf.save({ addDefaultPage: false, updateFieldAppearances: false })) as BlobPart], { type: 'application/pdf' });
  return { doc: open.doc, sheets, blob, name: `${open.doc.name} (${pages.length === 1 ? 'page' : 'pages'} ${pageRanges(pages)})` };
}

/**
 * Adds some of a document's pages as a new document of the project, after it, with the
 * highlights, comments, links between them, handwriting, squeezes and bookmarks on those pages,
 * and opens it in the pane given. One step to undo. Resolves with the problems to show, if any.
 */
export const extractPages = (docId: string, pages: number[], pane: Pane) =>
  rewrite('The pages could not be extracted.', async () => {
    const { doc, sheets, blob, name } = await pagesPdf(docId, pages);
    const id = uid();
    await addFiles([[id, blob]]);
    const added: DocMeta = {
      id,
      name,
      pages: pages.length,
      size: blob.size,
      ...(doc.source ? { source: doc.source } : {}),
      ...(doc.zotero ? { zotero: doc.zotero } : {}),
      // Pages of a document kept on this device stay on it.
      ...(doc.local ? { local: true as const } : {}),
    };
    edit((p) => {
      // The marks as they would be were the document cut down to these pages, then copied with new ids.
      const cut = remap(p, docId, sheets, []);
      const fresh = <T extends { id: string; docId: string }>(list: T[] | undefined) => (list ?? []).filter((x) => x.docId === docId).map((x) => ({ ...x, id: uid(), docId: id }));
      const ids = new Map<string, string>();
      const commentIds = new Map<string, string>();
      const highlights = (cut.highlights ?? []).flatMap((h): Highlight[] => {
        if (h.docId !== docId || !h.parts.length) return [];
        ids.set(h.id, uid());
        if (h.commentId && !commentIds.has(h.commentId)) commentIds.set(h.commentId, uid());
        return [{ ...h, id: ids.get(h.id)!, docId: id, ...(h.commentId ? { commentId: commentIds.get(h.commentId)! } : {}) }];
      });
      const at = p.docs.findIndex((d) => d.id === docId);
      return {
        // Ranked documents keep their order, with the new one after its original.
        docs: [...p.docs.slice(0, at + 1), { ...added, ...(p.docs[at]?.rank !== undefined ? { rank: p.docs[at].rank + 0.5 } : {}) }, ...p.docs.slice(at + 1)],
        highlights: [...p.highlights, ...highlights],
        comments: [...p.comments, ...p.comments.flatMap((c) => (commentIds.has(c.id) ? [{ ...c, id: commentIds.get(c.id)! }] : []))],
        passageLinks: [...p.passageLinks, ...p.passageLinks.flatMap((l) => (ids.has(l.a) && ids.has(l.b) ? [{ id: uid(), a: ids.get(l.a)!, b: ids.get(l.b)! }] : []))],
        inks: [...p.inks, ...fresh(cut.inks)],
        folds: [...p.folds, ...fresh(cut.folds)],
        bookmarks: [...p.bookmarks, ...fresh(cut.bookmarks)],
      };
    });
    setActiveDoc(id, pane);
    return [];
  });
