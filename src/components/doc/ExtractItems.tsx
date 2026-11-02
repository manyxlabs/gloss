import { Download, FileOutput } from 'lucide-react';
import { download } from '../../export';
import { extractPages, pagesPdf } from '../../pdf/extract';
import type { Pane } from '../../store/project';

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
  const several = pages.length > 1;
  return (
    <>
      <button role="menuitem" onClick={() => (onClose(), void extractPages(docId, pages, pane).then(onProblems))}>
        <FileOutput size={16} /> {several ? 'Extract pages' : 'Extract page'} to a new document
      </button>
      <button
        role="menuitem"
        onClick={async () => {
          onClose();
          try {
            const { blob, name } = await pagesPdf(docId, pages);
            download(`${name}.pdf`, blob);
          } catch (err) {
            onProblems([
              `The ${several ? 'pages' : 'page'} could not be downloaded. ${err instanceof Error && /^[A-Z].*\.$/.test(err.message) ? err.message : 'The PDF may be damaged, or in a form Gloss cannot rewrite.'}`,
            ]);
          }
        }}
      >
        <Download size={16} /> Download {several ? 'them' : 'it'} as a PDF
      </button>
    </>
  );
}
