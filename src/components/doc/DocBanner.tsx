import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import './banners.css';

/** A notice floating over the top of a document's pages, with what can be done about it. */
export function DocBanner({ label, icon, children, actions, onDismiss }: { label: string; icon: ReactNode; children: ReactNode; actions: ReactNode; onDismiss?: () => void }) {
  return (
    <section className="doc-banner" aria-label={label}>
      <span className="doc-banner-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="doc-banner-text">{children}</div>
      <div className="doc-banner-actions">
        {actions}
        {onDismiss && (
          <button className="icon" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
            <X size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
