import { Lock, LockOpen } from 'lucide-react';
import { privateWarning } from '../store/privacy';
import { useStore } from '../store/project';

/**
 * Turns "Only on this device" on or off for a document or a canvas. In a shared project, turning it
 * on asks first, as it takes the thing off everyone else's devices.
 */
export function PrivateSwitch({ on, disabled, what, note, onChange }: { on: boolean; disabled?: boolean; what: string; note: string; onChange: (on: boolean) => void }) {
  return (
    <div className="private-switch">
      <button
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => {
          const shared = !!useStore.getState().project?.sync;
          if (!on && shared && !confirm(privateWarning(what))) return;
          onChange(!on);
        }}
      >
        {on ? <Lock size={15} /> : <LockOpen size={15} />} Only on this device
        <i aria-hidden="true" />
      </button>
      <p>{note}</p>
    </div>
  );
}

/** The same, as an icon in a toolbar, for the document on show. */
export function PrivateToggle({ on, what, onChange }: { on: boolean; what: string; onChange: (on: boolean) => void }) {
  return (
    <button
      className="icon"
      aria-label="Only on this device"
      aria-pressed={on}
      title={
        on
          ? 'Only on this device: never sent to the others in a shared project. Press to share it again.'
          : 'Keep on this device only: in a shared project it and everything on it are never sent, and the others’ copies are removed.'
      }
      onClick={() => {
        if (!on && useStore.getState().project?.sync && !confirm(privateWarning(what))) return;
        onChange(!on);
      }}
    >
      {on ? <Lock size={16} /> : <LockOpen size={16} />}
    </button>
  );
}
