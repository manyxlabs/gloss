import { useEffect } from 'react';
import { Footer } from './Library';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelect } from './LanguageSelect';
import { href, m } from '../i18n';
import { rich } from '../i18n/rich';
import { useMotion } from '../motion';

/** The privacy policy, at /privacy, where Google's consent screen links to it. */
export function Privacy() {
  useMotion();
  useEffect(() => {
    document.title = m.meta.privacyTitle;
  }, []);
  return (
    <div className="library field">
      <div className="progress-bar" aria-hidden="true" />
      <header className="bar">
        <a className="brand" href={href('')}>
          <Logo />
          Gloss <small>{m.common.byManyx}</small>
        </a>
        <LanguageSelect />
        <ThemeToggle />
      </header>
      <main className="wrap">
        <article className="privacy glass reveal">
          <h1>{m.privacy.heading}</h1>
          <p className="fine">{m.privacy.updated}</p>
          {m.privacy.prevails && (
            <p className="fine">
              {rich(m.privacy.prevails, {
                en: (s) => (
                  <a href="/privacy" hrefLang="en">
                    {s}
                  </a>
                ),
              })}
            </p>
          )}
          <p>{m.privacy.intro}</p>

          <h2>{m.privacy.docsHeading}</h2>
          <p>{m.privacy.docs}</p>

          <h2>{m.privacy.sharedHeading}</h2>
          <p>{m.privacy.shared}</p>

          <h2>{m.privacy.linkHeading}</h2>
          <p>{m.privacy.link}</p>

          <h2>{m.privacy.driveHeading}</h2>
          <p>
            {rich(m.privacy.drive, {
              code: (s) => <code>{s}</code>,
              connections: (s) => (
                <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">
                  {s}
                </a>
              ),
            })}
          </p>
          <p>
            {rich(m.privacy.driveUse, {
              policy: (s) => (
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
                  {s}
                </a>
              ),
            })}
          </p>

          <h2>{m.privacy.dropboxHeading}</h2>
          <p>{m.privacy.dropbox}</p>

          <h2>{m.privacy.zoteroHeading}</h2>
          <p>{m.privacy.zotero}</p>

          <h2>{m.privacy.removingHeading}</h2>
          <p>{m.privacy.removing}</p>

          <h2>{m.privacy.contactHeading}</h2>
          <p>{rich(m.privacy.contact, { mail: (s) => <a href="mailto:manish@manyxlabs.com">{s}</a> })}</p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
