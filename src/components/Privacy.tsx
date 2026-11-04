import { useEffect } from 'react';
import { Footer } from './Library';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

/** The privacy policy, at /privacy, where Google's consent screen links to it. */
export function Privacy() {
  useEffect(() => {
    document.title = 'Privacy · Gloss';
  }, []);
  return (
    <div className="library field">
      <header className="bar">
        <a className="brand" href="/">
          <Logo />
          Gloss <small>by Manyx Labs</small>
        </a>
        <ThemeToggle />
      </header>
      <main className="wrap">
        <article className="privacy glass">
          <h1>Privacy</h1>
          <p className="fine">Last updated 4 November 2026</p>
          <p>
            Gloss is made by Manyx Labs. It runs in your browser, and has no accounts, no ads and no tracking. We do not sell, rent or share anything about you, and we do not
            analyse how you use Gloss.
          </p>

          <h2>Your documents and notes</h2>
          <p>
            The documents you add, and everything you make with them (highlights, comments, cards, canvases and handwriting), are kept in your browser's own storage (IndexedDB) on
            your device. A few settings, such as the theme, are kept there too. Converting files and reading scanned pages happen on your device.
          </p>

          <h2>Shared projects</h2>
          <p>
            When you share a project, your browser encrypts it before it leaves your device, with a key that is only in the share link. The link's key is in the part of the address
            that browsers never send to a server. Manyx Labs' server, a Cloudflare Worker, stores and relays the encrypted project between the devices that have the link, and
            cannot read it: not the documents, the notes, nor the names of who is there.
          </p>

          <h2>Adding from a link</h2>
          <p>
            When you add a web page or a share link, its address goes to Gloss's server, which fetches the page or file for your browser, because a browser may not read other sites
            itself. The server passes it straight back and keeps neither the address nor what it fetched.
          </p>

          <h2>Google Drive</h2>
          <p>
            When you add from Google Drive, Google asks whether Gloss may open the files you pick. Gloss asks only for the <code>drive.file</code> permission, which reaches nothing
            in your Drive except the files you pick in Google's own picker. Your browser downloads those files straight from Google; they do not pass through Gloss's server. The
            sign in Google gives your browser is kept only in memory until you close or reload Gloss, is never sent to Gloss's server, and lasts at most an hour. You can take the
            permission back at any time at{' '}
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">
              myaccount.google.com/connections
            </a>
            .
          </p>
          <p>
            Gloss's use of information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. The files are used only to show them to you in Gloss, and are never used for advertising, sold, or seen by anyone at Manyx
            Labs.
          </p>

          <h2>Dropbox</h2>
          <p>
            When you add from Dropbox, Dropbox's own chooser opens, and Gloss is given a download link to each file you pick, and nothing else. Your browser downloads the files
            straight from Dropbox; they do not pass through Gloss's server.
          </p>

          <h2>Zotero</h2>
          <p>The Zotero key you enter is kept in this browser and sent only to Zotero.</p>

          <h2>Removing your data</h2>
          <p>
            Deleting a project, or clearing this site's data in your browser, removes what Gloss kept on your device. A shared project's encrypted copy stays on Gloss's server,
            where no one can read it; to have it removed, write to us.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about privacy go to <a href="mailto:manish@manyxlabs.com">manish@manyxlabs.com</a>.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
