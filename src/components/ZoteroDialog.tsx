import { BookOpen, Check, FileText, LogOut, Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addDocs, useStore } from '../store/project';
import type { DocMeta, ZoteroItem } from '../types';
import { byline, connect, disconnect, pdfsOf, savedAccount, search, sendNote, ZoteroError, type ZoteroAccount, type ZoteroResult } from '../zotero';

const reason = (err: unknown) => (err instanceof ZoteroError ? err.message : 'Something went wrong talking to Zotero.');

/**
 * Zotero, with the reader's own key: connecting, then browsing and searching their library to
 * import PDFs, or with `send` sending a document's notes back to its item.
 */
export function ZoteroDialog({ send, onClose, onProblems }: { send?: DocMeta & { zotero: ZoteroItem }; onClose: () => void; onProblems: (problems: string[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [account, setAccount] = useState(savedAccount);
  useEffect(() => ref.current?.showModal(), []);
  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} className="sheet glass zotero-dialog" aria-labelledby="zotero-h" onClose={onClose}>
      <h2 id="zotero-h">
        <BookOpen size={18} /> {send ? 'Send notes to Zotero' : 'Add from Zotero'}
      </h2>
      {!account ? (
        <Connect onConnected={setAccount} close={close} />
      ) : send ? (
        <Send account={account} doc={send} close={close} />
      ) : (
        <Library account={account} onImported={(problems) => (onProblems(problems), close())} onDisconnect={() => (disconnect(), setAccount(null))} close={close} />
      )}
    </dialog>
  );
}

function Connect({ onConnected, close }: { onConnected: (a: ZoteroAccount) => void; close: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setProblem(null);
        try {
          onConnected(await connect(String(form.get('user')), String(form.get('key')).trim()));
        } catch (err) {
          setProblem(reason(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Gloss talks to Zotero with a key of your own. Make one at{' '}
        <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener noreferrer">
          zotero.org/settings/keys
        </a>
        : press <b>Create new private key</b> and allow access to your library. Read only is enough to import; to send notes back, allow write access too.
      </p>
      <p className="fine">Your user ID is on the same page, as “Your user ID for use in API calls”. The key is kept only in this browser and sent only to Zotero.</p>
      <label className="name-field">
        User ID
        <input name="user" inputMode="numeric" autoComplete="off" required pattern="\d+" title="Your user ID is a number" />
      </label>
      <label className="name-field">
        API key
        <input name="key" type="password" autoComplete="off" required />
      </label>
      {problem && (
        <p className="share-problem" role="alert">
          {problem}
        </p>
      )}
      <footer>
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </form>
  );
}

function Library({ account, onImported, onDisconnect, close }: { account: ZoteroAccount; onImported: (problems: string[]) => void; onDisconnect: () => void; close: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ZoteroResult[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const docs = useStore((s) => s.project?.docs);
  const imported = new Set(docs?.flatMap((d) => (d.zotero ? [d.zotero.key] : [])));

  // Typing waits a moment before asking Zotero, which limits how often it may be asked.
  useEffect(() => {
    let stale = false;
    const timer = setTimeout(
      () =>
        search(account, query).then(
          (r) => !stale && (setResults(r), setProblem(null)),
          (err: unknown) => !stale && setProblem(reason(err)),
        ),
      query ? 350 : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [account, query]);

  const add = async (r: ZoteroResult) => {
    setImporting(r.key);
    setProblem(null);
    try {
      const files = await pdfsOf(account, r);
      if (!files.length) return setProblem(`“${r.item.title}” has no PDF stored in Zotero. Attach one there, or add a linked file’s PDF from the computer.`);
      onImported(await addDocs(files, {}, { zotero: r.item }));
    } catch (err) {
      setProblem(reason(err));
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <div className="zotero-account">
        <span>
          {account.username} · {account.write ? 'read and write' : 'read only'}
        </span>
        <button className="ghost" onClick={onDisconnect}>
          <LogOut size={15} /> Disconnect
        </button>
      </div>
      <label className="zotero-search">
        <SearchIcon size={16} aria-hidden="true" />
        <input type="search" aria-label="Search your Zotero library" placeholder="Title, author or year" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      {problem && (
        <p className="share-problem" role="alert">
          {problem}
        </p>
      )}
      <ul className="zotero-results" aria-label="Zotero items" aria-busy={results === null}>
        {results?.length === 0 && <li className="side-empty">{query ? 'Nothing in your library matches.' : 'Your library is empty.'}</li>}
        {results?.map((r) => (
          <li key={r.key}>
            <span className="what">
              <span className="title">{r.item.title}</span>
              <span className="by">{byline(r.item) || 'No author or year'}</span>
            </span>
            {imported.has(r.key) ? (
              <span className="done">
                <Check size={15} /> Added
              </span>
            ) : (
              <button
                disabled={!r.pdf || importing !== null}
                aria-label={`Add ${r.item.title}`}
                title={r.pdf ? 'Add its PDF to this project' : 'It has no attachments'}
                onClick={() => void add(r)}
              >
                <FileText size={15} /> {importing === r.key ? 'Adding…' : r.pdf ? 'Add' : 'No PDF'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <footer>
        <button onClick={close}>Close</button>
      </footer>
    </>
  );
}

function Send({ account, doc, close }: { account: ZoteroAccount; doc: DocMeta & { zotero: ZoteroItem }; close: () => void }) {
  const [state, setState] = useState<{ busy: true } | { sent: number } | { problem: string } | null>(null);
  return (
    <>
      <p>Adds a note under “{doc.zotero.title}” in your Zotero library, with this document’s highlights, figures and comments in page order. Sending again adds another note.</p>
      {state && 'sent' in state && (
        <p role="status" className="zotero-sent">
          <Check size={16} /> Sent {state.sent} {state.sent === 1 ? 'highlight' : 'highlights'} to Zotero.
        </p>
      )}
      {state && 'problem' in state && (
        <p className="share-problem" role="alert">
          {state.problem}
        </p>
      )}
      <footer>
        <button onClick={close}>{state && 'sent' in state ? 'Done' : 'Cancel'}</button>
        <button
          className="primary"
          disabled={!!state && 'busy' in state}
          onClick={async () => {
            setState({ busy: true });
            try {
              setState({ sent: await sendNote(account, useStore.getState().project!, doc) });
            } catch (err) {
              setState({ problem: reason(err) });
            }
          }}
        >
          {state && 'busy' in state ? 'Sending…' : 'Send notes'}
        </button>
      </footer>
    </>
  );
}
