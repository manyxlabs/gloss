import { ScanText } from 'lucide-react';
import { useState } from 'react';
import { useScanned } from '../../ocr/detect';
import { LANGUAGES, makeSelectable, pagesNamed, useOcr, useOcrLanguage } from '../../ocr/ocr';
import type { DocMeta } from '../../types';
import { DocBanner } from './DocBanner';

/** Offers to recognise the text of a document's scanned pages, and shows how far it has got. */
export function OcrBanner({ doc, onProblems }: { doc: DocMeta; onProblems: (problems: string[]) => void }) {
  const scanned = useScanned(doc.id, doc.password, doc.file);
  const job = useOcr((s) => s[doc.id]);
  const language = useOcrLanguage((s) => s.language);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const version = `${doc.id}@${doc.file}`;

  if (job) {
    const at = Math.min(job.pages.length, Math.floor(job.progress * job.pages.length) + 1);
    return (
      <DocBanner label="Making text selectable" icon={<ScanText size={18} />} actions={<button onClick={job.stop}>Cancel</button>}>
        <p role="status">
          {job.progress ? `Reading text on page ${job.pages[at - 1]}` : 'Getting text recognition ready'}
          {job.pages.length > 1 && job.progress ? ` (${at} of ${job.pages.length})` : ''}…
        </p>
        <progress max={1} value={job.progress} aria-label="Progress" />
      </DocBanner>
    );
  }
  if (!scanned.length || dismissed === version) return null;
  const all = scanned.length === doc.pages;
  return (
    <DocBanner
      label="Scanned pages"
      icon={<ScanText size={18} />}
      onDismiss={() => setDismissed(version)}
      actions={
        <>
          <select aria-label="Language of the text" value={language} onChange={(e) => useOcrLanguage.setState({ language: e.target.value as typeof language })}>
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button
            className="primary"
            title="The text is read on this device; nothing is uploaded"
            onClick={async () => onProblems(await makeSelectable(doc.id, scanned, language))}
          >
            Make text selectable
          </button>
        </>
      }
    >
      <p>
        {all
          ? doc.pages === 1
            ? 'This page is a scan'
            : 'This document is a scan'
          : `${pagesNamed(scanned).replace(/^p/, 'P')} ${scanned.length === 1 ? 'is a scan' : 'are scans'}`}
        : its text cannot be selected or searched yet.
      </p>
    </DocBanner>
  );
}
