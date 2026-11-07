/** A page with a highlight beside two cards: the app in one glance. Same drawing as the favicon. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--accent))" />
      <rect x="6.5" y="7" width="9" height="18" rx="1.8" fill="#fff" />
      <rect x="8" y="12" width="6" height="2.6" rx="1" fill="#fde047" />
      <rect x="18" y="8.5" width="8" height="6" rx="1.6" fill="#fff" opacity="0.9" />
      <rect x="18" y="17.5" width="8" height="6" rx="1.6" fill="#fff" opacity="0.6" />
    </svg>
  );
}
