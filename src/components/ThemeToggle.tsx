import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'gloss:theme';

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be blocked; fall back to the system setting.
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme's switch: a button of its own, or an item in a menu where the header has no room for it. */
export function ThemeToggle({ item = false }: { item?: boolean }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? initialTheme());
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not saved; the theme still applies for this visit.
    }
  };
  const label = theme === 'dark' ? 'Use light theme' : 'Use dark theme';
  const Icon = theme === 'dark' ? Sun : Moon;
  return item ? (
    <button role="menuitem" onClick={flip}>
      <Icon size={16} /> {label}
    </button>
  ) : (
    <button className="icon" onClick={flip} aria-label={label} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
      <Icon size={17} />
    </button>
  );
}
