import { ScanText } from 'lucide-react';
import { useScanned } from '../../ocr/detect';
import { makeSelectable, useOcr } from '../../ocr/ocr';
import { useStore } from '../../store/project';
import { m } from '../../i18n';

/** A page menu's "Make text selectable", for those of its pages that are scans; the document's banner shows the progress. */
export function OcrMenuItem({ docId, pages, onClose, onProblems }: { docId: string; pages: number[]; onClose: () => void; onProblems: (problems: string[]) => void }) {
  const doc = useStore((s) => s.project?.docs.find((d) => d.id === docId));
  const scanned = useScanned(docId, doc?.password, doc?.file).filter((n) => pages.includes(n));
  const busy = useOcr((s) => !!s[docId]);
  if (!scanned.length) return null;
  return (
    <button role="menuitem" disabled={busy} onClick={() => (onClose(), void makeSelectable(docId, scanned).then(onProblems))}>
      <ScanText size={16} /> {m.docBanners.makeSelectable}
    </button>
  );
}
