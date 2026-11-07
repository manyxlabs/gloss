import { Download, FileOutput } from 'lucide-react';
import { download } from '../../export';
import { extractPages, pagesPdf } from '../../pdf/extract';
import { ReaderError } from '../../pdf/pdfjs';
import type { Pane } from '../../store/project';
import { m } from '../../i18n';

/** A page menu's ways to take its pages out: as a new document of the project, with the marks on them, or as a PDF to download. */
export function ExtractItems({
  docId,
  pages,
  pane,
  onClose,
  onProblems,
}: {
  docId: string;
  pages: number[];
  pane: Pane;
  onClose: () => void;
  onProblems: (problems: string[]) => void;
}) {
  return (
    <>
      <button role="menuitem" onClick={() => (onClose(), void extractPages(docId, pages, pane).then(onProblems))}>
        <FileOutput size={16} /> {m.docPages.extract(pages.length)}
      </button>
      <button
        role="menuitem"
        onClick={async () => {
          onClose();
          try {
            const { blob, name } = await pagesPdf(docId, pages);
            download(`${name}.pdf`, blob);
          } catch (err) {
            onProblems([`${m.docPages.downloadFailed(pages.length)} ${err instanceof ReaderError ? err.message : m.enginePdf.notRewritten}`]);
          }
        }}
      >
        <Download size={16} /> {m.docPages.download(pages.length)}
      </button>
    </>
  );
}
