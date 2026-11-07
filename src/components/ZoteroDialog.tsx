import { BookOpen, Check, FileText, LogOut, Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addDocs, useStore } from '../store/project';
import type { DocMeta, ZoteroItem } from '../types';
import { byline, connect, disconnect, pdfsOf, savedAccount, search, sendNote, ZoteroError, type ZoteroAccount, type ZoteroResult } from '../zotero';
import { m } from '../i18n';
import { rich } from '../i18n/rich';

const reason = (err: unknown) => (err instanceof ZoteroError ? err.message : m.homeZotero.generic);

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
        <BookOpen size={18} /> {send ? m.homeZotero.sendHeading : m.homeZotero.addHeading}
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
        {rich(m.homeZotero.connectIntro, {
          keys: (s) => (
            <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener noreferrer">
              {s}
            </a>
          ),
          b: (s) => <b>{s}</b>,
        })}
      </p>
      <p className="fine">{m.homeZotero.userIdNote}</p>
      <label className="name-field">
        {m.homeZotero.userId}
        <input name="user" inputMode="numeric" autoComplete="off" required pattern="\d+" title={m.homeZotero.userIdTitle} />
      </label>
      <label className="name-field">
        {m.homeZotero.apiKey}
        <input name="key" type="password" autoComplete="off" required />
      </label>
      {problem && (
        <p className="share-problem" role="alert">
          {problem}
        </p>
      )}
      <footer>
        <button type="button" onClick={close}>
          {m.home.cancel}
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? m.homeZotero.connecting : m.homeZotero.connect}
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
      if (!files.length) return setProblem(m.homeZotero.noPdfStored(r.item.title));
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
          {account.username} · {account.write ? m.homeZotero.readWrite : m.homeZotero.readOnly}
        </span>
        <button className="ghost" onClick={onDisconnect}>
          <LogOut size={15} /> {m.homeZotero.disconnect}
        </button>
      </div>
      <label className="zotero-search">
        <SearchIcon size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label={m.homeZotero.searchLabel}
          placeholder={m.homeZotero.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      {problem && (
        <p className="share-problem" role="alert">
          {problem}
        </p>
      )}
      <ul className="zotero-results" aria-label={m.homeZotero.items} aria-busy={results === null}>
        {results?.length === 0 && <li className="side-empty">{query ? m.homeZotero.noMatch : m.homeZotero.empty}</li>}
        {results?.map((r) => (
          <li key={r.key}>
            <span className="what">
              <span className="title">{r.item.title}</span>
              <span className="by">{byline(r.item) || m.homeZotero.noByline}</span>
            </span>
            {imported.has(r.key) ? (
              <span className="done">
                <Check size={15} /> {m.homeZotero.added}
              </span>
            ) : (
              <button
                disabled={!r.pdf || importing !== null}
                aria-label={m.homeZotero.addItem(r.item.title)}
                title={r.pdf ? m.homeZotero.addTitle : m.homeZotero.noAttachments}
                onClick={() => void add(r)}
              >
                <FileText size={15} /> {importing === r.key ? m.home.adding : r.pdf ? m.home.add : m.homeZotero.noPdf}
              </button>
            )}
          </li>
        ))}
      </ul>
      <footer>
        <button onClick={close}>{m.home.close}</button>
      </footer>
    </>
  );
}

function Send({ account, doc, close }: { account: ZoteroAccount; doc: DocMeta & { zotero: ZoteroItem }; close: () => void }) {
  const [state, setState] = useState<{ busy: true } | { sent: number } | { problem: string } | null>(null);
  return (
    <>
      <p>{m.homeZotero.sendIntro(doc.zotero.title)}</p>
      {state && 'sent' in state && (
        <p role="status" className="zotero-sent">
          <Check size={16} /> {m.homeZotero.sent(state.sent)}
        </p>
      )}
      {state && 'problem' in state && (
        <p className="share-problem" role="alert">
          {state.problem}
        </p>
      )}
      <footer>
        <button onClick={close}>{state && 'sent' in state ? m.home.done : m.home.cancel}</button>
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
          {state && 'busy' in state ? m.homeZotero.sending : m.homeZotero.sendNotes}
        </button>
      </footer>
    </>
  );
}
