import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { PERSON, useActivity, useSync } from '../sync/state';
import { m } from '../i18n';

/** The @ being typed just before the caret: up to two words of a name. */
const TYPING = /(?:^|\s)@([\p{L}\p{N}_'.-]*(?: [\p{L}\p{N}_'.-]*)?)$/u;

type Open = { start: number; end: number; names: string[]; index: number; at: { left: number; top: number } };

/** People to mention: whoever has been in this shared project, and whoever is in it now. */
function usePeople() {
  const people = useActivity((s) => s.people);
  const peers = useSync((s) => s.peers);
  return [...new Set([...people.filter((p) => p.id !== PERSON).map((p) => p.name), ...Object.values(peers).map((p) => p.name)].filter((n) => n.trim()))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Suggests names after an @ typed in a field, from the people of a shared project. Arrow keys
 * choose, Enter or Tab puts the name in as `@Name`, and Escape puts the list away. The browser's own
 * undo takes the name out again.
 */
export function MentionSuggest({ field }: { field: RefObject<HTMLTextAreaElement | null> }) {
  const people = usePeople();
  const [open, show] = useState<Open | null>(null);
  // The key handler reads the list as it is now, not as it was when the handler was made.
  const now = useRef<Open | null>(null);
  const pick = useRef<(name: string, o: Open) => void>(null);
  const setOpen = (o: Open | null) => show((now.current = o));

  useEffect(() => {
    const el = field.current;
    if (!el || !people.length) return;
    const look = () => {
      const caret = el.selectionStart;
      const typed = el.selectionEnd === caret ? TYPING.exec(el.value.slice(0, caret)) : null;
      const query = typed?.[1]?.toLowerCase() ?? '';
      const names = typed ? people.filter((n) => n.toLowerCase().startsWith(query) && n.toLowerCase() !== query) : [];
      if (!names.length) return setOpen(null);
      const box = el.getBoundingClientRect();
      const index = now.current ? Math.min(now.current.index, names.length - 1) : 0;
      setOpen({ start: caret - typed![1]!.length - 1, end: caret, names, index, at: { left: box.left, top: box.bottom + 4 } });
    };
    const put = (name: string, o: Open) => {
      el.focus();
      el.setSelectionRange(o.start, o.end);
      // As typing, so the field's own undo and change handling see it.
      if (!document.execCommand('insertText', false, `@${name} `)) {
        el.setRangeText(`@${name} `, o.start, o.end, 'end');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      const o = now.current;
      if (!o || !['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
      e.preventDefault();
      // Taken from the field's own keys too: Escape would close its editor, and Enter save it.
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Tab') put(o.names[o.index]!, o);
      else if (e.key === 'Escape') setOpen(null);
      else setOpen({ ...o, index: (o.index + (e.key === 'ArrowDown' ? 1 : -1) + o.names.length) % o.names.length });
    };
    const away = () => setOpen(null);
    el.addEventListener('input', look);
    el.addEventListener('click', look);
    el.addEventListener('keydown', key, true);
    el.addEventListener('blur', away);
    pick.current = put;
    return () => {
      el.removeEventListener('input', look);
      el.removeEventListener('click', look);
      el.removeEventListener('keydown', key, true);
      el.removeEventListener('blur', away);
    };
  }, [field, people.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  return createPortal(
    <ul className="mentions glass" role="listbox" aria-label={m.homePeople.toMention} style={open.at}>
      {open.names.map((n, i) => (
        <li
          key={n}
          role="option"
          aria-selected={i === open.index}
          // Pressed, the field keeps the focus and its caret.
          onMouseDown={(e) => {
            e.preventDefault();
            pick.current?.(n, open);
          }}
        >
          @{n}
        </li>
      ))}
    </ul>,
    document.body,
  );
}
