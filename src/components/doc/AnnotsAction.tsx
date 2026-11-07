import { Highlighter } from 'lucide-react';
import './banners.css';
import { useState } from 'react';
import { useAsk } from '../../annots/ask';
import { bringIn } from '../../annots/bring';
import { summary } from '../../annots/read';
import { useForeign } from '../../annots/useForeign';
import { useStore } from '../../store/project';
import { m } from '../../i18n';

/** "Bring in this PDF's annotations", for a document in the project whose PDF holds some from another app. */
export function AnnotsAction({ docId }: { docId: string }) {
  const doc = useStore((s) => s.project?.docs.find((d) => d.id === docId));
  const asking = useAsk((s) => s.docs.includes(docId));
  const found = useForeign(docId, doc?.password, doc?.file);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const what = found && summary(found);
  if (asking || (!what && !problems.length)) return null;
  return (
    <div className="side-note annots-action">
      {what && <p>{m.docBanners.annotsFound(what)}</p>}
      {problems.map((p) => (
        <p key={p} role="alert">
          {p}
        </p>
      ))}
      {what && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setProblems(await bringIn(docId));
            setBusy(false);
          }}
        >
          <Highlighter size={15} /> {busy ? m.docBanners.bringingThem : m.docBanners.bringInAnnots}
        </button>
      )}
    </div>
  );
}
