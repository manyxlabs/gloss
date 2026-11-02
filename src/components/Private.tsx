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
