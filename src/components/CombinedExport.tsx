import { ArrowDown, ArrowUp, FileDown, Share } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { download, send } from '../download';
import { combinedPdf } from '../pdf/combine';
import { orderedDocs } from '../store/docs';
import { useStore } from '../store/project';
import { m } from '../i18n';

/** Chooses documents, and their order, to export as one annotated PDF, with the canvas on show as its last page if wanted. */
export function CombinedExport({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const project = useStore((s) => s.project)!;
  const canvasId = useStore((s) => s.canvasId);
  const canvas = project.canvases.find((c) => c.id === canvasId);
  const [order, setOrder] = useState(() => orderedDocs(project).map((d) => d.id));
  const [chosen, setChosen] = useState(() => new Set(order));
  const [withCanvas, setWithCanvas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => ref.current?.showModal(), []);

  const docs = order.flatMap((id) => project.docs.filter((d) => d.id === id));
  const swap = (i: number, j: number) => setOrder((o) => o.map((id, k) => (k === i ? o[j]! : k === j ? o[i]! : id)));
  const picked = docs.filter((d) => chosen.has(d.id));

  return (
    <dialog ref={ref} className="sheet glass combined-export" aria-labelledby="combined-h" onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          const hand = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'send' ? send : download;
          setBusy(true);
          setProblems([]);
          try {
            const { blob, problems } = await combinedPdf(
              project,
              picked.map((d) => d.id),
              withCanvas ? canvasId : null,
            );
            await hand(m.docCombined.file(project.name), blob);
            if (problems.length) setProblems(problems);
            else ref.current?.close();
          } catch (err) {
            setProblems([m.doc.exportFailed((err as Error).message)]);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="combined-h">{m.docCombined.heading}</h2>
        <p>{m.docCombined.intro}</p>
        <ul className="combined-docs" aria-label={m.docCombined.docs}>
          {docs.map((d, i) => (
            <li key={d.id}>
              <label>
                <input type="checkbox" checked={chosen.has(d.id)} onChange={(e) => setChosen((c) => new Set(e.target.checked ? [...c, d.id] : [...c].filter((x) => x !== d.id)))} />
                <span className="title">{d.name}</span>
              </label>
              <button type="button" className="icon" aria-label={m.docCombined.moveUp(d.name)} disabled={i === 0} onClick={() => swap(i, i - 1)}>
                <ArrowUp size={15} />
              </button>
              <button type="button" className="icon" aria-label={m.docCombined.moveDown(d.name)} disabled={i === docs.length - 1} onClick={() => swap(i, i + 1)}>
                <ArrowDown size={15} />
              </button>
            </li>
          ))}
        </ul>
        <label className="combined-canvas">
          <input type="checkbox" checked={withCanvas} disabled={!project.cards.length} onChange={(e) => setWithCanvas(e.target.checked)} />
          {canvas ? m.docCombined.namedCanvas(canvas.name) : m.docCombined.canvas}
        </label>
        {problems.map((p) => (
          <p key={p} className="share-problem" role="alert">
            {p}
          </p>
        ))}
        <footer>
          <button type="button" disabled={busy} onClick={() => ref.current?.close()}>
            {problems.length ? m.doc.close : m.doc.cancel}
          </button>
          <button type="submit" value="send" disabled={busy || !picked.length}>
            <Share size={16} /> {m.docCombined.send}
          </button>
          <button type="submit" className="primary" disabled={busy || !picked.length}>
            <FileDown size={16} /> {busy ? m.docCombined.exporting : m.docCombined.export}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
