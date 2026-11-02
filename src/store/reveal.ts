import { snippetOf, type Target } from '../targets';
import { setActiveDoc, setCanvas, setView, showCard, showPage, showSource, useStore } from './project';

/** Shows what a link leads to in the open project: false when it is not there any more. */
export function reveal(t: Target) {
  const p = useStore.getState().project;
  if (!p || snippetOf(p, t) === null) return false;
  if (t.kind === 'h') showSource(t.id);
  else if (t.kind === 'c') showCard(t.id);
  else if (t.kind === 'm') showSource(p.highlights.find((h) => h.commentId === t.id)?.id ?? '');
  else if (t.kind === 'b') {
    const b = p.bookmarks.find((x) => x.id === t.id)!;
    showPage(b.docId, b.page, { y: b.y });
  } else if (t.kind === 'v') {
    setCanvas(t.id);
    setView('canvas');
  } else {
    setActiveDoc(t.id);
    setView('doc');
  }
  return true;
}
