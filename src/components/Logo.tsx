/**
 * A page with a highlight beside two cards: the app in one glance. Same drawing as the favicon and the
 * app icons. A neutral tile, as Manyx Labs keeps colour off its icons; the highlight is the emerald mark.
 */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="rgb(var(--fg) / 0.05)" stroke="rgb(var(--fg) / 0.1)" />
      <rect x="6.5" y="7" width="9" height="18" rx="1.8" fill="rgb(var(--fg))" />
      <rect x="8" y="12" width="6" height="2.6" rx="1" fill="rgb(var(--accent))" />
      <rect x="18" y="8.5" width="8" height="6" rx="1.6" fill="rgb(var(--fg))" opacity="0.55" />
      <rect x="18" y="17.5" width="8" height="6" rx="1.6" fill="rgb(var(--fg))" opacity="0.3" />
    </svg>
  );
}
