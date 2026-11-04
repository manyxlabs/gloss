import { useState } from 'react';
import { CloudError, fromCloud } from '../cloud';
import { chooseFromDropbox } from '../dropbox';
import { chooseFromDrive } from '../gdrive';

function DriveLogo({ size }: { size: number }) {
  return (
    <svg className="cloud-logo" width={size} height={size} viewBox="0 0 87.3 78" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

function DropboxLogo({ size }: { size: number }) {
  return (
    <svg className="cloud-logo" width={size} height={size} viewBox="0 0 43 40" aria-hidden="true">
      <path
        d="m12.5 0-12.5 8.1 8.7 7 12.5-7.8-8.7-7.3zm-12.5 21.9 12.5 8.2 8.7-7.3-12.5-7.7-8.7 6.8zm21.2.9 8.8 7.3 12.4-8.1-8.6-6.9-12.6 7.7zm21.2-14.7-12.4-8.1-8.8 7.3 12.6 7.8 8.6-7zm-21.1 16.3-8.8 7.3-3.7-2.5v2.8l12.5 7.5 12.5-7.5v-2.8l-3.8 2.5-8.7-7.3z"
        fill="#0061ff"
      />
    </svg>
  );
}

const PROVIDERS = {
  'Google Drive': { Logo: DriveLogo, choose: chooseFromDrive },
  Dropbox: { Logo: DropboxLogo, choose: chooseFromDropbox },
};

/**
 * Picks files in a cloud storage provider's own picker; `add` takes the files downloaded, through the
 * same import as files opened from the computer, with the problems met on the way.
 */
export function CloudPicker({
  provider,
  kind,
  disabled,
  add,
}: {
  provider: keyof typeof PROVIDERS;
  kind: 'icon' | 'text' | 'link';
  disabled?: boolean;
  add: (files: File[], problems: string[]) => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const { Logo, choose } = PROVIDERS[provider];
  return (
    <button
      className={kind === 'text' ? undefined : kind}
      disabled={disabled || busy}
      aria-label={busy ? 'Adding…' : `Add from ${provider}`}
      title={`Add files from your ${provider}`}
      onClick={async () => {
        setBusy(true);
        try {
          const got = await fromCloud(provider, choose);
          if (got) await add(got.files, got.problems);
        } catch (err) {
          await add([], [err instanceof CloudError ? err.message : `Gloss could not open ${provider}. Try again.`]);
          if (!(err instanceof CloudError)) throw err;
        } finally {
          setBusy(false);
        }
      }}
    >
      <Logo size={kind === 'icon' ? 16 : 15} />
      {kind !== 'icon' && (busy ? 'Adding…' : provider)}
    </button>
  );
}
