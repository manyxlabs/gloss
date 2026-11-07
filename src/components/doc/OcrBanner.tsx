import { ScanText } from 'lucide-react';
import { useState } from 'react';
import { useScanned } from '../../ocr/detect';
import { LANGUAGES, makeSelectable, useOcr, useOcrLanguage } from '../../ocr/ocr';
import type { DocMeta } from '../../types';
import { DocBanner } from './DocBanner';
import { locale, m } from '../../i18n';

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
      <DocBanner label={m.docBanners.ocrLabel} icon={<ScanText size={18} />} actions={<button onClick={job.stop}>{m.doc.cancel}</button>}>
        <p role="status">
          {!job.progress
            ? m.docBanners.ocrPreparing
            : job.pages.length > 1
              ? m.docBanners.ocrReadingOf(job.pages[at - 1]!, at, job.pages.length)
              : m.docBanners.ocrReading(job.pages[at - 1]!)}
        </p>
        <progress max={1} value={job.progress} aria-label={m.docBanners.progress} />
      </DocBanner>
    );
  }
  if (!scanned.length || dismissed === version) return null;
  const all = scanned.length === doc.pages;
  return (
    <DocBanner
      label={m.docBanners.scannedLabel}
      icon={<ScanText size={18} />}
      wide
      onDismiss={() => setDismissed(version)}
      actions={
        <>
          <select aria-label={m.docBanners.ocrLanguage} value={language} onChange={(e) => useOcrLanguage.setState({ language: e.target.value as typeof language })}>
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button className="primary" title={m.docBanners.ocrLocal} onClick={async () => onProblems(await makeSelectable(doc.id, scanned, language))}>
            {m.docBanners.makeSelectable}
          </button>
        </>
      }
    >
      <p>
        {all ? (doc.pages === 1 ? m.docBanners.scanPage : m.docBanners.scanDoc) : m.docBanners.scanSome(new Intl.ListFormat(locale).format(scanned.map(String)), scanned.length)}
      </p>
    </DocBanner>
  );
}
