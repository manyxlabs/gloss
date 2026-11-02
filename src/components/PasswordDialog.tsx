import { LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { passwordAsker } from '../password';

type Request = { file: string; wrong: boolean; answer: (password: string | null) => void; at: number };

/** Asks for the password of a protected PDF as it is added. */
export function PasswordDialog() {
  const [request, setRequest] = useState<Request | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    passwordAsker.ask = (file, wrong) => new Promise((answer) => setRequest({ file, wrong, answer, at: Date.now() }));
    return () => void (passwordAsker.ask = async () => null);
  }, []);
  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal();
  }, [request]);

  if (!request) return null;
  const finish = (password: string | null) => {
    setRequest(null);
    request.answer(password);
  };
  return (
    <dialog
      key={request.at}
      ref={dialog}
      className="password-dialog"
      aria-labelledby="password-title"
      onCancel={(e) => {
        e.preventDefault();
        finish(null);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish(String(new FormData(e.currentTarget).get('password') ?? ''));
        }}
      >
        <h2 id="password-title">
          <LockKeyhole size={18} /> Password needed
        </h2>
        <p>“{request.file}” is protected. Enter its password to open it.</p>
        <input name="password" type="password" aria-label="Password" autoComplete="off" autoFocus required aria-invalid={request.wrong} />
        {request.wrong && <p className="wrong">That password is not right. Try again.</p>}
        <div className="row">
          <button type="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Open
          </button>
        </div>
      </form>
    </dialog>
  );
}
