import { Link2 } from 'lucide-react';
import { useEffect } from 'react';
import { cancelLinking, useLinking } from '../store/links';
import { useStore } from '../store/project';
import { m } from '../i18n';

/** Says that the next passage picked is the other end of a link, or another place for a comment, until it is picked or cancelled. */
export function LinkBanner() {
  const linking = useLinking((s) => s.linking);
  // Undo can take away the passage a link starts from, or the comment being attached.
  const from = useStore((s) =>
    linking?.kind === 'link' ? s.project?.highlights.some((h) => h.id === linking.from) : linking ? s.project?.comments.some((c) => c.id === linking.commentId) : false,
  );
  const gone = linking && !from;

  // Linking ends with the project it was started in.
  useEffect(() => cancelLinking, []);
  useEffect(() => {
    if (!linking) return;
    if (gone) return cancelLinking();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelLinking();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [linking, gone]);

  if (!linking || gone) return null;
  return (
    <section className="link-banner" aria-label={m.homeLinking.label}>
      <Link2 size={16} aria-hidden="true" />
      <p>{linking.refused ?? (linking.kind === 'link' ? m.homeLinking.link : m.homeLinking.comment)}</p>
      <button onClick={cancelLinking}>{m.home.cancel}</button>
    </section>
  );
}
