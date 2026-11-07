import { Languages } from 'lucide-react';
import { choose, lang, LANGS, m } from '../i18n';
import { isLang, NAMES } from '../i18n/langs';

/**
 * The language switch, each language named in its own script. A native select: it fits a phone's
 * header, works from the keyboard, and opens the system's own list on a touch screen.
 */
export function LanguageSelect({ item = false }: { item?: boolean }) {
  return (
    <label className={item ? 'language item' : 'language'} title={m.language}>
      <Languages size={16} aria-hidden="true" />
      <select aria-label={m.language} value={lang} onChange={(e) => isLang(e.target.value) && choose(e.target.value)}>
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
