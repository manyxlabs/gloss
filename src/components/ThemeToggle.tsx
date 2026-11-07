import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { m } from '../i18n';

/** The theme's switch: a button of its own, or an item in a menu where the header has no room for it. The inline script in index.html applies the saved theme before first paint. */
export function ThemeToggle({ item = false }: { item?: boolean }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const flip = () => {
    document.documentElement.classList.toggle('dark', !dark);
    setDark(!dark);
    try {
      localStorage.setItem('theme', dark ? 'light' : 'dark');
    } catch {
      // Not saved; the theme still applies for this visit.
    }
  };
  const label = dark ? m.theme.useLight : m.theme.useDark;
  const Icon = dark ? Sun : Moon;
  return item ? (
    <button role="menuitem" onClick={flip}>
      <Icon size={16} /> {label}
    </button>
  ) : (
    <button className="icon" onClick={flip} aria-label={label} title={dark ? m.theme.light : m.theme.dark}>
      <Icon size={17} />
    </button>
  );
}
