import { Highlighter } from 'lucide-react';
import { useEffect, useState } from 'react';
import { asked, useAsk } from '../../annots/ask';
import { bringIn } from '../../annots/bring';
import { summary } from '../../annots/read';
import { useForeign } from '../../annots/useForeign';
import type { DocMeta } from '../../types';
import { DocBanner } from './DocBanner';

/** Asks, once a PDF is added, whether to bring in the highlights, notes and ink another app left in it. */
export function AnnotsBanner({ doc, onProblems }: { doc: DocMeta; onProblems: (problems: string[]) => void }) {
  const asking = useAsk((s) => s.docs.includes(doc.id));
  const found = useForeign(doc.id, doc.password, doc.file);
  const [busy, setBusy] = useState(false);
  const what = found && summary(found);
  useEffect(() => {
    if (asking && found && !what) asked(doc.id);
  }, [asking, found, what, doc.id]);

  if (!asking || !what) return null;
  const bring = async () => {
    setBusy(true);
    const problems = await bringIn(doc.id);
    setBusy(false);
    asked(doc.id);
    onProblems(problems);
  };
  return (
    <DocBanner
      label="Annotations from another app"
      icon={<Highlighter size={18} />}
      wide
      actions={
        <>
          <button disabled={busy} onClick={() => asked(doc.id)}>
            Keep as is
          </button>
          <button className="primary" disabled={busy} onClick={() => void bring()}>
            Bring them in
          </button>
        </>
      }
    >
      <p role={busy ? 'status' : undefined}>{busy ? 'Bringing in the annotations…' : `This PDF has ${what} from another app. Bring them in?`}</p>
    </DocBanner>
  );
}
