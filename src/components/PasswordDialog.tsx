import { LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { passwordAsker } from '../password';
import { m } from '../i18n';

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
          <LockKeyhole size={18} /> {m.homePassword.heading}
        </h2>
        <p>{m.homePassword.protected(request.file)}</p>
        <input name="password" type="password" aria-label={m.homePassword.label} autoComplete="off" autoFocus required aria-invalid={request.wrong} />
        {request.wrong && <p className="wrong">{m.homePassword.wrong}</p>}
        <div className="row">
          <button type="button" onClick={() => finish(null)}>
            {m.home.cancel}
          </button>
          <button type="submit" className="primary">
            {m.homePassword.open}
          </button>
        </div>
      </form>
    </dialog>
  );
}
